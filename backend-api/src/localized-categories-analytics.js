import pg from 'pg';

const { Pool } = pg;
const pools = new Map();

function poolFor(env) {
  const key = String(env.DATABASE_URL || 'default');
  if (!pools.has(key)) {
    pools.set(key, new Pool({
      connectionString: env.DATABASE_URL,
      max: Math.max(1, Math.min(4, Number(env.DB_POOL_MAX || 4))),
      idleTimeoutMillis: Number(env.DB_IDLE_TIMEOUT_MS || 30_000),
      connectionTimeoutMillis: Number(env.DB_CONNECT_TIMEOUT_MS || 10_000),
      ...(String(env.DATABASE_SSL || 'true').toLowerCase() === 'true' ? { ssl: { rejectUnauthorized: false } } : {}),
    }));
  }
  return pools.get(key);
}

async function q(env, text, params = []) {
  const started = Date.now();
  try { return await poolFor(env).query(text, params); }
  finally {
    const duration = Date.now() - started;
    if (duration >= 500) console.warn(JSON.stringify({ level:'warn', event:'slow_localized_content_query', duration_ms:duration, operation:String(text || '').trim().split(/\s+/)[0] || 'query' }));
  }
}

export async function closeLocalizedContentAnalyticsPools() {
  await Promise.all([...pools.values()].map((pool) => pool.end().catch(() => undefined)));
  pools.clear();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function cloneJsonResponse(response, payload) {
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers });
}

function localeKey(value, fallback = '') {
  const locale = String(value || '').trim().replace(/_/g, '-').toLowerCase();
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/.test(locale) ? locale : fallback;
}

function localeMatches(a, b) {
  const left = localeKey(a);
  const right = localeKey(b);
  return Boolean(left && right && (left === right || left.split('-')[0] === right.split('-')[0]));
}

function parseSupported(value, fallback = []) {
  let values = [];
  try { values = JSON.parse(String(value || '[]')); }
  catch { values = String(value || '').split(/[\s,]+/); }
  if (!Array.isArray(values)) values = [];
  const normalized = [...new Set(values.map((item) => localeKey(item)).filter(Boolean))];
  return normalized.length ? normalized : fallback;
}

function localeLabel(code) {
  try {
    const language = String(code || '').split('-')[0];
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(language) || code;
  } catch { return String(code || '').toUpperCase(); }
}

async function categoryScope(env, categoryId) {
  return (await q(env, `SELECT c.id,c.tenant_id,c.platform_id,c.name,c.description,c.slug,c.icon,c.icon_url,c.sort_order,
      p.default_locale,p.supported_languages
    FROM categories c
    LEFT JOIN saas_platforms p ON p.id=c.platform_id
    WHERE c.id=$1 AND c.deleted_at IS NULL
    LIMIT 1`, [categoryId])).rows[0] || null;
}

async function localePolicy(env, tenantId, platformId, platform = {}) {
  const registry = (await q(env, `SELECT locale,display_name,native_name,direction,is_default
    FROM platform_locales
    WHERE tenant_id=$1 AND platform_id=$2 AND is_enabled IS TRUE
    ORDER BY is_default DESC, sort_order ASC, id ASC`, [tenantId, platformId]).catch(() => ({ rows: [] }))).rows;
  if (registry.length) {
    const locales = registry.map((row) => ({
      code: localeKey(row.locale, 'en'),
      label: row.display_name || localeLabel(row.locale),
      native_name: row.native_name || '',
      direction: row.direction || 'ltr',
      is_default: row.is_default === true,
    }));
    const defaultLocale = locales.find((item) => item.is_default)?.code || localeKey(platform.default_locale, locales[0]?.code || 'en');
    return { default_locale: defaultLocale, locales };
  }
  const defaultLocale = localeKey(platform.default_locale, 'en');
  const supported = parseSupported(platform.supported_languages, [defaultLocale]);
  if (!supported.some((item) => localeMatches(item, defaultLocale))) supported.unshift(defaultLocale);
  return {
    default_locale: defaultLocale,
    locales: supported.map((code) => ({ code, label: localeLabel(code), native_name: '', direction: 'ltr', is_default: localeMatches(code, defaultLocale) })),
  };
}

function pickTranslation(translations, requested) {
  const want = localeKey(requested);
  if (!want) return null;
  return translations.find((item) => localeKey(item.locale) === want)
    || translations.find((item) => localeMatches(item.locale, want))
    || null;
}

export async function enrichCategoryListResponse(response, env, { language = '', admin = false } = {}) {
  let payload;
  try { payload = await response.json(); }
  catch { return response; }
  if (!Array.isArray(payload) || !payload.length) return cloneJsonResponse(response, Array.isArray(payload) ? payload : []);

  const ids = payload.map((item) => Number(item?.id)).filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return cloneJsonResponse(response, payload);
  const categories = (await q(env, `SELECT c.id,c.tenant_id,c.platform_id,p.default_locale,p.supported_languages
    FROM categories c LEFT JOIN saas_platforms p ON p.id=c.platform_id
    WHERE c.id=ANY($1::int[])`, [ids])).rows;
  const translations = (await q(env, `SELECT category_id,locale,name,description,updated_at
    FROM category_translations WHERE category_id=ANY($1::int[]) ORDER BY category_id,locale`, [ids])).rows;
  const scopeById = new Map(categories.map((row) => [Number(row.id), row]));
  const byCategory = new Map();
  for (const tr of translations) {
    const id = Number(tr.category_id);
    if (!byCategory.has(id)) byCategory.set(id, []);
    byCategory.get(id).push(tr);
  }

  const policyCache = new Map();
  const result = [];
  for (const item of payload) {
    const id = Number(item.id);
    const scope = scopeById.get(id);
    const list = byCategory.get(id) || [];
    if (!scope) { result.push(item); continue; }
    const policyKey = `${scope.tenant_id}:${scope.platform_id}`;
    if (!policyCache.has(policyKey)) policyCache.set(policyKey, await localePolicy(env, scope.tenant_id, scope.platform_id, scope));
    const policy = policyCache.get(policyKey);
    if (admin) {
      const locale_status = policy.locales.map((locale) => ({
        ...locale,
        translated: locale.is_default || list.some((tr) => localeMatches(tr.locale, locale.code)),
      }));
      result.push({
        ...item,
        default_locale: policy.default_locale,
        supported_locales: policy.locales,
        locale_status,
        translated_locales: list.map((tr) => localeKey(tr.locale)).filter(Boolean),
      });
      continue;
    }
    const selected = pickTranslation(list, language);
    result.push(selected ? { ...item, name: selected.name || item.name, description: selected.description ?? item.description, locale: localeKey(selected.locale) } : { ...item, locale: policy.default_locale });
  }
  return cloneJsonResponse(response, result);
}

export async function handleCategoryLocaleAdminRoute(request, env, scope) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  if (request.method === 'GET' && path === '/admin/categories/locales') {
    const policy = await localePolicy(env, scope.tenant_id, scope.platform_id, scope);
    return json({ ok: true, ...policy });
  }
  const match = path.match(/^\/admin\/categories\/(\d+)\/translations(?:\/([^/]+))?$/);
  if (!match) return null;
  const categoryId = Number(match[1]);
  const category = await categoryScope(env, categoryId);
  if (!category || Number(category.tenant_id) !== Number(scope.tenant_id) || Number(category.platform_id) !== Number(scope.platform_id)) return json({ ok: false, error: 'Category not found', code: 'CATEGORY_NOT_FOUND' }, 404);
  const policy = await localePolicy(env, category.tenant_id, category.platform_id, category);

  if (request.method === 'GET') {
    const translations = (await q(env, `SELECT id,category_id,locale,name,description,created_at,updated_at
      FROM category_translations WHERE category_id=$1 ORDER BY locale ASC`, [categoryId])).rows;
    return json({ ok: true, category, ...policy, translations });
  }

  if (request.method === 'POST' || request.method === 'PUT') {
    if (scope.can_write !== true) return json({ ok: false, error: 'This platform membership is read-only', code: 'PLATFORM_WRITE_DENIED' }, 403);
    const body = await request.json().catch(() => ({}));
    const locale = localeKey(body.locale || match[2]);
    if (!locale) return json({ ok: false, error: 'A valid locale is required', code: 'LOCALE_REQUIRED' }, 400);
    if (!policy.locales.some((item) => localeMatches(item.code, locale))) return json({ ok: false, error: `Locale ${locale} is not enabled for this platform`, code: 'UNSUPPORTED_LOCALE' }, 400);
    const name = String(body.name || '').trim().slice(0, 120);
    const description = String(body.description || '').trim().slice(0, 4000);
    if (!name) return json({ ok: false, error: 'Category name is required', code: 'CATEGORY_NAME_REQUIRED' }, 400);
    const row = (await q(env, `INSERT INTO category_translations(category_id,tenant_id,platform_id,locale,name,description,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,NOW())
      ON CONFLICT(category_id,locale) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,tenant_id=EXCLUDED.tenant_id,platform_id=EXCLUDED.platform_id,updated_at=NOW()
      RETURNING id,category_id,locale,name,description,created_at,updated_at`, [categoryId, category.tenant_id, category.platform_id, locale, name, description])).rows[0];
    if (localeMatches(locale, policy.default_locale)) {
      await q(env, `UPDATE categories SET name=$1,description=$2 WHERE id=$3 AND tenant_id=$4 AND platform_id=$5`, [name, description, categoryId, category.tenant_id, category.platform_id]);
    }
    return json({ ok: true, translation: row, default_locale: policy.default_locale });
  }

  if (request.method === 'DELETE' && match[2]) {
    if (scope.can_write !== true) return json({ ok: false, error: 'This platform membership is read-only', code: 'PLATFORM_WRITE_DENIED' }, 403);
    const locale = localeKey(match[2]);
    if (localeMatches(locale, policy.default_locale)) return json({ ok: false, error: 'The default category locale cannot be removed', code: 'DEFAULT_LOCALE_REQUIRED' }, 400);
    const result = await q(env, `DELETE FROM category_translations WHERE category_id=$1 AND lower(locale)=lower($2)`, [categoryId, locale]);
    return json({ ok: true, deleted: result.rowCount || 0 });
  }

  return null;
}

function cleanId(value) {
  const text = String(value || '').trim();
  return /^[A-Za-z0-9_-]{8,80}$/.test(text) ? text : '';
}
function cleanPath(value) {
  let text = String(value || '/').trim().slice(0, 500) || '/';
  if (!text.startsWith('/')) text = `/${text}`;
  return text.replace(/[\u0000-\u001f]/g, '');
}
function cleanText(value, max = 500) { return String(value || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max); }
function cleanDevice(value) {
  const v = String(value || '').toLowerCase();
  return ['mobile','desktop','tablet'].includes(v) ? v : 'unknown';
}

async function resolvePublicTrafficScope(env, reference) {
  const key = cleanText(reference, 140).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  if (!key) return null;
  return (await q(env, `SELECT id AS platform_id,tenant_id,platform_key,public_route_key,default_locale
    FROM saas_platforms
    WHERE archived_at IS NULL AND status='active'
      AND (lower(public_route_key)=lower($1) OR lower(platform_key)=lower($1))
    LIMIT 1`, [key])).rows[0] || null;
}

async function upsertPresence(env, scope, data) {
  await q(env, `INSERT INTO traffic_presence(tenant_id,platform_id,visitor_id,session_id,last_path,locale,device_type,first_seen_at,last_seen_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
    ON CONFLICT(platform_id,visitor_id) DO UPDATE SET tenant_id=EXCLUDED.tenant_id,session_id=EXCLUDED.session_id,last_path=EXCLUDED.last_path,locale=EXCLUDED.locale,device_type=EXCLUDED.device_type,last_seen_at=NOW()`,
  [scope.tenant_id, scope.platform_id, data.visitor_id, data.session_id, data.path, data.locale, data.device_type]);
}

export async function handleTrafficPublicRoute(request, env) {
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  if (request.method !== 'POST' || !['/public/analytics/pageview','/public/analytics/heartbeat'].includes(path)) return null;
  const body = await request.json().catch(() => ({}));
  const visitor_id = cleanId(body.visitor_id);
  const session_id = cleanId(body.session_id);
  const scope = await resolvePublicTrafficScope(env, body.platform);
  if (!visitor_id || !session_id || !scope) return json({ ok: true, tracked: false });
  const data = {
    visitor_id,
    session_id,
    path: cleanPath(body.path),
    locale: localeKey(body.locale, scope.default_locale || 'en'),
    referrer: cleanText(body.referrer, 500),
    device_type: cleanDevice(body.device_type),
  };
  await upsertPresence(env, scope, data);
  if (path.endsWith('/pageview')) {
    await q(env, `INSERT INTO traffic_events(tenant_id,platform_id,visitor_id,session_id,event_type,path,locale,referrer,device_type)
      VALUES($1,$2,$3,$4,'pageview',$5,$6,$7,$8)`, [scope.tenant_id, scope.platform_id, data.visitor_id, data.session_id, data.path, data.locale, data.referrer, data.device_type]);
  }
  return json({ ok: true, tracked: true });
}

function rangeInterval(range) {
  if (range === '24h') return '24 hours';
  if (range === '30d') return '30 days';
  return '7 days';
}

const analyticsSummaryCache = new Map();
const analyticsSummaryFlights = new Map();
const ANALYTICS_SUMMARY_TTL_MS = 15_000;

export async function handleTrafficAdminRoute(request, env, scope) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  if (request.method !== 'GET' || path !== '/admin/analytics/summary') return null;
  const range = url.searchParams.get('range') || '7d';
  const interval = rangeInterval(range);
  const cacheKey = `${scope.tenant_id}:${scope.platform_id}:${range}`;
  const cached = analyticsSummaryCache.get(cacheKey);
  if (cached && Date.now() - cached.at < ANALYTICS_SUMMARY_TTL_MS) return json(cached.payload);
  if (analyticsSummaryFlights.has(cacheKey)) return json(await analyticsSummaryFlights.get(cacheKey));

  const flight = (async () => {
    const started = Date.now();
    const params = [scope.tenant_id, scope.platform_id];
    const [metrics, topPages, locales, devices, minuteRows] = await Promise.all([
      q(env, `SELECT
        (SELECT COUNT(*)::int FROM traffic_presence WHERE tenant_id=$1 AND platform_id=$2 AND last_seen_at >= NOW()-INTERVAL '2 minutes') AS active_now,
        COUNT(DISTINCT visitor_id) FILTER (WHERE created_at >= date_trunc('day',NOW()))::int AS visitors_today,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('day',NOW()))::int AS pageviews_today,
        COUNT(DISTINCT visitor_id) FILTER (WHERE created_at >= NOW()-INTERVAL '7 days')::int AS visitors_7d,
        COUNT(*) FILTER (WHERE created_at >= NOW()-($3::text)::interval)::int AS range_pageviews,
        COUNT(DISTINCT visitor_id) FILTER (WHERE created_at >= NOW()-($3::text)::interval)::int AS range_visitors
        FROM traffic_events WHERE tenant_id=$1 AND platform_id=$2 AND event_type='pageview'`, [...params, interval]),
      q(env, `SELECT path,COUNT(*)::int AS views,COUNT(DISTINCT visitor_id)::int AS visitors FROM traffic_events WHERE tenant_id=$1 AND platform_id=$2 AND event_type='pageview' AND created_at >= NOW()-($3::text)::interval GROUP BY path ORDER BY views DESC,path ASC LIMIT 12`, [...params, interval]),
      q(env, `SELECT locale,COUNT(*)::int AS views,COUNT(DISTINCT visitor_id)::int AS visitors FROM traffic_events WHERE tenant_id=$1 AND platform_id=$2 AND event_type='pageview' AND created_at >= NOW()-($3::text)::interval GROUP BY locale ORDER BY views DESC LIMIT 12`, [...params, interval]),
      q(env, `SELECT device_type,COUNT(*)::int AS views,COUNT(DISTINCT visitor_id)::int AS visitors FROM traffic_events WHERE tenant_id=$1 AND platform_id=$2 AND event_type='pageview' AND created_at >= NOW()-($3::text)::interval GROUP BY device_type ORDER BY views DESC LIMIT 8`, [...params, interval]),
      q(env, `SELECT created_at FROM traffic_events WHERE tenant_id=$1 AND platform_id=$2 AND event_type='pageview' AND created_at >= NOW()-INTERVAL '30 minutes' ORDER BY created_at ASC`, params),
    ]);
    const now = Date.now();
    const buckets = Array.from({ length: 6 }, (_, index) => ({
      start: now - (5 - index) * 5 * 60_000,
      label: new Date(now - (5 - index) * 5 * 60_000).toISOString(),
      views: 0,
    }));
    for (const row of minuteRows.rows) {
      const ts = new Date(row.created_at).getTime();
      const age = now - ts;
      const index = 5 - Math.min(5, Math.max(0, Math.floor(age / (5 * 60_000))));
      if (buckets[index]) buckets[index].views += 1;
    }
    const row = metrics.rows[0] || {};
    const payload = {
      ok: true,
      generated_at: new Date().toISOString(),
      active_window_seconds: 120,
      range,
      active_now: Number(row.active_now || 0),
      visitors_today: Number(row.visitors_today || 0),
      pageviews_today: Number(row.pageviews_today || 0),
      visitors_7d: Number(row.visitors_7d || 0),
      range_pageviews: Number(row.range_pageviews || 0),
      range_visitors: Number(row.range_visitors || 0),
      live_30m: buckets,
      top_pages: topPages.rows,
      locales: locales.rows,
      devices: devices.rows,
      privacy: { raw_ip_stored: false, visitor_identity: 'anonymous browser id' },
    };
    analyticsSummaryCache.set(cacheKey, { at: Date.now(), payload });
    console.log(JSON.stringify({ level:'info', event:'analytics_summary_computed', tenant_id:scope.tenant_id, platform_id:scope.platform_id, range, query_count:5, duration_ms:Date.now()-started }));
    return payload;
  })();
  analyticsSummaryFlights.set(cacheKey, flight);
  try { return json(await flight); }
  finally { analyticsSummaryFlights.delete(cacheKey); }
}
