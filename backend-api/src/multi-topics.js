import pg from 'pg';

const { Pool } = pg;
const pools = new Map();

function getPool(env) {
  const connectionString = env.DATABASE_URL || env.HYPERDRIVE?.connectionString;
  if (!connectionString) throw new Error('Missing required DATABASE_URL');
  if (!pools.has(connectionString)) {
    const ssl = String(env.DATABASE_SSL || 'false').toLowerCase() === 'true'
      ? { rejectUnauthorized: false }
      : undefined;
    pools.set(connectionString, new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: Number(env.DB_CONNECT_TIMEOUT_MS || 5000),
      statement_timeout: Number(env.DB_QUERY_TIMEOUT_MS || 15000),
      application_name: 'bdg-content-taxonomy-v1240',
      ssl,
    }));
  }
  return pools.get(connectionString);
}

async function q(env, sql, params = []) {
  return getPool(env).query(sql, params);
}

async function transaction(env, work) {
  const client = await getPool(env).connect();
  try {
    await client.query('BEGIN');
    const result = await work((sql, params = []) => client.query(sql, params));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function ints(value) {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(/[\s,]+/);
  return [...new Set(raw.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0))];
}

function slugs(value) {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(/[\s,]+/);
  return [...new Set(raw.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))];
}

function slugify(value, fallback = 'item') {
  const slug = String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
  return slug || fallback;
}

function safeColor(value) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : '#1677ff';
}

function hasOwn(body, key) {
  return Boolean(body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, key));
}

function hasGuideTopicPayload(body) {
  return body && typeof body === 'object' && (
    hasOwn(body, 'topic_ids')
    || hasOwn(body, 'topic_slugs')
    || hasOwn(body, 'primary_topic_id')
    || hasOwn(body, 'category_id')
  );
}

function entityFromPayload(payload, kind) {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload.find((row) => row && row.id) || null;
  if (payload.id) return payload;
  const singular = payload[kind];
  if (singular?.id) return singular;
  const collection = payload[kind === 'guide' ? 'guides' : 'faqs'];
  if (Array.isArray(collection)) return collection.find((row) => row && row.id) || null;
  return null;
}

function jsonResponseLike(response, payload) {
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function readJson(response) {
  try { return await response.clone().json(); }
  catch { return null; }
}

async function resolveSelectedCategories(run, scope, body) {
  const selectedIds = ints(body.topic_ids);
  const primaryId = Number(body.primary_topic_id || body.category_id || 0) || null;
  if (primaryId && !selectedIds.includes(primaryId)) selectedIds.unshift(primaryId);
  const selectedSlugs = slugs(body.topic_slugs);

  const params = [scope.tenant_id, scope.platform_id];
  const clauses = [];
  if (selectedIds.length) {
    params.push(selectedIds);
    clauses.push(`id=ANY($${params.length}::int[])`);
  }
  if (selectedSlugs.length) {
    params.push(selectedSlugs);
    clauses.push(`lower(slug)=ANY($${params.length}::text[])`);
  }
  if (!clauses.length) return { categories: [], primaryId: null };

  const rows = (await run(
    `SELECT id,name,slug,icon FROM categories
     WHERE tenant_id=$1 AND platform_id=$2 AND deleted_at IS NULL
       AND (${clauses.join(' OR ')})
     ORDER BY id ASC`,
    params,
  )).rows;

  const resolvedIds = new Set(rows.map((row) => Number(row.id)));
  for (const requested of selectedIds) {
    if (!resolvedIds.has(requested)) {
      const error = new Error(`Topic ${requested} does not belong to this platform`);
      error.status = 400;
      error.code = 'TOPIC_SCOPE_INVALID';
      throw error;
    }
  }
  const foundSlugs = new Set(rows.map((row) => String(row.slug || '').toLowerCase()));
  for (const requested of selectedSlugs) {
    if (!foundSlugs.has(requested)) {
      const error = new Error(`Topic slug "${requested}" does not belong to this platform`);
      error.status = 400;
      error.code = 'TOPIC_SCOPE_INVALID';
      throw error;
    }
  }

  let resolvedPrimary = primaryId;
  if (!resolvedPrimary && selectedSlugs.length) {
    const bySlug = rows.find((row) => String(row.slug || '').toLowerCase() === selectedSlugs[0]);
    resolvedPrimary = bySlug ? Number(bySlug.id) : null;
  }
  if (!resolvedPrimary && rows.length) resolvedPrimary = Number(rows[0].id);
  return { categories: rows, primaryId: resolvedPrimary };
}

// v1.24: multiple Topics are a Guide-only feature. FAQ uses exactly one topic.
export async function syncTopicsFromResponse(response, env, kind, body) {
  if (kind !== 'guide' || !response?.ok || !hasGuideTopicPayload(body)) return response;
  const payload = await readJson(response);
  const entity = entityFromPayload(payload, kind);
  const entityId = Number(entity?.id || 0);
  if (!entityId) return response;

  await transaction(env, async (run) => {
    const scope = (await run(
      'SELECT id,tenant_id,platform_id FROM guides WHERE id=$1 LIMIT 1',
      [entityId],
    )).rows[0];
    if (!scope?.tenant_id || !scope?.platform_id) return;

    const { categories, primaryId } = await resolveSelectedCategories(run, scope, body);
    await run('DELETE FROM guide_topics WHERE guide_id=$1', [entityId]);
    for (let index = 0; index < categories.length; index += 1) {
      const category = categories[index];
      await run(
        `INSERT INTO guide_topics(tenant_id,platform_id,guide_id,category_id,is_primary,sort_order,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,NOW())`,
        [scope.tenant_id, scope.platform_id, entityId, Number(category.id), Number(category.id) === primaryId, Number(category.id) === primaryId ? 0 : index + 1],
      );
    }
    await run(
      'UPDATE guides SET category_id=$1,updated_at=NOW() WHERE id=$2 AND tenant_id=$3 AND platform_id=$4',
      [primaryId, entityId, scope.tenant_id, scope.platform_id],
    );
  });

  return response;
}

async function guideTopicMap(env, ids) {
  if (!ids.length) return new Map();
  const rows = (await q(env,
    `SELECT gt.guide_id AS entity_id,c.id,c.name,c.slug,c.icon,gt.is_primary,gt.sort_order
     FROM guide_topics gt
     JOIN categories c ON c.id=gt.category_id
       AND c.tenant_id=gt.tenant_id AND c.platform_id=gt.platform_id
     WHERE gt.guide_id=ANY($1::int[]) AND c.deleted_at IS NULL
     ORDER BY gt.guide_id,gt.is_primary DESC,gt.sort_order ASC,c.id ASC`,
    [ids],
  )).rows;
  const map = new Map();
  for (const row of rows) {
    const key = Number(row.entity_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      id: Number(row.id),
      name: row.name || '',
      slug: row.slug || '',
      icon: row.icon || '',
      is_primary: row.is_primary === true,
    });
  }
  return map;
}

async function faqTopicMap(env, ids) {
  if (!ids.length) return new Map();
  const rows = (await q(env,
    `SELECT f.id AS entity_id,f.slug AS faq_slug,f.topic_id,c.id,c.name,c.slug,c.icon
     FROM faqs f
     LEFT JOIN categories c ON c.id=f.topic_id
       AND c.tenant_id=f.tenant_id AND c.platform_id=f.platform_id AND c.deleted_at IS NULL
     WHERE f.id=ANY($1::int[])`,
    [ids],
  )).rows;
  return new Map(rows.map((row) => [Number(row.entity_id), {
    faq_slug: row.faq_slug || '',
    topic: row.id ? {
      id: Number(row.id),
      name: row.name || '',
      slug: row.slug || '',
      icon: row.icon || '',
      is_primary: true,
    } : null,
  }]));
}

function collectRows(payload, kind) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (payload.id) return [payload];
  const singular = payload[kind];
  if (singular?.id) return [singular];
  const collection = payload[kind === 'guide' ? 'guides' : 'faqs'];
  return Array.isArray(collection) ? collection : [];
}

function replaceRows(payload, kind, decorated) {
  if (Array.isArray(payload)) return payload.map((row) => decorated.get(Number(row?.id)) || row);
  if (payload?.id) return decorated.get(Number(payload.id)) || payload;
  if (payload?.[kind]?.id) return { ...payload, [kind]: decorated.get(Number(payload[kind].id)) || payload[kind] };
  const key = kind === 'guide' ? 'guides' : 'faqs';
  if (Array.isArray(payload?.[key])) return { ...payload, [key]: payload[key].map((row) => decorated.get(Number(row?.id)) || row) };
  return payload;
}

export async function enrichTopicsResponse(response, env, kind) {
  if (!response?.ok) return response;
  const payload = await readJson(response);
  if (!payload) return response;
  const rows = collectRows(payload, kind);
  const ids = [...new Set(rows.map((row) => Number(row?.id || 0)).filter(Boolean))];
  if (!ids.length) return response;

  if (kind === 'faq') {
    const map = await faqTopicMap(env, ids);
    const decorated = new Map(rows.map((row) => {
      const info = map.get(Number(row.id)) || { faq_slug: '', topic: null };
      const effectiveTopic = info.topic || null;
      return [Number(row.id), {
        ...row,
        slug: info.faq_slug || row.slug || '',
        topic_id: effectiveTopic?.id || null,
        primary_topic_id: effectiveTopic?.id || null,
        topic_ids: effectiveTopic ? [effectiveTopic.id] : [],
        topics: effectiveTopic ? [effectiveTopic] : [],
        ...(effectiveTopic ? { topic: effectiveTopic.name, category: effectiveTopic.name } : {}),
      }];
    }));
    return jsonResponseLike(response, replaceRows(payload, kind, decorated));
  }

  const map = await guideTopicMap(env, ids);
  const decorated = new Map(rows.map((row) => {
    const fallback = [];
    if (!map.get(Number(row.id))?.length && row.category_id) {
      fallback.push({
        id: Number(row.category_id),
        name: row.category_name || row.category || '',
        slug: row.category_slug || '',
        icon: row.category_icon || '',
        is_primary: true,
      });
    }
    const effective = map.get(Number(row.id))?.length ? map.get(Number(row.id)) : fallback;
    const primary = effective.find((topic) => topic.is_primary) || effective[0] || null;
    return [Number(row.id), {
      ...row,
      topics: effective,
      topic_ids: effective.map((topic) => Number(topic.id)),
      topic_slugs: effective.map((topic) => topic.slug).filter(Boolean),
      primary_topic_id: primary ? Number(primary.id) : null,
    }];
  }));
  return jsonResponseLike(response, replaceRows(payload, kind, decorated));
}

async function validateTagIds(run, scope, value) {
  const ids = ints(value);
  if (!ids.length) return [];
  const rows = (await run(
    `SELECT id,name,slug,color,status,sort_order
     FROM content_tags
     WHERE tenant_id=$1 AND platform_id=$2 AND deleted_at IS NULL AND id=ANY($3::int[])
     ORDER BY sort_order ASC,id ASC`,
    [scope.tenant_id, scope.platform_id, ids],
  )).rows;
  const found = new Set(rows.map((row) => Number(row.id)));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    const error = new Error(`Tag ${missing[0]} does not belong to this platform`);
    error.status = 400;
    error.code = 'TAG_SCOPE_INVALID';
    throw error;
  }
  return rows;
}

async function syncTags(run, scope, kind, entityId, body) {
  if (!hasOwn(body, 'tag_ids')) return;
  const rows = await validateTagIds(run, scope, body.tag_ids);
  const table = kind === 'guide' ? 'guide_tags' : 'faq_tags';
  const fk = kind === 'guide' ? 'guide_id' : 'faq_id';
  await run(`DELETE FROM ${table} WHERE ${fk}=$1`, [entityId]);
  for (let index = 0; index < rows.length; index += 1) {
    await run(
      `INSERT INTO ${table}(tenant_id,platform_id,${fk},tag_id,sort_order,created_at)
       VALUES($1,$2,$3,$4,$5,NOW())`,
      [scope.tenant_id, scope.platform_id, entityId, Number(rows[index].id), index],
    );
  }
}

async function syncFaqTopic(run, scope, faqId, body) {
  const hasTopic = hasOwn(body, 'topic_id') || hasOwn(body, 'primary_topic_id') || hasOwn(body, 'category_id');
  if (!hasTopic) return;
  const raw = body.topic_id ?? body.primary_topic_id ?? body.category_id;
  const topicId = raw ? Number(raw) : null;
  let topic = null;
  if (topicId) {
    topic = (await run(
      `SELECT id,name,slug,icon FROM categories
       WHERE id=$1 AND tenant_id=$2 AND platform_id=$3 AND deleted_at IS NULL LIMIT 1`,
      [topicId, scope.tenant_id, scope.platform_id],
    )).rows[0];
    if (!topic) {
      const error = new Error(`Topic ${topicId} does not belong to this platform`);
      error.status = 400;
      error.code = 'TOPIC_SCOPE_INVALID';
      throw error;
    }
  }
  await run(
    `UPDATE faqs SET topic_id=$1,topic=$2,updated_at=NOW()
     WHERE id=$3 AND tenant_id=$4 AND platform_id=$5`,
    [topic ? Number(topic.id) : null, topic?.name || 'General', faqId, scope.tenant_id, scope.platform_id],
  );
  // Keep the v1.23 join table as a one-row compatibility mirror only.
  await run('DELETE FROM faq_topics WHERE faq_id=$1', [faqId]);
  if (topic) {
    await run(
      `INSERT INTO faq_topics(tenant_id,platform_id,faq_id,category_id,is_primary,sort_order,updated_at)
       VALUES($1,$2,$3,$4,TRUE,0,NOW())`,
      [scope.tenant_id, scope.platform_id, faqId, Number(topic.id)],
    );
  }
}

async function updateFaqSlug(run, scope, faqId, body) {
  if (!hasOwn(body, 'slug')) return;
  const requested = String(body.slug || '').trim();
  if (!requested) return; // Blank never erases an already-generated stable slug.
  const slug = slugify(requested, `faq-${faqId}`);
  const conflict = (await run(
    `SELECT id FROM faqs
     WHERE tenant_id=$1 AND platform_id=$2 AND slug=$3 AND id<>$4 AND deleted_at IS NULL LIMIT 1`,
    [scope.tenant_id, scope.platform_id, slug, faqId],
  )).rows[0];
  if (conflict) {
    const error = new Error(`FAQ slug "${slug}" is already in use on this platform`);
    error.status = 409;
    error.code = 'FAQ_SLUG_CONFLICT';
    throw error;
  }
  await run(
    'UPDATE faqs SET slug=$1,updated_at=NOW() WHERE id=$2 AND tenant_id=$3 AND platform_id=$4',
    [slug, faqId, scope.tenant_id, scope.platform_id],
  );
}

export async function syncContentTaxonomyFromResponse(response, env, kind, body = {}) {
  if (!response?.ok) return response;
  const payload = await readJson(response);
  const entity = entityFromPayload(payload, kind);
  const entityId = Number(entity?.id || 0);
  if (!entityId) return response;
  const table = kind === 'guide' ? 'guides' : 'faqs';

  await transaction(env, async (run) => {
    const scope = (await run(
      `SELECT id,tenant_id,platform_id FROM ${table} WHERE id=$1 LIMIT 1`,
      [entityId],
    )).rows[0];
    if (!scope?.tenant_id || !scope?.platform_id) return;
    if (kind === 'faq') {
      await syncFaqTopic(run, scope, entityId, body);
      await updateFaqSlug(run, scope, entityId, body);
    }
    await syncTags(run, scope, kind, entityId, body);
  });
  return response;
}

async function tagMap(env, kind, ids) {
  if (!ids.length) return new Map();
  const table = kind === 'guide' ? 'guide_tags' : 'faq_tags';
  const fk = kind === 'guide' ? 'guide_id' : 'faq_id';
  const rows = (await q(env,
    `SELECT x.${fk} AS entity_id,t.id,t.name,t.slug,t.color,t.status,x.sort_order
     FROM ${table} x
     JOIN content_tags t ON t.id=x.tag_id
       AND t.tenant_id=x.tenant_id AND t.platform_id=x.platform_id
     WHERE x.${fk}=ANY($1::int[]) AND t.deleted_at IS NULL
     ORDER BY x.${fk},x.sort_order ASC,t.sort_order ASC,t.id ASC`,
    [ids],
  )).rows;
  const map = new Map();
  for (const row of rows) {
    const key = Number(row.entity_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      id: Number(row.id),
      name: row.name || '',
      slug: row.slug || '',
      color: row.color || '#1677ff',
      status: row.status || 'active',
    });
  }
  return map;
}

export async function enrichContentTaxonomyResponse(response, env, kind) {
  if (!response?.ok) return response;
  let responseWithTopics = response;
  if (kind === 'faq') responseWithTopics = await enrichTopicsResponse(responseWithTopics, env, 'faq');
  const payload = await readJson(responseWithTopics);
  if (!payload) return responseWithTopics;
  const rows = collectRows(payload, kind);
  const ids = [...new Set(rows.map((row) => Number(row?.id || 0)).filter(Boolean))];
  if (!ids.length) return responseWithTopics;
  const tags = await tagMap(env, kind, ids);
  const decorated = new Map(rows.map((row) => {
    const values = tags.get(Number(row.id)) || [];
    return [Number(row.id), {
      ...row,
      tags: values,
      tag_ids: values.map((tag) => Number(tag.id)),
      tag_slugs: values.map((tag) => tag.slug).filter(Boolean),
    }];
  }));
  return jsonResponseLike(responseWithTopics, replaceRows(payload, kind, decorated));
}

function tagPayload(body = {}, existing = null) {
  const name = String(body.name ?? existing?.name ?? '').trim().slice(0, 120);
  if (!name) {
    const error = new Error('Tag name is required');
    error.status = 400;
    error.code = 'TAG_NAME_REQUIRED';
    throw error;
  }
  const explicitSlug = hasOwn(body, 'slug') ? String(body.slug || '').trim() : '';
  const slug = explicitSlug
    ? slugify(explicitSlug, 'tag')
    : existing?.slug || slugify(name, 'tag');
  const status = ['active', 'archived'].includes(String(body.status ?? existing?.status ?? 'active'))
    ? String(body.status ?? existing?.status ?? 'active')
    : 'active';
  const sortOrder = Number.isFinite(Number(body.sort_order ?? existing?.sort_order))
    ? Math.max(0, Math.min(9999, Math.trunc(Number(body.sort_order ?? existing?.sort_order))))
    : 100;
  return { name, slug, color: safeColor(body.color ?? existing?.color), status, sort_order: sortOrder };
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function handleTagAdminRoute(request, env, scope) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method.toUpperCase();
  const match = path.match(/^\/admin\/tags\/(\d+)$/);
  const id = match ? Number(match[1]) : null;

  if (method === 'GET' && path === '/admin/tags') {
    const rows = (await q(env,
      `SELECT t.id,t.name,t.slug,t.color,t.status,t.sort_order,t.created_at,t.updated_at,
        (SELECT COUNT(*)::int FROM guide_tags gt WHERE gt.tag_id=t.id) AS guide_count,
        (SELECT COUNT(*)::int FROM faq_tags ft WHERE ft.tag_id=t.id) AS faq_count
       FROM content_tags t
       WHERE t.tenant_id=$1 AND t.platform_id=$2 AND t.deleted_at IS NULL
       ORDER BY t.sort_order ASC,lower(t.name) ASC,t.id ASC`,
      [scope.tenant_id, scope.platform_id],
    )).rows;
    return json(rows);
  }

  if (method === 'POST' && path === '/admin/tags') {
    const body = await request.json().catch(() => ({}));
    const tag = tagPayload(body);
    const row = (await q(env,
      `INSERT INTO content_tags(tenant_id,platform_id,name,slug,color,status,sort_order,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) RETURNING *`,
      [scope.tenant_id, scope.platform_id, tag.name, tag.slug, tag.color, tag.status, tag.sort_order],
    )).rows[0];
    return json(row, 201);
  }

  if (method === 'PUT' && id) {
    const existing = (await q(env,
      'SELECT * FROM content_tags WHERE id=$1 AND tenant_id=$2 AND platform_id=$3 AND deleted_at IS NULL LIMIT 1',
      [id, scope.tenant_id, scope.platform_id],
    )).rows[0];
    if (!existing) return json({ ok: false, error: 'Tag not found', code: 'TAG_NOT_FOUND' }, 404);
    const body = await request.json().catch(() => ({}));
    const tag = tagPayload(body, existing);
    const row = (await q(env,
      `UPDATE content_tags SET name=$1,slug=$2,color=$3,status=$4,sort_order=$5,updated_at=NOW()
       WHERE id=$6 AND tenant_id=$7 AND platform_id=$8 AND deleted_at IS NULL RETURNING *`,
      [tag.name, tag.slug, tag.color, tag.status, tag.sort_order, id, scope.tenant_id, scope.platform_id],
    )).rows[0];
    return json(row);
  }

  if (method === 'DELETE' && id) {
    const deleted = await transaction(env, async (run) => {
      const existing = (await run(
        'SELECT id FROM content_tags WHERE id=$1 AND tenant_id=$2 AND platform_id=$3 AND deleted_at IS NULL LIMIT 1',
        [id, scope.tenant_id, scope.platform_id],
      )).rows[0];
      if (!existing) return false;
      await run('DELETE FROM guide_tags WHERE tag_id=$1', [id]);
      await run('DELETE FROM faq_tags WHERE tag_id=$1', [id]);
      await run(
        'UPDATE content_tags SET deleted_at=NOW(),status=\'archived\',updated_at=NOW() WHERE id=$1 AND tenant_id=$2 AND platform_id=$3',
        [id, scope.tenant_id, scope.platform_id],
      );
      return true;
    });
    return deleted ? json({ ok: true, deleted: 1, id }) : json({ ok: false, error: 'Tag not found', code: 'TAG_NOT_FOUND' }, 404);
  }

  return null;
}

export async function closeMultiTopicPools() {
  await Promise.allSettled([...pools.values()].map((pool) => pool.end()));
  pools.clear();
}
