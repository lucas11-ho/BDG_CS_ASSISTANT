import assert from 'node:assert/strict';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { buildFaqTemplate, buildGuideTemplate } from '../src/bulk-content-studio.js';

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

async function headersFrom(buffer, sheetName) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet(sheetName);
  assert.ok(sheet, `${sheetName} sheet should exist`);
  return sheet.getRow(1).values.slice(1).map((value) => String(value || ''));
}

await test('FAQ template exposes only the requested import columns', async () => {
  const headers = await headersFrom(await buildFaqTemplate(), 'FAQ');
  assert.deepEqual(headers, ['Question', 'Locale', 'Answer', 'Status']);
  assert.ok(!headers.includes('Actions'));
});

await test('Guide template exposes the requested locale-aware columns', async () => {
  const headers = await headersFrom(await buildGuideTemplate(), 'Guide');
  assert.deepEqual(headers, [
    'Guide locale',
    'Stable slug',
    'Category',
    'Title',
    'Summary',
    'Image',
    'Locale status',
    'Sort order',
    'Recommended buttons',
    'SEO title',
    'Image alt text',
  ]);
});

await test('Bulk service keeps preview, apply, export and history routes separate', async () => {
  const source = fs.readFileSync(new URL('../src/bulk-content-studio.js', import.meta.url), 'utf8');
  for (const marker of [
    '/admin/content-bulk/faq/template',
    '/admin/content-bulk/faq/export',
    '/admin/content-bulk/faq/preview',
    '/admin/content-bulk/faq/import',
    '/admin/content-bulk/guide/template',
    '/admin/content-bulk/guide/export',
    '/admin/content-bulk/guide/preview',
    '/admin/content-bulk/guide/import',
    '/admin/content-bulk/history',
  ]) assert.ok(source.includes(marker), `missing ${marker}`);
  assert.ok(source.includes("statusMode === 'preserve' ? 'preserve' : 'draft'"));
  assert.ok(source.includes('workbookImageMap'));
  assert.ok(source.includes('No readable image found'));
});

await test('Admin exposes preview-first bulk controls only on FAQ and Guide routes', async () => {
  const shell = fs.readFileSync(new URL('../../admin-pro/src/routes/_admin.tsx', import.meta.url), 'utf8');
  const toolbar = fs.readFileSync(new URL('../../admin-pro/src/components/BulkContentRouteToolbar.tsx', import.meta.url), 'utf8');
  assert.ok(shell.includes('BulkContentRouteToolbar'));
  assert.ok(toolbar.includes('Download Template'));
  assert.ok(toolbar.includes('Export Excel'));
  assert.ok(toolbar.includes('Import History'));
  assert.ok(toolbar.includes('Import Excel'));
  assert.ok(toolbar.includes('Preview only — nothing has been written yet'));
});

await test('Guide runtime has an explicit Apple-style typography override hook', async () => {
  const layout = fs.readFileSync(new URL('../../guide-pro/src/components/public/PublicLayout.tsx', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../../guide-pro/src/styles.css', import.meta.url), 'utf8');
  assert.ok(layout.includes('guide-runtime-font'));
  assert.ok(layout.includes('--guide-runtime-font'));
  assert.ok(styles.includes('.guide-runtime-font'));
});

await test('Bulk content CORS preflight bypasses authenticated platform lookup', async () => {
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.ok(server.includes("path.startsWith('/admin/content-bulk/') && request.method.toUpperCase() !== 'OPTIONS'"));
  assert.ok(server.includes("'bulk-content-cors-preflight'"));
});

await test('Production gating waits for the v1.18.4-r1 hotfix release marker', async () => {
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  const reader = fs.readFileSync(new URL('../../scripts/ci/read-api-version.mjs', import.meta.url), 'utf8');
  assert.ok(server.includes("const API_VERSION = '1.18.4-r1-bulk-cors-preflight'"));
  assert.ok(server.includes('version: API_VERSION'));
  assert.ok(reader.includes('backend-api/src/server.js'));
  assert.ok(!reader.includes('backend-api/src/core.js'));
});

console.log(`${passed}/${passed} v1.18.4 bulk content studio checks passed.`);
