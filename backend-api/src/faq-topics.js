import ExcelJS from 'exceljs';
import pg from 'pg';

const { Pool } = pg;
const pools = new Map();
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_IMPORT_ROWS = 1000;
const FAQ_STATUSES = new Set(['draft', 'published', 'archived']);

function text(value, max = 20000) {
  return String(value == null ? '' : value).replace(/\u00a0/g, ' ').trim().slice(0, max);
}

function localeKey(value) {
  return text(value, 35).toLowerCase().replace(/_/g, '-');
}

function normalizedQuestion(value) {
  return text(value, 500).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function topicLabel(value) {
  return text(value, 160) || 'General';
}

function safeStatus(value) {
  const status = text(value, 30).toLowerCase() || 'draft';
  return FAQ_STATUSES.has(status) ? status : '';
}

function cellText(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (['string', 'number', 'boolean'].includes(typeof value)) return text(value);
  if (Array.isArray(value?.richText)) return text(value.richText.map((part) => part.text || '').join(''));
  if (Object.prototype.hasOwnProperty.call(value, 'result')) return cellText(value.result);
  if (value.text != null) return text(value.text);
  if (value.hyperlink) return text(value.text || value.hyperlink);
  return text(value);
}

function headerKey(value) {
  return cellText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function locate(headers, names) {
  const wanted = new Set(names.map((name) => headerKey(name)));
  return headers.findIndex((header) => wanted.has(headerKey(header)));
}

function getPool(env) {
  const connectionString = env.DATABASE_URL || env.HYPERDRIVE?.connectionString;
  if (!connectionString) throw new Error('Missing required DATABASE_URL');
  if (!pools.has(connectionString)) {
    const ssl = String(env.DATABASE_SSL || 'false').toLowerCase() === 'true' ? { rejectUnauthorized: false } : undefined;
    pools.set(connectionString, new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: Number(env.DB_CONNECT_TIMEOUT_MS || 5000),
      statement_timeout: Number(env.DB_QUERY_TIMEOUT_MS || 15000),
      application_name: 'bdg-faq-topics',
      ssl,
    }));
  }
  return pools.get(connectionString);
}

async function query(env, sql, params = []) {
  return getPool(env).query(sql, params);
}

async function transaction(env, callback) {
  const client = await getPool(env).connect();
  try {
    await client.query('BEGIN');
    const result = await callback((sql, params = []) => client.query(sql, params));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function localePolicy(q, scope) {
  const registry = (await q(
    'SELECT locale,is_default FROM platform_locales WHERE tenant_id=$1 AND platform_id=$2 AND is_enabled=TRUE ORDER BY is_default DESC, sort_order ASC, id ASC',
    [scope.tenant_id, scope.platform_id],
  )).rows;
  if (registry.length) return new Set(registry.map((row) => localeKey(row.locale)).filter(Boolean));
  const platform = (await q('SELECT default_locale,supported_languages FROM saas_platforms WHERE id=$1 AND tenant_id=$2 LIMIT 1', [scope.platform_id, scope.tenant_id])).rows[0] || {};
  let supported = [];
  try { supported = JSON.parse(platform.supported_languages || '[]'); }
  catch { supported = String(platform.supported_languages || '').split(/[\s,]+/); }
  return new Set([localeKey(platform.default_locale || 'en'), ...supported.map(localeKey)].filter(Boolean));
}

function plainDoc(answer = '') {
  const paragraphs = text(answer, 20000).split(/\r?\n+/).map((part) => part.trim()).filter(Boolean);
  return JSON.stringify({
    type: 'doc',
    content: (paragraphs.length ? paragraphs : ['']).map((paragraph) => ({
      type: 'paragraph',
      ...(paragraph ? { content: [{ type: 'text', text: paragraph }] } : {}),
    })),
  });
}

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function plainHtml(answer = '') {
  const paragraphs = text(answer, 20000).split(/\r?\n+/).map((part) => part.trim()).filter(Boolean);
  return (paragraphs.length ? paragraphs : ['']).map((part) => `<p>${escapeHtml(part)}</p>`).join('');
}

async function workbookFile(request, fallbackName) {
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') throw Object.assign(new Error('Excel workbook is required.'), { status: 400, code: 'BULK_FILE_REQUIRED' });
  const name = text(file.name || fallbackName, 255);
  if (!/\.xlsx$/i.test(name)) throw Object.assign(new Error('Only .xlsx Excel workbooks are supported.'), { status: 415, code: 'BULK_FILE_TYPE' });
  if (!Number.isFinite(file.size) || file.size < 1) throw Object.assign(new Error('Excel workbook is empty.'), { status: 400, code: 'BULK_FILE_EMPTY' });
  if (file.size > MAX_FILE_BYTES) throw Object.assign(new Error('Excel workbook exceeds the 20 MB limit.'), { status: 413, code: 'BULK_FILE_TOO_LARGE' });
  return { name, buffer: Buffer.from(await file.arrayBuffer()) };
}

async function parseFaqWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('FAQ') || workbook.worksheets[0];
  if (!sheet) throw Object.assign(new Error('The workbook does not contain an FAQ sheet.'), { status: 400, code: 'BULK_SHEET_REQUIRED' });
  const width = Math.max(sheet.actualColumnCount || 0, 5);
  const headers = Array.from({ length: width }, (_, index) => cellText(sheet.getRow(1).getCell(index + 1).value));
  const qIndex = locate(headers, ['Question']);
  const localeIndex = locate(headers, ['Locale']);
  const topicIndex = locate(headers, ['Topic', 'Category']);
  const answerIndex = locate(headers, ['Answer']);
  const statusIndex = locate(headers, ['Status']);
  if ([qIndex, localeIndex, answerIndex, statusIndex].some((index) => index < 0)) {
    throw Object.assign(new Error('FAQ workbook must contain Question, Locale, Answer and Status columns. Topic is supported and defaults to General for older workbooks.'), { status: 400, code: 'FAQ_COLUMNS_REQUIRED' });
  }
  const rows = [];
  const seen = new Map();
  for (let rowNumber = 2; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
    const values = Array.from({ length: width }, (_, index) => cellText(sheet.getRow(rowNumber).getCell(index + 1).value));
    if (!values.some(Boolean)) continue;
    if (rows.length >= MAX_IMPORT_ROWS) throw Object.assign(new Error(`Workbook contains more than ${MAX_IMPORT_ROWS} data rows.`), { status: 400, code: 'BULK_ROW_LIMIT' });
    const question = text(values[qIndex], 500);
    const locale = localeKey(values[localeIndex]);
    const topicRaw = topicIndex >= 0 ? text(values[topicIndex], 160) : '';
    const topic = topicLabel(topicRaw);
    const topic_supplied = topicIndex >= 0 && !!topicRaw;
    const answer = text(values[answerIndex], 20000);
    const status = safeStatus(values[statusIndex]);
    const key = `${locale}\u0000${normalizedQuestion(question)}`;
    let error = '';
    if (!question) error = 'Question is required.';
    else if (!locale) error = 'Locale is required.';
    else if (!answer) error = 'Answer is required.';
    else if (!status) error = 'Status must be draft, published, or archived.';
    else if (seen.has(key)) error = `Duplicate Question + Locale in workbook (first seen on row ${seen.get(key)}).`;
    if (!error) seen.set(key, rowNumber);
    rows.push({ row_number: rowNumber, question, locale, topic, topic_supplied, answer, status, key, error, warnings: [] });
  }
  return rows;
}

async function validateRows(q, scope, rows) {
  const locales = await localePolicy(q, scope);
  const existing = (await q('SELECT id,question,locale,topic FROM faqs WHERE tenant_id=$1 AND platform_id=$2 ORDER BY id ASC', [scope.tenant_id, scope.platform_id])).rows;
  const map = new Map(existing.map((row) => [`${localeKey(row.locale)}\u0000${normalizedQuestion(row.question)}`, row]));
  return rows.map((row) => {
    const error = row.error || (!locales.has(row.locale) ? `Unsupported locale: ${row.locale}. Enable it in Platform Settings first.` : '');
    const match = !error ? map.get(row.key) : null;
    const effectiveTopic = row.topic_supplied ? row.topic : (match ? topicLabel(match.topic) : 'General');
    return { ...row, topic: effectiveTopic, error, action: error ? 'skip' : (match ? 'update' : 'create'), existing_id: match?.id || null };
  });
}

function previewSummary(rows) {
  return {
    total_rows: rows.length,
    valid_rows: rows.filter((row) => !row.error).length,
    error_rows: rows.filter((row) => row.error).length,
    create_rows: rows.filter((row) => row.action === 'create').length,
    update_rows: rows.filter((row) => row.action === 'update').length,
    skip_rows: rows.filter((row) => row.action === 'skip').length,
    warning_rows: rows.filter((row) => row.warnings?.length).length,
  };
}

async function recordHistory(q, scope, filename, result) {
  await q(
    `INSERT INTO bulk_content_import_batches(tenant_id,platform_id,content_kind,filename,status,total_rows,created_rows,updated_rows,skipped_rows,error_rows,warning_rows,summary_json)
     VALUES($1,$2,'faq',$3,'complete',$4,$5,$6,$7,$8,$9,$10)`,
    [scope.tenant_id, scope.platform_id, filename, result.total_rows, result.created, result.updated, result.skipped, result.error_rows || 0, result.warning_rows || 0, JSON.stringify({ errors: result.errors?.slice(0, 100) || [], warnings: [] })],
  );
}

export async function buildFaqTopicTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Luke CS AI';
  workbook.title = 'FAQ Import Template';
  const sheet = workbook.addWorksheet('FAQ', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Question', key: 'question', width: 48 },
    { header: 'Locale', key: 'locale', width: 16 },
    { header: 'Topic', key: 'topic', width: 24 },
    { header: 'Answer', key: 'answer', width: 90 },
    { header: 'Status', key: 'status', width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = 'A1:E1';
  sheet.addRow({ question: 'How do I make a deposit?', locale: 'en-us', topic: 'Deposit', answer: 'Open Deposit, choose your payment method, and follow the displayed instructions.', status: 'draft' });
  for (let row = 2; row <= 1000; row += 1) sheet.getCell(`E${row}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"draft,published,archived"'] };
  const notes = workbook.addWorksheet('Read Me');
  notes.columns = [{ width: 125 }];
  [
    'FAQ Bulk Content Studio — Localized Topics',
    'Columns: Question, Locale, Topic, Answer, Status.',
    'Question + Locale remains the import identity. Changing Topic updates the matching FAQ instead of creating a duplicate.',
    'Topic is locale-specific. Example: en-us = Deposit, hi-in = जमा, my-mm = ငွေသွင်း. Use the language of that FAQ row so customers see a topic they understand.',
    'Older 4-column workbooks without Topic are still accepted. Existing FAQs keep their saved Topic; newly created FAQs use General.',
    'Only platform-supported locales are accepted.',
    'By default imports are forced to Draft. Use Preserve spreadsheet status only when you intentionally want the supplied status.',
    `Maximum rows: ${MAX_IMPORT_ROWS}. Maximum workbook size: 20 MB.`,
  ].forEach((value) => notes.addRow([value]));
  notes.getRow(1).font = { bold: true, size: 14 };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function previewFaqTopicImport(request, env, scope) {
  const { name, buffer } = await workbookFile(request, 'FAQ_Import.xlsx');
  const parsed = await parseFaqWorkbook(buffer);
  const rows = await validateRows((sql, params) => query(env, sql, params), scope, parsed);
  return { ok: true, filename: name, kind: 'faq', ...previewSummary(rows), rows };
}

export async function applyFaqTopicImport(request, env, scope, options = {}) {
  const { name, buffer } = await workbookFile(request, 'FAQ_Import.xlsx');
  const parsed = await parseFaqWorkbook(buffer);
  const statusMode = options.statusMode === 'preserve' ? 'preserve' : 'draft';
  return transaction(env, async (q) => {
    const rows = await validateRows(q, scope, parsed);
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];
    for (const row of rows) {
      if (row.error) {
        skipped += 1;
        errors.push({ row_number: row.row_number, error: row.error });
        continue;
      }
      const status = statusMode === 'preserve' ? row.status : 'draft';
      const answerHtml = plainHtml(row.answer);
      const answerJson = plainDoc(row.answer);
      if (row.existing_id) {
        await q(
          'UPDATE faqs SET question=$1,answer=$2,answer_html=$3,answer_json=$4,locale=$5,topic=$6,status=$7,updated_at=NOW() WHERE id=$8 AND tenant_id=$9 AND platform_id=$10',
          [row.question, row.answer, answerHtml, answerJson, row.locale, row.topic, status, row.existing_id, scope.tenant_id, scope.platform_id],
        );
        updated += 1;
      } else {
        await q(
          `INSERT INTO faqs(question,answer,answer_html,answer_json,image_urls,locale,topic,keywords,priority,status,tenant_id,platform_id,updated_at)
           VALUES($1,$2,$3,$4,'',$5,$6,'',100,$7,$8,$9,NOW())`,
          [row.question, row.answer, answerHtml, answerJson, row.locale, row.topic, status, scope.tenant_id, scope.platform_id],
        );
        created += 1;
      }
    }
    const result = { ok: true, kind: 'faq', filename: name, total_rows: rows.length, created, updated, skipped, error_rows: errors.length, warning_rows: 0, errors, warnings: [] };
    await recordHistory(q, scope, name, result);
    return result;
  });
}

export async function exportFaqTopicWorkbook(env, scope) {
  const rows = (await query(
    env,
    `SELECT question,locale,COALESCE(NULLIF(BTRIM(topic),''),'General') AS topic,answer,status
     FROM faqs WHERE tenant_id=$1 AND platform_id=$2 ORDER BY locale ASC,topic ASC,priority ASC,id ASC`,
    [scope.tenant_id, scope.platform_id],
  )).rows;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Luke CS AI';
  const sheet = workbook.addWorksheet('FAQ', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Question', key: 'question', width: 48 },
    { header: 'Locale', key: 'locale', width: 16 },
    { header: 'Topic', key: 'topic', width: 24 },
    { header: 'Answer', key: 'answer', width: 90 },
    { header: 'Status', key: 'status', width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = 'A1:E1';
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function workbookResponse(buffer, filename) {
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function handleFaqTopicBulkRoute(request, env, scope) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();
  if (method === 'GET' && path === '/admin/content-bulk/faq/template') return workbookResponse(await buildFaqTopicTemplate(), 'FAQ_Import_Template.xlsx');
  if (method === 'GET' && path === '/admin/content-bulk/faq/export') return workbookResponse(await exportFaqTopicWorkbook(env, scope), 'FAQ_Export.xlsx');
  if (method === 'POST' && path === '/admin/content-bulk/faq/preview') return jsonResponse(await previewFaqTopicImport(request, env, scope));
  if (method === 'POST' && path === '/admin/content-bulk/faq/import') {
    return jsonResponse(await applyFaqTopicImport(request, env, scope, { statusMode: url.searchParams.get('status_mode') || 'draft' }));
  }
  return null;
}

export function faqTopicFromJsonBody(body) {
  if (!body) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body).toString('utf8'));
    if (!Object.prototype.hasOwnProperty.call(parsed || {}, 'topic')) return null;
    return topicLabel(parsed.topic);
  } catch {
    return null;
  }
}

export async function persistFaqTopicFromResponse(response, env, topic) {
  if (!response?.ok || topic == null) return;
  let payload = null;
  try { payload = await response.clone().json(); } catch { return; }
  const id = Number(payload?.id);
  if (!Number.isInteger(id) || id < 1) return;
  await query(env, 'UPDATE faqs SET topic=$1,updated_at=NOW() WHERE id=$2', [topicLabel(topic), id]);
}

export async function enrichFaqTopicResponse(response, env) {
  if (!response?.ok) return response;
  let payload = null;
  try { payload = await response.clone().json(); } catch { return response; }
  const list = Array.isArray(payload) ? payload : (payload && typeof payload === 'object' && payload.id != null ? [payload] : null);
  if (!list) return response;
  const ids = [...new Set(list.map((row) => Number(row?.id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return response;
  const rows = (await query(env, 'SELECT id,COALESCE(NULLIF(BTRIM(topic),\'\'),\'General\') AS topic FROM faqs WHERE id=ANY($1::int[])', [ids])).rows;
  const topics = new Map(rows.map((row) => [Number(row.id), topicLabel(row.topic)]));
  const enrich = (row) => {
    const topic = topics.get(Number(row?.id)) || 'General';
    return { ...row, topic, category: topic };
  };
  const nextPayload = Array.isArray(payload) ? payload.map(enrich) : enrich(payload);
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.delete('Content-Length');
  return new Response(JSON.stringify(nextPayload), { status: response.status, headers });
}

export async function closeFaqTopicPools() {
  const all = [...pools.values()];
  pools.clear();
  await Promise.all(all.map((pool) => pool.end().catch(() => undefined)));
}
