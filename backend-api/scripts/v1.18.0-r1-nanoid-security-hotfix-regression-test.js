import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const apps = ['backend-api', 'admin-pro', 'chat-pro', 'guide-pro', 'staff-pro'];
const expectedVersion = '3.3.18';
const expectedResolved = 'https://registry.npmjs.org/nanoid/-/nanoid-3.3.18.tgz';
const expectedIntegrity = 'sha512-DTg4MJbGMWkfi6VZFdNt2/caMbQy4Ou+Op/hJQvGEWcnVfoA1QA+xzRKAzw9jD6+GVOOeYr/mIcuDSdug6F6+w==';
const checks = [];
function test(name, fn) { fn(); checks.push(name); console.log(`PASS ${name}`); }
function readJson(...parts) { return JSON.parse(fs.readFileSync(path.join(repo, ...parts), 'utf8')); }

for (const app of apps) {
  const pkg = readJson(app, 'package.json');
  const lock = readJson(app, 'package-lock.json');
  const nano = lock.packages?.['node_modules/nanoid'];
  test(`${app} pins Nano ID override at 3.3.18`, () => assert.equal(pkg.overrides?.nanoid, expectedVersion));
  test(`${app} lock resolves Nano ID 3.3.18`, () => assert.equal(nano?.version, expectedVersion));
  test(`${app} lock uses official Nano ID 3.3.18 tarball`, () => assert.equal(nano?.resolved, expectedResolved));
  test(`${app} lock preserves Nano ID 3.3.18 SHA-512 integrity`, () => assert.equal(nano?.integrity, expectedIntegrity));
  const text = fs.readFileSync(path.join(repo, app, 'package-lock.json'), 'utf8');
  test(`${app} lock contains no Nano ID 3.3.16 or 3.3.17 tarball`, () => {
    assert.ok(!text.includes('nanoid-3.3.16.tgz'));
    assert.ok(!text.includes('nanoid-3.3.17.tgz'));
  });
}

const ci = fs.readFileSync(path.join(repo, '.github', 'workflows', 'ci.yml'), 'utf8');
const prod = fs.readFileSync(path.join(repo, '.github', 'workflows', 'bdg-production-release.yml'), 'utf8');
test('normal CI executes the v1.18.0-R1 Nano ID security guard', () => assert.match(ci, /test:v1180r1/));
test('production CI executes the v1.18.0-R1 Nano ID security guard', () => assert.match(prod, /test:v1180r1/));
test('Nano ID hotfix still introduces no dedicated migration 049', () => assert.ok(!fs.existsSync(path.join(repo, 'backend-api', 'migrations', '049_v1.18.0_r1_nanoid_security_hotfix.sql'))));
test('Commerce Connector v2 migration 048 remains present after later additive migrations', () => {
  assert.ok(fs.existsSync(path.join(repo, 'backend-api', 'migrations', '048_v1.18.0_luke_shop_commerce_connector_v2.sql')));
});
test('v1.18.4 owns later additive migrations without changing the Nano ID hotfix contract', () => {
  const migrations = path.join(repo, 'backend-api', 'migrations');
  const files = fs.readdirSync(migrations).filter((x) => /^\d+_.*\.sql$/.test(x)).sort();
  assert.ok(files.some((x) => x.startsWith('049_v1.18.4_')));
  assert.ok(files.at(-1)?.startsWith('050_v1.18.4_r2_'));
});

console.log(`${checks.length}/${checks.length} v1.18.0-R1 Nano ID dependency security checks passed.`);
