import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowedOrigin } from '../src/env.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');
const core = read('backend-api/src/core.js');
const server = read('backend-api/src/server.js');
const env = read('backend-api/src/env.js');
const migration = read('backend-api/migrations/045_v1.17.2_luke_shared_hosting_platform_route.sql');
const adminRoute = read('admin-pro/src/routes/_admin.domain-mapping.tsx');
const adminRouter = read('admin-pro/src/router.tsx');
const adminApi = read('admin-pro/src/lib/api.ts');
const staffApi = read('staff-pro/src/api.ts');
const staffRedirects = read('staff-pro/public/_redirects');
const guideApi = read('guide-pro/src/lib/api.ts');
const supportService = read('backend-api/src/support-service.js');
const backendPackage = JSON.parse(read('backend-api/package.json'));
let passed = 0;
const test = (name, ok) => {
  if (!ok) { console.error('FAIL', name); process.exitCode = 1; }
  else { passed += 1; console.log('PASS', name); }
};

test('v1.17.2 Luke Shared Hosting foundation remains active', core.includes('luke-shared-hosting') && core.includes('shared-platform-route-resolution') && server.includes('1.18.1-ai-knowledge-runtime'));
test('backend package version is current v1.18.0', backendPackage.version === '1.18.0');
test('migration 045 adds hosting mode', migration.includes('hosting_mode VARCHAR(30)') && migration.includes("'luke_shared','custom_domain'"));
test('migration 045 preserves existing public route keys', !migration.includes('SET public_route_key='));
test('Luke shared Admin origin defaults to ar-ai666.com', env.includes("LUKE_SHARED_ADMIN_ORIGIN: source.LUKE_SHARED_ADMIN_ORIGIN || 'https://admin.ar-ai666.com'"));
test('Luke shared CS Workspace origin defaults to ar-ai666.com', env.includes("'https://cs.ar-ai666.com'"));
test('Luke shared Guide origin defaults to ar-ai666.com', env.includes("'https://guide.ar-ai666.com'"));
test('Luke shared Chat origin defaults to ar-ai666.com', env.includes("'https://chat.ar-ai666.com'"));
test('Luke shared origins are trusted once by the static infrastructure CORS layer', env.includes('const lukeShared = env.LUKE_SHARED_HOSTING_ENABLED === false ? []') && env.includes('env.LUKE_SHARED_ADMIN_ORIGIN') && env.includes('env.LUKE_SHARED_CHAT_ORIGIN'));
const corsFixture = { ALLOWED_ORIGINS:'https://bdg-admin-pages.pages.dev', LUKE_SHARED_HOSTING_ENABLED:true, LUKE_SHARED_ADMIN_ORIGIN:'https://admin.ar-ai666.com', LUKE_SHARED_STAFF_ORIGIN:'https://cs.ar-ai666.com', LUKE_SHARED_GUIDE_ORIGIN:'https://guide.ar-ai666.com', LUKE_SHARED_CHAT_ORIGIN:'https://chat.ar-ai666.com' };
test('exact Luke shared origin is allowed without a per-client Render CORS edit', allowedOrigin(corsFixture, 'https://admin.ar-ai666.com') === 'https://admin.ar-ai666.com');
test('Luke shared CORS is exact-host only and does not trust arbitrary subdomains', allowedOrigin(corsFixture, 'https://evil.ar-ai666.com') === '');
test('all four shared links include immutable platform route', core.includes("staff: `${publicBaseUrl(env,'staff')}/p/${route}`") && core.includes("admin: `${publicBaseUrl(env,'admin')}/p/${route}`") && core.includes("chat: `${publicBaseUrl(env,'chat')}/p/${route}`") && core.includes("guide: `${publicBaseUrl(env,'guide')}/p/${route}`"));
test('Luke shared hostnames are not treated as customer custom domains', core.includes('...Object.values(LUKE_SHARED_ORIGINS)'));
test('Domain Mapping exposes Luke Shared Hosting and Custom Domain', adminRoute.includes('Luke Shared Hosting') && adminRoute.includes('Custom Domain'));
test('hosting mode uses a dedicated scoped Admin API', core.includes("'/admin/domain-mapping/hosting-mode'") && adminApi.includes('updateHostingMode'));
test('hosting mode changes require platform-manager permission', core.includes('PLATFORM_HOSTING_MODE_DENIED'));
test('Admin router accepts /p/<route> without requiring /admin suffix', adminRouter.includes('(?:\\/admin)?'));
test('Admin request headers accept shared and legacy route forms', adminApi.includes('(?:\\/admin)?'));
test('Admin custom-domain root can resolve platform from verified hostname', core.includes('platformContextFromRequest(request, new URL(request.url), { allowQuery:false, allowHostname:true })'));
test('Staff client carries X-BDG-Platform-Route from /p/<route>', staffApi.includes('X-BDG-Platform-Route') && staffApi.includes('getStaffPlatformRoute'));
test('Staff login rejects mismatched platform route', supportService.includes('SUPPORT_PLATFORM_ROUTE_MISMATCH'));
test('Staff Pages supports SPA fallback under /p/<route>', staffRedirects.includes('/* /index.html 200'));
test('Guide hostname mode no longer injects default platform', guideApi.includes('fromPath || ""') && guideApi.includes('platform ? `&platform='));
test('Luke is presented as neutral white-label hosting', adminRoute.includes('Luke is the neutral hosting layer'));
test('shared hosting declares no per-client DNS or CORS work', core.includes('no_per_client_dns:true') && core.includes('no_per_client_cors:true'));
test('custom-domain dynamic CORS remains available', core.includes('resolveVerifiedCustomHostnameCorsOrigin') && server.includes('resolveVerifiedCustomHostnameCorsOrigin'));
test('strict platform mismatch protection remains active', core.includes('PLATFORM_CONTEXT_MISMATCH'));
test('legacy Pages origins remain supported as infrastructure origins', core.includes('bdg-chat-pages.pages.dev') && core.includes('bdg-admin-pages.pages.dev'));

if (!process.exitCode) console.log(`\n${passed}/${passed} v1.17.2 Luke Shared Hosting checks passed.`);
