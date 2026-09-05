import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptFile=fileURLToPath(import.meta.url);
const root=path.resolve(path.dirname(scriptFile),'../..');
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');
const core=read('backend-api/src/core.js');
const server=read('backend-api/src/server.js');
const env=read('backend-api/src/env.js');
const migration=read('backend-api/migrations/044_v1.17.1_verified_domain_mapping_dynamic_cors.sql');
const domainPage=read('admin-pro/src/routes/_admin.domain-mapping.tsx');
const adminApi=read('admin-pro/src/lib/api.ts');
const adminLayout=read('admin-pro/src/components/AdminLayout.tsx');
const backendPackage=JSON.parse(read('backend-api/package.json'));

const checks=[];
const expect=(name,condition)=>checks.push([name,Boolean(condition)]);

expect('v1.17.1 release marker is active',core.includes('1.18.1-ai-knowledge-runtime')&&server.includes('1.18.1-ai-knowledge-runtime'));
expect('backend package version is current v1.18.0',backendPackage.version==='1.18.0');
expect('Admin displays current v1.18.1',adminLayout.includes('const ADMIN_VERSION = "v1.18.1"'));
expect('migration 044 adds explicit CORS policy fields',migration.includes('cors_allowed BOOLEAN NOT NULL DEFAULT TRUE')&&migration.includes('cors_activated_at TIMESTAMPTZ'));
expect('migration 044 indexes only active allowed custom origins',migration.includes('idx_platform_domains_dynamic_cors')&&migration.includes("cors_allowed IS TRUE")&&migration.includes("provisioning_status = 'active'"));
expect('custom-domain CORS requires exact HTTPS origin',core.includes("url.protocol !== 'https:'")&&core.includes('url.port')&&core.includes("url.pathname !== '/'")&&core.includes('`https://${hostname}`'));
expect('dynamic CORS no longer depends on the Cloudflare provisioning feature flag',core.includes('resolveVerifiedCustomHostnameCorsOrigin')&&!core.match(/resolveVerifiedCustomHostnameCorsOrigin[\s\S]{0,900}CLOUDFLARE_CUSTOM_HOSTNAMES_ENABLED/));
expect('dynamic CORS requires explicit API policy',core.includes('AND d.cors_allowed IS TRUE'));
expect('dynamic CORS requires active provisioning',core.includes("AND d.provisioning_status='active'"));
expect('dynamic CORS requires recorded verification',core.includes('AND d.verified_at IS NOT NULL'));
expect('dynamic CORS requires Cloudflare hostname and SSL active',core.includes("lower(COALESCE(d.cloudflare_status,''))='active'")&&core.includes("lower(COALESCE(d.cloudflare_ssl_status,''))='active'"));
expect('dynamic CORS requires active tenant and platform',core.includes("p.archived_at IS NULL AND p.status='active'")&&core.includes("t.archived_at IS NULL AND t.status='active'"));
expect('pending DNS and SSL states are not trusted by the CORS lookup',!core.match(/resolveVerifiedCustomHostnameCorsOrigin[\s\S]{0,1800}pending_dns/)&&!core.match(/resolveVerifiedCustomHostnameCorsOrigin[\s\S]{0,1800}pending_ssl/));
expect('server returns stable rejection code for untrusted origins',server.includes('CORS_ORIGIN_NOT_TRUSTED'));
expect('server uses database verified CORS decision after static origins',server.includes('resolveVerifiedCustomHostnameCorsOrigin(env, origin)')&&server.includes('if (customOrigin.allowed) corsOrigin = customOrigin.origin'));
expect('hostname platform resolution uses the same production readiness contract',core.includes("d.cors_allowed IS TRUE AND d.provisioning_status='active' AND d.verified_at IS NOT NULL"));
expect('Domain Mapping exposes automatic dynamic CORS summary',core.includes('dynamic_cors:{ enabled:true, automatic:true')&&core.includes('effective_custom_origins'));
expect('Domain Mapping exposes effective trust per hostname',core.includes('cors_effective: corsEffective')&&core.includes("cors_status: !corsAllowed ? 'disabled'"));
expect('Cloudflare sync activates or revokes CORS readiness atomically',core.includes('cors_activated_at=CASE WHEN cors_allowed IS TRUE')&&core.includes('invalidateCustomOriginCorsCache(row.hostname)'));
expect('Admin can enable or disable API CORS trust per hostname',core.includes('updateMappedDomainCorsPolicy')&&adminApi.includes('updateMappedDomainCors')&&domainPage.includes('API / CORS'));
expect('Admin explains that client origins no longer require Render edits',domainPage.includes('You do not need to add each client domain to Render ALLOWED_ORIGINS'));
expect('CS Workspace custom domains remain supported',adminApi.includes('"staff"')&&domainPage.includes('CS Workspace'));
expect('ALLOWED_ORIGINS remains the static infrastructure allowlist',env.includes('ALLOWED_ORIGINS')&&core.includes('static_origins:staticOrigins'));
expect('production rejects wildcard static CORS',env.includes('ALLOWED_ORIGINS must not contain * in production'));
expect('domain removal revokes cached dynamic trust',core.includes("cors_activated_at=NULL,archived_at=NOW()")&&core.includes('invalidateCustomOriginCorsCache(row.hostname)'));

let passed=0;
for(const [name,ok] of checks){
  if(ok){console.log('PASS',name);passed++;}
  else {console.error('FAIL',name);process.exitCode=1;}
}
console.log(`\n${passed}/${checks.length} v1.17.1 verified domain dynamic CORS checks passed.`);
if(passed!==checks.length) process.exit(1);
