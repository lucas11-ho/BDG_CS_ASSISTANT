import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const checks = [];
function read(...parts) { return fs.readFileSync(path.join(repo, ...parts), 'utf8'); }
function test(name, fn) { fn(); checks.push(name); console.log(`PASS ${name}`); }

const adminTheme = read('admin-pro', 'src', 'routes', '_admin.theme-settings.tsx');
const guideContent = read('guide-pro', 'src', 'lib', 'platform-guide-content.ts');
const guideLayout = read('guide-pro', 'src', 'components', 'public', 'PublicLayout.tsx');
const guideHome = read('guide-pro', 'src', 'routes', '_public.index.tsx');
const guideList = read('guide-pro', 'src', 'routes', '_public.guides.tsx');
const guideFaq = read('guide-pro', 'src', 'routes', '_public.faq.tsx');

const workers = [
  ['guide', read('guide-pro', 'public', '_worker.js')],
  ['chat', read('chat-pro', 'public', '_worker.js')],
  ['admin', read('admin-pro', 'public', '_worker.js')],
  ['staff', read('staff-pro', 'public', '_worker.js')],
];
const runtimes = [
  ['chat', read('chat-pro', 'src', 'lib', 'web-identity-runtime.ts'), read('chat-pro', 'src', 'main.tsx')],
  ['admin', read('admin-pro', 'src', 'lib', 'web-identity-runtime.ts'), read('admin-pro', 'src', 'main.tsx')],
  ['staff', read('staff-pro', 'src', 'web-identity-runtime.ts'), read('staff-pro', 'src', 'main.tsx')],
];

test('Admin Guide editor stores platform-localized fields', () => {
  assert.ok(adminTheme.includes('guide.i18n.${locale}.${field.key}'));
  assert.ok(adminTheme.includes('default_locale'));
  assert.ok(adminTheme.includes('supported_languages'));
});

test('Admin Web Identity supports all four surfaces', () => {
  for (const kind of ['guide', 'chat', 'admin', 'staff']) assert.ok(adminTheme.includes(`key: "${kind}"`));
  for (const field of ['browser_title', 'description', 'preview_title', 'preview_description', 'preview_image_url', 'favicon_url']) assert.ok(adminTheme.includes(field));
});

test('Guide offers native iOS/Apple system typography', () => {
  assert.ok(adminTheme.includes('ios-system'));
  assert.ok(adminTheme.includes('-apple-system'));
  assert.ok(!adminTheme.includes('.ttf') && !adminTheme.includes('.otf'));
});

test('Guide localization helper implements selected-default-legacy fallback', () => {
  assert.ok(guideContent.includes('guide.i18n.${locale}.${field}'));
  assert.ok(guideContent.includes('defaultLocale'));
  assert.ok(guideContent.includes('legacyKey'));
});

test('Guide public surfaces consume platform localization', () => {
  for (const source of [guideLayout, guideHome, guideList, guideFaq]) {
    assert.ok(source.includes('platform-guide-content') || source.includes('usePlatformGuideContent'));
  }
});

for (const [kind, worker] of workers) {
  test(`${kind} edge worker resolves platform Web Identity`, () => {
    assert.ok(worker.includes(`/guide/content`));
    assert.ok(worker.includes('/__platform/identity'));
    assert.ok(worker.includes('X-Forwarded-Host'));
    assert.ok(worker.includes('x-platform-web-identity'));
    assert.ok(worker.includes('og:title'));
    assert.ok(worker.includes('twitter:card'));
    assert.ok(worker.includes('cache-control'));
  });
}

for (const [kind, runtime, main] of runtimes) {
  test(`${kind} browser runtime preserves edge identity after hydration`, () => {
    assert.ok(runtime.includes('MutationObserver'));
    assert.ok(runtime.includes('/__platform/identity'));
    assert.ok(runtime.includes('x-platform-web-identity'));
    assert.ok(main.includes('installWebIdentityRuntime'));
  });
}

test('Shared HTML shells no longer expose legacy BDG identity', () => {
  for (const app of ['guide-pro', 'chat-pro', 'admin-pro', 'staff-pro']) {
    const html = read(app, 'index.html');
    assert.ok(!html.includes('BDG Help Center'));
    assert.ok(!html.includes('BDG AI Support'));
  }
});

console.log(`${checks.length}/${checks.length} v1.18.3 platform brand/localization checks passed.`);
