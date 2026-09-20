import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { getRuntimeEnv } from '../src/env.js';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const guide = read('admin-pro', 'src', 'routes', '_admin.guide-images.tsx');
const domain = read('admin-pro', 'src', 'routes', '_admin.domain-mapping.tsx');
const envSource = read('backend-api', 'src', 'env.js');
const ci = read('.github', 'workflows', 'ci.yml');
const production = read('.github', 'workflows', 'bdg-production-release.yml');

const legacyConfigured = getRuntimeEnv({
  ADMIN_BASE_URL:'https://adminxx.example.com',
  STAFF_BASE_URL:'https://csxx.example.com',
  GUIDE_BASE_URL:'https://guidexx.example.com',
  CHAT_BASE_URL:'https://chatxx.example.com',
});
assert.equal(legacyConfigured.LUKE_SHARED_ADMIN_ORIGIN, 'https://adminxx.example.com');
assert.equal(legacyConfigured.LUKE_SHARED_STAFF_ORIGIN, 'https://csxx.example.com');
assert.equal(legacyConfigured.LUKE_SHARED_GUIDE_ORIGIN, 'https://guidexx.example.com');
assert.equal(legacyConfigured.LUKE_SHARED_CHAT_ORIGIN, 'https://chatxx.example.com');

const explicitLuke = getRuntimeEnv({
  LUKE_SHARED_ADMIN_ORIGIN:'https://adminnew.example.com',
  ADMIN_BASE_URL:'https://admin-old.example.com',
});
assert.equal(explicitLuke.LUKE_SHARED_ADMIN_ORIGIN, 'https://adminnew.example.com');

const defaults = getRuntimeEnv({});
assert.equal(defaults.LUKE_SHARED_ADMIN_ORIGIN, 'https://admin.ar-ai666.com');

const checks = [
  ['runtime fallback keeps explicitly configured legacy shared domains', envSource.includes("source.LUKE_SHARED_ADMIN_ORIGIN || source.ADMIN_BASE_URL")],
  ['Domain Mapping shows effective Admin origin', domain.includes('Effective Admin origin') && domain.includes('data.shared_hosting?.origins?.admin')],
  ['Domain Mapping no longer claims a hardcoded four-subdomain set', !domain.includes('The four ar-ai666.com subdomains are configured once')],
  ['Guide list has full text search', guide.includes('Search title, slug, topic, tag or locale') && guide.includes('const filteredRows = useMemo')],
  ['Guide list has status topic tag and locale filters', guide.includes('statusFilter') && guide.includes('topicFilter') && guide.includes('tagFilter') && guide.includes('localeFilter')],
  ['Guide rows support persistent multi-selection', guide.includes('rowSelection={{ selectedRowKeys') && guide.includes('preserveSelectedRowKeys: true')],
  ['Guide can select all filtered rows', guide.includes('selectAllFiltered') && guide.includes('Select all {filteredRows.length} filtered')],
  ['Guide batch publish publishes saved locale variants', guide.includes('batchPublishGuideTranslations(ids)') && guide.includes('Publish all saved locales')],
  ['Guide batch draft updates each translation status', guide.includes('api.updateGuideTranslation(id, { status: "draft" })')],
  ['Guide batch delete uses scoped batch endpoint', guide.includes('api.bulkRemove("guide-images"')],
  ['Guide list merges Locale Studio variant IDs for safe bulk actions', guide.includes('studioById') && guide.includes('variants')],
  ['Normal CI runs v1.25.4 domain/Guide regression', ci.includes('npm run test:v1254-domain-guide')],
  ['Production release runs v1.25.4 domain/Guide regression', production.includes('npm --prefix backend-api run test:v1254-domain-guide')],
];

for (const [name, ok] of checks) {
  assert.ok(ok, name);
  console.log(`PASS ${name}`);
}
console.log(`PASS v1.25.4 domain + Guide bulk regression (${checks.length} checks)`);
