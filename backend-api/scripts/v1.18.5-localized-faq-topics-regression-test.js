import assert from 'node:assert/strict';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { buildFaqTopicTemplate } from '../src/faq-topics.js';

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

await test('FAQ template includes the localized Topic column', async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildFaqTopicTemplate());
  const sheet = workbook.getWorksheet('FAQ');
  assert.ok(sheet);
  const headers = sheet.getRow(1).values.slice(1).map((value) => String(value || ''));
  assert.deepEqual(headers, ['Question', 'Locale', 'Topic', 'Answer', 'Status']);
});

await test('FAQ topic migration is additive and defaults existing rows to General', async () => {
  const migration = fs.readFileSync(new URL('../migrations/051_v1.18.5_localized_faq_topics.sql', import.meta.url), 'utf8');
  assert.ok(migration.includes('ADD COLUMN IF NOT EXISTS topic VARCHAR(160)'));
  assert.ok(migration.includes("SET topic = 'General'"));
  assert.ok(migration.includes('ALTER COLUMN topic SET NOT NULL'));
  assert.ok(migration.includes('idx_faqs_scope_locale_topic_status'));
});

await test('FAQ Excel preview/import/export all carry Topic without breaking old workbooks', async () => {
  const source = fs.readFileSync(new URL('../src/faq-topics.js', import.meta.url), 'utf8');
  assert.ok(source.includes("{ header: 'Topic', key: 'topic'"));
  assert.ok(source.includes('topic=$6'));
  assert.ok(source.includes('locale,topic,keywords'));
  assert.ok(source.includes("COALESCE(NULLIF(BTRIM(topic),''),'General') AS topic"));
  assert.ok(source.includes('Older 4-column workbooks without Topic are still accepted'));
  assert.ok(source.includes('topic_supplied'));
  assert.ok(source.includes('match ? topicLabel(match.topic)'));
});

await test('Legacy API clients that omit Topic do not erase a saved Topic', async () => {
  const source = fs.readFileSync(new URL('../src/faq-topics.js', import.meta.url), 'utf8');
  assert.ok(source.includes("hasOwnProperty.call(parsed || {}, 'topic')"));
  assert.ok(source.includes('if (!response?.ok || topic == null) return'));
});

await test('Admin preserves localized Topic compatibility while enforcing one Topic and separate Tags', async () => {
  const page = fs.readFileSync(new URL('../../admin-pro/src/routes/_admin.faq.tsx', import.meta.url), 'utf8');
  const toolbar = fs.readFileSync(new URL('../../admin-pro/src/components/BulkContentRouteToolbar.tsx', import.meta.url), 'utf8');
  assert.ok(page.includes('name="topic_id" label="Topic"'));
  assert.ok(page.includes('Each FAQ belongs to one Topic only.'));
  assert.ok(!page.includes('name="topic_ids" label="Topics"'));
  assert.ok(!page.includes('name="primary_topic_id" label="Primary topic"'));
  assert.ok(page.includes('name="tag_ids" label="Tags"'));
  assert.ok(page.includes('Manage your own Tags from Content → Tags.'));
  assert.ok(page.includes('name="topic" hidden'));
  assert.ok(toolbar.includes('Topic is locale-specific, so use the same language as each FAQ row.'));
  assert.match(toolbar, /title:\s*(?:t\()?['"]Topic['"]\)?\s*,\s*dataIndex:\s*['"]topic['"]/);
});

await test('Runtime enriches FAQ responses so Guide grouping uses localized Topic labels', async () => {
  const runtime = fs.readFileSync(new URL('../src/faq-topics.js', import.meta.url), 'utf8');
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  const publicFaq = fs.readFileSync(new URL('../../guide-pro/src/routes/_public.faq.tsx', import.meta.url), 'utf8');
  assert.ok(runtime.includes('return { ...row, topic, category: topic }'));
  assert.ok(server.includes('enrichFaqTopicResponse'));
  assert.ok(server.includes('persistFaqTopicFromResponse'));
  assert.ok(server.includes("path.startsWith('/admin/content-bulk/faq/')"));
  assert.ok(publicFaq.includes('(faq.category || "").toLowerCase().includes(search)'));
  assert.ok(publicFaq.includes('const key = faq.category ?? "General"'));
});

await test('Production release marker advances to localized FAQ topics', async () => {
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.ok(server.includes("const API_VERSION = '1.24.0-content-taxonomy-stable-faq-slugs'"));
  assert.ok(server.includes("'localized-faq-topics'"));
  assert.ok(server.includes("'faq-topic-excel-import-export'"));
});

console.log(`${passed}/${passed} v1.18.5 localized FAQ topic checks passed.`);
