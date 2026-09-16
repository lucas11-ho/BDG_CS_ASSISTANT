import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const server = read('../src/server.js');
const moduleSource = read('../src/localized-categories-analytics.js');
const migration = read('../migrations/053_v1.21.0_localized_categories_traffic_analytics.sql');
const categories = read('../../admin-pro/src/routes/_admin.categories.tsx');
const analytics = read('../../admin-pro/src/routes/_admin.analytics.tsx');
const dashboard = read('../../admin-pro/src/routes/_admin.dashboard.tsx');
const layout = read('../../admin-pro/src/components/AdminLayout.tsx');
const adminRouteTree = read('../../admin-pro/src/routeTree.gen.ts');
const guideTracker = read('../../guide-pro/src/lib/traffic-analytics.ts');
const publicRoot = read('../../guide-pro/src/routes/_public.tsx');

for (const token of [
  'CREATE TABLE IF NOT EXISTS category_translations',
  'UNIQUE(category_id, locale)',
  'CHECK (locale = lower(locale))',
  "lower(replace(COALESCE(NULLIF(p.default_locale, ''), 'en'), '_', '-'))",
  'CREATE TABLE IF NOT EXISTS traffic_events',
  'CREATE TABLE IF NOT EXISTS traffic_presence',
  'PRIMARY KEY(platform_id, visitor_id)',
]) assert.ok(migration.includes(token), `missing migration contract: ${token}`);
assert.ok(!/^\s*(?:ip|ip_address|remote_addr)\s+/mi.test(migration), 'traffic analytics tables must not define a raw IP column');

for (const token of [
  'enrichCategoryListResponse',
  'handleCategoryLocaleAdminRoute',
  '/admin/categories/locales',
  'category_translations',
  '/public/analytics/pageview',
  '/public/analytics/heartbeat',
  'handleTrafficAdminRoute',
  '/admin/analytics/summary',
  "INTERVAL '2 minutes'",
  'top_pages',
  'raw_ip_stored: false',
]) assert.ok(moduleSource.includes(token), `missing backend contract: ${token}`);

for (const token of [
  "from './localized-categories-analytics.js'",
  'authenticatedContentAnalyticsResponse',
  'handleTrafficPublicRoute',
  'enrichCategoryListResponse',
  'closeLocalizedContentAnalyticsPools',
  'content-analytics-cors-preflight',
]) assert.ok(server.includes(token), `server is not wired for ${token}`);
assert.ok(server.includes("path.startsWith('/admin/content-bulk/') && request.method.toUpperCase() !== 'OPTIONS'"), 'legacy bulk-content dispatch contract must remain intact');
assert.ok(server.includes("const isContentAnalyticsAdmin = method !== 'OPTIONS' && ("), 'localized category and analytics Admin routes must bypass authentication on CORS preflight');

for (const token of [
  'title: "Locale"',
  'locale_status',
  'Edit localized category',
  'Save locale',
  'getCategoryTranslations',
  'saveCategoryTranslation',
]) assert.ok(categories.includes(token), `missing category Admin UX: ${token}`);

for (const token of [
  'Traffic Analytics',
  'Active now',
  'Visitors today',
  'Page views today',
  'Live traffic · last 30 minutes',
  'Top pages',
  'Languages',
  'Device mix',
  '30_000',
  'visibilitychange',
  'inFlightRef',
]) assert.ok(analytics.includes(token), `missing analytics UX: ${token}`);
assert.ok(!analytics.includes('setInterval(() => void load(true), 10_000)'), 'v1.22.1 must not restore overlapping 10-second analytics polling');
assert.ok(layout.includes('key: "/analytics"'));
assert.ok(layout.includes('group: "ANALYTICS"'));
assert.ok(adminRouteTree.includes("./routes/_admin.analytics"), 'generated Admin route tree must include the analytics route');
assert.ok(adminRouteTree.includes("'/analytics': typeof AdminAnalyticsRoute"), 'analytics route must be typed for Admin links');
assert.ok(dashboard.includes('Live Website Traffic'));
assert.ok(dashboard.includes('getTrafficAnalytics("7d")'));

for (const token of [
  'bdg_guide_visitor_id',
  'bdg_guide_session_id',
  'trackPublicPageView',
  'startPublicTrafficHeartbeat',
  '30_000',
  'keepalive: true',
]) assert.ok(guideTracker.includes(token), `missing public traffic tracker contract: ${token}`);
assert.ok(publicRoot.includes('trackPublicPageView()'));
assert.ok(publicRoot.includes('startPublicTrafficHeartbeat()'));

console.log('v1.21.0 localized categories and privacy-first traffic analytics regression contract passed with v1.22.1 stability refresh controls.');
