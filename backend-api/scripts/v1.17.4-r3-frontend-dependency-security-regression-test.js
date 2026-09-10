import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const checks = [];
function test(name, fn) { fn(); checks.push(name); console.log(`PASS ${name}`); }
function readJson(...parts) { return JSON.parse(fs.readFileSync(path.join(repo, ...parts), 'utf8')); }
function packageVersions(lock, packageName) {
  const suffix = `/node_modules/${packageName}`;
  return Object.entries(lock.packages || {})
    .filter(([packagePath]) => packagePath === `node_modules/${packageName}` || packagePath.endsWith(suffix))
    .map(([, meta]) => String(meta?.version || ''))
    .filter(Boolean);
}
function versionAtLeast(actual, minimum) {
  const parse = (value) => String(value).split('-')[0].split('.').map((part) => Number(part) || 0);
  const a = parse(actual);
  const b = parse(minimum);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    if (av !== bv) return av > bv;
  }
  return true;
}
const apps = ['admin-pro', 'chat-pro', 'guide-pro', 'staff-pro'];

for (const app of apps) {
  const lock = readJson(app, 'package-lock.json');
  test(`${app} has no js-yaml below patched 4.3.2`, () => {
    const versions = packageVersions(lock, 'js-yaml');
    assert.ok(
      versions.every((version) => versionAtLeast(version, '4.3.2')),
      `Unsafe js-yaml lock entries found: ${versions.join(', ')}`,
    );
  });
  test(`${app} locks nanoid at patched 3.3.18`, () => assert.equal(lock.packages['node_modules/nanoid']?.version, '3.3.18'));
}

const guidePkg = readJson('guide-pro', 'package.json');
const guideLock = readJson('guide-pro', 'package-lock.json');
test('Guide requires patched DOMPurify floor', () => assert.equal(guidePkg.dependencies?.dompurify, '^3.4.13'));
test('Guide lock root agrees with DOMPurify floor', () => assert.equal(guideLock.packages['']?.dependencies?.dompurify, '^3.4.13'));
test('Guide locks DOMPurify at patched 3.4.13', () => assert.equal(guideLock.packages['node_modules/dompurify']?.version, '3.4.13'));
test('Guide DOMPurify resolves from the npm registry', () => assert.equal(guideLock.packages['node_modules/dompurify']?.resolved, 'https://registry.npmjs.org/dompurify/-/dompurify-3.4.13.tgz'));

for (const app of apps) {
  const text = fs.readFileSync(path.join(repo, app, 'package-lock.json'), 'utf8');
  test(`${app} no longer locks vulnerable js-yaml releases below 4.3.2`, () => assert.ok(!text.includes('js-yaml-4.3.0.tgz') && !text.includes('js-yaml-4.3.1.tgz')));
  test(`${app} does not lock Nano ID below patched 3.3.18`, () => assert.ok(!text.includes('nanoid-3.3.16.tgz') && !text.includes('nanoid-3.3.17.tgz')));
}

test('Guide no longer locks vulnerable DOMPurify 3.4.12', () => {
  const text = fs.readFileSync(path.join(repo, 'guide-pro', 'package-lock.json'), 'utf8');
  assert.ok(!text.includes('dompurify-3.4.12.tgz'));
});

console.log(`${checks.length}/${checks.length} v1.17.4-R3 frontend dependency security checks passed.`);
