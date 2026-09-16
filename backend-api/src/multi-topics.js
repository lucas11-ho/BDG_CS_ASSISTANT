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
      application_name: 'bdg-multi-topics-v1230',
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
  const raw = Array.isArray(value)
    ? value
    : String(value ?? '').split(/[\s,]+/);
  return [...new Set(raw.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0))];
}

function slugs(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value ?? '').split(/[\s,]+/);
  return [...new Set(raw.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))];
}

function hasTopicPayload(body) {
  return body && typeof body === 'object' && (
    Object.prototype.hasOwnProperty.call(body, 'topic_ids')
    || Object.prototype.hasOwnProperty.call(body, 'topic_slugs')
    || Object.prototype.hasOwnProperty.call(body, 'primary_topic_id')
    || Object.prototype.hasOwnProperty.call(body, 'category_id')
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

export async function syncTopicsFromResponse(response, env, kind, body) {
  if (!response?.ok || !hasTopicPayload(body)) return response;
  const payload = await readJson(response);
  const entity = entityFromPayload(payload, kind);
  const entityId = Number(entity?.id || 0);
  if (!entityId) return response;

  const table = kind === 'guide' ? 'guides' : 'faqs';
  const joinTable = kind === 'guide' ? 'guide_topics' : 'faq_topics';
  const fk = kind === 'guide' ? 'guide_id' : 'faq_id';

  await transaction(env, async (run) => {
    const scope = (await run(
      `SELECT id,tenant_id,platform_id FROM ${table} WHERE id=$1 LIMIT 1`,
      [entityId],
    )).rows[0];
    if (!scope?.tenant_id || !scope?.platform_id) return;

    const { categories, primaryId } = await resolveSelectedCategories(run, scope, body);
    await run(`DELETE FROM ${joinTable} WHERE ${fk}=$1`, [entityId]);
    for (let index = 0; index < categories.length; index += 1) {
      const category = categories[index];
      await run(
        `INSERT INTO ${joinTable}(tenant_id,platform_id,${fk},category_id,is_primary,sort_order,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,NOW())`,
        [scope.tenant_id, scope.platform_id, entityId, Number(category.id), Number(category.id) === primaryId, Number(category.id) === primaryId ? 0 : index + 1],
      );
    }

    if (kind === 'guide') {
      await run('UPDATE guides SET category_id=$1,updated_at=NOW() WHERE id=$2 AND tenant_id=$3 AND platform_id=$4', [primaryId, entityId, scope.tenant_id, scope.platform_id]);
    } else if (primaryId) {
      const primary = categories.find((row) => Number(row.id) === primaryId);
      await run('UPDATE faqs SET topic=$1,updated_at=NOW() WHERE id=$2 AND tenant_id=$3 AND platform_id=$4', [primary?.name || 'General', entityId, scope.tenant_id, scope.platform_id]);
    }
  });

  return response;
}

async function topicMap(env, kind, ids) {
  if (!ids.length) return new Map();
  const joinTable = kind === 'guide' ? 'guide_topics' : 'faq_topics';
  const fk = kind === 'guide' ? 'guide_id' : 'faq_id';
  const rows = (await q(env,
    `SELECT jt.${fk} AS entity_id,c.id,c.name,c.slug,c.icon,jt.is_primary,jt.sort_order
     FROM ${joinTable} jt
     JOIN categories c ON c.id=jt.category_id
       AND c.tenant_id=jt.tenant_id AND c.platform_id=jt.platform_id
     WHERE jt.${fk}=ANY($1::int[]) AND c.deleted_at IS NULL
     ORDER BY jt.${fk},jt.is_primary DESC,jt.sort_order ASC,c.id ASC`,
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

function collectRows(payload, kind) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (payload.id) return [payload];
  const singular = payload[kind];
  if (singular?.id) return [singular];
  const collection = payload[kind === 'guide' ? 'guides' : 'faqs'];
  return Array.isArray(collection) ? collection : [];
}

function decorateRow(row, topics, kind) {
  const fallback = [];
  if (!topics.length && kind === 'guide' && row.category_id) {
    fallback.push({
      id: Number(row.category_id),
      name: row.category_name || row.category || '',
      slug: row.category_slug || '',
      icon: row.category_icon || '',
      is_primary: true,
    });
  }
  const effective = topics.length ? topics : fallback;
  const primary = effective.find((topic) => topic.is_primary) || effective[0] || null;
  return {
    ...row,
    topics: effective,
    topic_ids: effective.map((topic) => Number(topic.id)),
    topic_slugs: effective.map((topic) => topic.slug).filter(Boolean),
    primary_topic_id: primary ? Number(primary.id) : null,
    ...(kind === 'faq' && primary ? { category: primary.name || row.category || row.topic || 'General' } : {}),
  };
}

export async function enrichTopicsResponse(response, env, kind) {
  if (!response?.ok) return response;
  const payload = await readJson(response);
  if (!payload) return response;
  const rows = collectRows(payload, kind);
  const ids = [...new Set(rows.map((row) => Number(row?.id || 0)).filter(Boolean))];
  if (!ids.length) return response;
  const map = await topicMap(env, kind, ids);
  const decorated = new Map(rows.map((row) => [Number(row.id), decorateRow(row, map.get(Number(row.id)) || [], kind)]));

  let output = payload;
  if (Array.isArray(payload)) {
    output = payload.map((row) => decorated.get(Number(row?.id)) || row);
  } else if (payload.id) {
    output = decorated.get(Number(payload.id)) || payload;
  } else if (payload[kind]?.id) {
    output = { ...payload, [kind]: decorated.get(Number(payload[kind].id)) || payload[kind] };
  } else {
    const key = kind === 'guide' ? 'guides' : 'faqs';
    if (Array.isArray(payload[key])) output = { ...payload, [key]: payload[key].map((row) => decorated.get(Number(row?.id)) || row) };
  }
  return jsonResponseLike(response, output);
}

export async function closeMultiTopicPools() {
  await Promise.allSettled([...pools.values()].map((pool) => pool.end()));
  pools.clear();
}
