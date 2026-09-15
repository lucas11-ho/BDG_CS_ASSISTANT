import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const checks = [];
const read = (...parts) => fs.readFileSync(path.join(repo, ...parts), 'utf8');
const readJson = (...parts) => JSON.parse(read(...parts));
const test = (name, fn) => { fn(); checks.push(name); console.log(`PASS ${name}`); };

const customerService = read('admin-pro', 'src', 'routes', '_admin.customer-service.tsx');
const richEditor = read('admin-pro', 'src', 'components', 'RichKnowledgeEditor.tsx');
const adminPackage = readJson('admin-pro', 'package.json');
const ci = read('.github', 'workflows', 'ci.yml');
const productionCi = read('.github', 'workflows', 'bdg-production-release.yml');

function walkSource(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkSource(full));
    else if (/\.(?:tsx?|jsx?)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const adminSource = walkSource(path.join(repo, 'admin-pro', 'src'))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');

test('Admin Pro remains on Ant Design v6', () => assert.match(String(adminPackage.dependencies?.antd || ''), /^\^?6\./));
test('Customer Service menu Divider uses v6 titlePlacement semantics', () => assert.ok(customerService.includes('<Divider titlePlacement="start">Custom menu items</Divider>')));
test('Customer Service menu no longer passes left as Divider orientation', () => assert.ok(!customerService.includes('<Divider orientation="left">Custom menu items</Divider>')));
test('Admin source contains no left/right/center Divider orientation values', () => assert.ok(!/<Divider[^>]*\borientation=["'](?:left|right|center)["']/i.test(adminSource)));
test('Rich Knowledge Editor uses vertical Divider orientation', () => assert.equal((richEditor.match(/<Divider orientation="vertical"\s*\/>/g) || []).length, 5));
test('Admin source contains no deprecated Divider type="vertical" usage', () => assert.ok(!/<Divider[^>]*\btype=["']vertical["']/i.test(adminSource)));
test('Existing Guide image Divider titlePlacement usage remains compatible', () => {
  const source = read('admin-pro', 'src', 'routes', '_admin.guide-images.tsx');
  assert.match(source, /<Divider titlePlacement="start">Motion media cover(?: \/ custom override)?<\/Divider>/);
  assert.ok(source.includes('<Divider titlePlacement="start">Text motion</Divider>'));
});
test('Normal CI runs the R3 dependency-security guard before R4 compatibility guard', () => assert.ok(ci.indexOf('npm run test:v1174r3') < ci.indexOf('npm run test:v1174r4')));
test('Normal CI still typechecks Admin Pro before building it', () => assert.ok(ci.indexOf('npm run typecheck', ci.indexOf('Build Admin Pro')) < ci.indexOf('npm run build', ci.indexOf('Build Admin Pro'))));
test('Production CI now carries forward the R3 security guard', () => assert.ok(productionCi.includes('npm --prefix backend-api run test:v1174r3')));
test('Production CI executes the R4 Ant Design compatibility guard', () => assert.ok(productionCi.includes('npm --prefix backend-api run test:v1174r4')));
test('R4 compatibility remains valid with migration 048 now owned by v1.18.0', () => {
  const migrations = fs.readdirSync(path.join(repo, 'backend-api', 'migrations'));
  assert.ok(migrations.some((name) => /^048_v1\.18\.0_luke_shop_commerce_connector_v2\.sql$/.test(name)));
});

console.log(`\n${checks.length}/${checks.length} v1.17.4-R4 Ant Design v6 type compatibility checks passed.`);
