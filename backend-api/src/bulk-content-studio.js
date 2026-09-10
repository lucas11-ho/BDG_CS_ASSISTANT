import ExcelJS from 'exceljs';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

const { Pool } = pg;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_IMPORT_ROWS = 1000;
const FAQ_STATUSES = new Set(['draft', 'published', 'archived']);
const GUIDE_STATUSES = new Set(['draft', 'published', 'archived']);
const IMAGE_TYPES = {
  png: { mime: 'image/png', ext: 'png' },
  jpg: { mime: 'image/jpeg', ext: 'jpg' },
  jpeg: { mime: 'image/jpeg', ext: 'jpg' },
  webp: { mime: 'image/webp', ext: 'webp' },
  gif: { mime: 'image/gif', ext: 'gif' },
};
const pools = new Map();

function text(value, max = 20000) {
  return String(value == null ? '' : value).replace(/\u00a0/g, ' ').trim().slice(0, max);
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

function localeKey(value) {
  return text(value, 35).toLowerCase().replace(/_/g, '-');
}

function slugKey(value) {
  return text(value, 180).toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
}

function normalizedQuestion(value) {
  return text(value, 500).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizedName(value) {
  return text(value, 220).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseList(value) {
  return text(value, 5000).split('|').map((part) => part.trim()).filter(Boolean);
}

function parseStoredIds(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  const raw = text(value, 5000);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(Number).filter(Number.isFinite);
  } catch {}
  return raw.split(/[\s,|]+/).map(Number).filter(Number.isFinite);
}

function safeStatus(value, allowed, fallback = 'draft') {
  const status = text(value, 30).toLowerCase() || fallback;
  return allowed.has(status) ? status : '';
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
      application_name: 'bdg-bulk-content-studio',
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

async function platformLocalePolicy(env, scope, q = query) {
  const registry = (await q(env === q ? undefined : env, '', [])).rows;
  return registry;
}

async function getLocalePolicy(q, scope) {
  const registry = (await q(
    `SELECT locale,is_default FROM platform_locales WHERE tenant_id=$1 AND platform_id=$2 AND is_enabled=TRUE ORDER BY is_default DESC, sort_order ASC, id ASC`,
    [scope.tenant_id, scope.platform_id],
  )).rows;
  if (registry.length) {
    return {
      defaultLocale: localeKey(registry.find((row) => row.is_default)?.locale || registry[0].locale),
      locales: new Set(registry.map((row) => localeKey(row.locale)).filter(Boolean)),
    };
  }
  const platform = (await q('SELECT default_locale,supported_languages FROM saas_platforms WHERE id=$1 AND tenant_id=$2 LIMIT 1', [scope.platform_id, scope.tenant_id])).rows[0] || {};
  const defaultLocale = localeKey(platform.default_locale || 'en');
  let values = [];
  try { values = JSON.parse(platform.supported_languages || '[]'); } catch { values = String(platform.supported_languages || '').split(/[\s,]+/); }
  return { defaultLocale, locales: new Set([defaultLocale, ...values.map(localeKey)].filter(Boolean)) };
}

function workbookImageMap(workbook, sheet) {
  const map = new Map();
  const images = typeof sheet.getImages === 'function' ? sheet.getImages() : [];
  for (const image of images || []) {
    const tl = image?.range?.tl || {};
    const nativeRow = Number(tl.nativeRow ?? tl.row);
    const nativeCol = Number(tl.nativeCol ?? tl.col);
    if (!Number.isFinite(nativeRow) || !Number.isFinite(nativeCol)) continue;
    const row = Math.floor(nativeRow) + 1;
    const col = Math.floor(nativeCol) + 1;
    let media = null;
    try { if (typeof workbook.getImage === 'function') media = workbook.getImage(image.imageId); } catch {}
    if (!media && Array.isArray(workbook?.model?.media)) media = workbook.model.media.find((entry) => Number(entry.index) === Number(image.imageId));
    const extension = text(media?.extension || media?.type || '', 12).toLowerCase();
    if (!media?.buffer || !IMAGE_TYPES[extension]) continue;
    map.set(`${row}:${col}`, { buffer: Buffer.from(media.buffer), extension: IMAGE_TYPES[extension].ext, mime: IMAGE_TYPES[extension].mime });
  }
  return map;
}

function isImageSignature(buffer, extension) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return false;
  if (extension === 'png') return buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (extension === 'jpg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
  if (extension === 'gif') return ['GIF87a','GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'));
  if (extension === 'webp') return buffer.subarray(0,4).toString('ascii') === 'RIFF' && buffer.subarray(8,12).toString('ascii') === 'WEBP';
  return false;
}

async function loadWorkbook(buffer, sheetName) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet(sheetName) || workbook.worksheets[0];
  if (!sheet) throw Object.assign(new Error(`The workbook does not contain a ${sheetName} sheet.`), { status: 400, code: 'BULK_SHEET_REQUIRED' });
  return { workbook, sheet };
}

function rowValues(sheet, rowNumber, width) {
  const row = sheet.getRow(rowNumber);
  return Array.from({ length: width }, (_, index) => cellText(row.getCell(index + 1).value));
}

async function parseFaqWorkbook(buffer) {
  const { sheet } = await loadWorkbook(buffer, 'FAQ');
  const width = Math.max(sheet.actualColumnCount || 0, 4);
  const headers = rowValues(sheet, 1, width);
  const qIndex = locate(headers, ['Question']);
  const localeIndex = locate(headers, ['Locale']);
  const answerIndex = locate(headers, ['Answer']);
  const statusIndex = locate(headers, ['Status']);
  if ([qIndex, localeIndex, answerIndex, statusIndex].some((index) => index < 0)) throw Object.assign(new Error('FAQ workbook must contain Question, Locale, Answer and Status columns.'), { status: 400, code: 'FAQ_COLUMNS_REQUIRED' });
  const rows = [];
  const seen = new Map();
  for (let rowNumber = 2; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
    const values = rowValues(sheet, rowNumber, width);
    if (!values.some(Boolean)) continue;
    if (rows.length >= MAX_IMPORT_ROWS) throw Object.assign(new Error(`Workbook contains more than ${MAX_IMPORT_ROWS} data rows.`), { status: 400, code: 'BULK_ROW_LIMIT' });
    const question = text(values[qIndex], 500);
    const locale = localeKey(values[localeIndex]);
    const answer = text(values[answerIndex], 20000);
    const status = safeStatus(values[statusIndex], FAQ_STATUSES);
    const key = `${locale}\u0000${normalizedQuestion(question)}`;
    let error = '';
    if (!question) error = 'Question is required.';
    else if (!locale) error = 'Locale is required.';
    else if (!answer) error = 'Answer is required.';
    else if (!status) error = 'Status must be draft, published, or archived.';
    else if (seen.has(key)) error = `Duplicate Question + Locale in workbook (first seen on row ${seen.get(key)}).`;
    if (!error) seen.set(key, rowNumber);
    rows.push({ row_number: rowNumber, question, locale, answer, status, key, error, warnings: [] });
  }
  return rows;
}

async function parseGuideWorkbook(buffer) {
  const { workbook, sheet } = await loadWorkbook(buffer, 'Guide');
  const width = Math.max(sheet.actualColumnCount || 0, 11);
  const headers = rowValues(sheet, 1, width);
  const columns = {
    locale: locate(headers, ['Guide locale', 'Locale']),
    slug: locate(headers, ['Stable slug', 'Slug']),
    category: locate(headers, ['Category']),
    title: locate(headers, ['Title']),
    summary: locate(headers, ['Summary']),
    image: locate(headers, ['Image']),
    status: locate(headers, ['Locale status', 'Status']),
    sort: locate(headers, ['Sort order', 'Priority']),
    buttons: locate(headers, ['Recommended buttons', 'Buttons']),
    seo: locate(headers, ['SEO title']),
    alt: locate(headers, ['Image alt text', 'Alt text']),
  };
  if (Object.values(columns).some((index) => index < 0)) throw Object.assign(new Error('Guide workbook columns do not match the required template.'), { status: 400, code: 'GUIDE_COLUMNS_REQUIRED' });
  const embedded = workbookImageMap(workbook, sheet);
  const rows = [];
  const seen = new Map();
  for (let rowNumber = 2; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
    const values = rowValues(sheet, rowNumber, width);
    const embeddedImage = embedded.get(`${rowNumber}:${columns.image + 1}`) || null;
    if (!values.some(Boolean) && !embeddedImage) continue;
    if (rows.length >= MAX_IMPORT_ROWS) throw Object.assign(new Error(`Workbook contains more than ${MAX_IMPORT_ROWS} data rows.`), { status: 400, code: 'BULK_ROW_LIMIT' });
    const locale = localeKey(values[columns.locale]);
    const rawSlug = text(values[columns.slug], 180).toLowerCase();
    const slug = slugKey(rawSlug);
    const category = text(values[columns.category], 220);
    const title = text(values[columns.title], 180);
    const summary = text(values[columns.summary], 4000);
    const imageUrl = text(values[columns.image], 2000);
    const status = safeStatus(values[columns.status], GUIDE_STATUSES);
    const sortOrderRaw = Number(values[columns.sort]);
    const sort_order = Number.isFinite(sortOrderRaw) && sortOrderRaw > 0 ? Math.min(9999, Math.round(sortOrderRaw)) : 100;
    const recommended_buttons = parseList(values[columns.buttons]);
    const seo_title = text(values[columns.seo], 180);
    const alt_text = text(values[columns.alt], 1000);
    const key = `${slug}\u0000${locale}`;
    const warnings = [];
    let error = '';
    if (!locale) error = 'Guide locale is required.';
    else if (!rawSlug) error = 'Stable slug is required.';
    else if (slug !== rawSlug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) error = 'Stable slug must use lowercase letters, numbers and single hyphens only.';
    else if (!title) error = 'Title is required.';
    else if (!status) error = 'Locale status must be draft, published, or archived.';
    else if (seen.has(key)) error = `Duplicate Stable slug + Guide locale in workbook (first seen on row ${seen.get(key)}).`;
    if (!error) seen.set(key, rowNumber);
    if (!imageUrl && !embeddedImage) warnings.push('No readable image found. The Guide can still be imported and edited later.');
    if (embeddedImage && !isImageSignature(embeddedImage.buffer, embeddedImage.extension)) {
      warnings.push('Embedded image signature is invalid; the row will import without this image.');
    }
    rows.push({ row_number: rowNumber, locale, slug, category, title, summary, image_url: imageUrl, embedded_image: embeddedImage, status, sort_order, recommended_buttons, seo_title, alt_text, key, error, warnings });
  }
  return rows;
}

async function validateFaqRows(q, scope, rows) {
  const policy = await getLocalePolicy(q, scope);
  const existing = (await q('SELECT id,question,locale FROM faqs WHERE tenant_id=$1 AND platform_id=$2 ORDER BY id ASC', [scope.tenant_id, scope.platform_id])).rows;
  const existingMap = new Map(existing.map((row) => [`${localeKey(row.locale)}\u0000${normalizedQuestion(row.question)}`, row]));
  return rows.map((row) => {
    const error = row.error || (!policy.locales.has(row.locale) ? `Unsupported locale: ${row.locale}. Enable it in Platform Settings first.` : '');
    const match = !error ? existingMap.get(row.key) : null;
    return { ...row, error, action: error ? 'skip' : (match ? 'update' : 'create'), existing_id: match?.id || null };
  });
}

async function guideLookups(q, scope) {
  const [policy, categoriesResult, buttonsResult, guidesResult] = await Promise.all([
    getLocalePolicy(q, scope),
    q('SELECT id,name,slug FROM categories WHERE tenant_id=$1 AND platform_id=$2 ORDER BY id ASC', [scope.tenant_id, scope.platform_id]),
    q("SELECT id,button_key,label,status FROM action_buttons WHERE tenant_id=$1 AND platform_id=$2 AND deleted_at IS NULL ORDER BY id ASC", [scope.tenant_id, scope.platform_id]),
    q('SELECT id,slug,category_id,priority,button_ids,title,summary,status FROM guides WHERE tenant_id=$1 AND platform_id=$2 AND deleted_at IS NULL ORDER BY id ASC', [scope.tenant_id, scope.platform_id]),
  ]);
  const categoryMap = new Map();
  for (const row of categoriesResult.rows) {
    categoryMap.set(normalizedName(row.name), row);
    categoryMap.set(normalizedName(row.slug), row);
  }
  const buttonMap = new Map();
  for (const row of buttonsResult.rows) {
    buttonMap.set(normalizedName(row.label), row);
    buttonMap.set(normalizedName(row.button_key), row);
  }
  const guideMap = new Map(guidesResult.rows.map((row) => [slugKey(row.slug), row]));
  const guideIds = guidesResult.rows.map((row) => Number(row.id)).filter(Boolean);
  const translations = guideIds.length
    ? (await q('SELECT id,guide_id,locale,status FROM guide_translations WHERE tenant_id=$1 AND platform_id=$2 AND guide_id = ANY($3::int[]) ORDER BY id ASC', [scope.tenant_id, scope.platform_id, guideIds])).rows
    : [];
  const translationMap = new Map(translations.map((row) => [`${row.guide_id}\u0000${localeKey(row.locale)}`, row]));
  return { policy, categoryMap, buttonMap, guideMap, translationMap, buttons: buttonsResult.rows };
}

async function validateGuideRows(q, scope, rows) {
  const lookups = await guideLookups(q, scope);
  return rows.map((row) => {
    let error = row.error;
    const warnings = [...row.warnings];
    if (!error && !lookups.policy.locales.has(row.locale)) error = `Unsupported locale: ${row.locale}. Enable it in Platform Settings first.`;
    const categoryRow = row.category ? lookups.categoryMap.get(normalizedName(row.category)) : null;
    if (!error && row.category && !categoryRow) error = `Category not found: ${row.category}. Create or correct the category before importing.`;
    const buttonIds = [];
    const unresolvedButtons = [];
    for (const name of row.recommended_buttons) {
      const button = lookups.buttonMap.get(normalizedName(name));
      if (button && button.status === 'active') buttonIds.push(Number(button.id)); else unresolvedButtons.push(name);
    }
    if (unresolvedButtons.length) warnings.push(`Unresolved recommended buttons: ${unresolvedButtons.join(', ')}.`);
    const guide = !error ? lookups.guideMap.get(row.slug) : null;
    const translation = guide ? lookups.translationMap.get(`${guide.id}\u0000${row.locale}`) : null;
    return {
      ...row,
      embedded_image: undefined,
      error,
      warnings,
      category_id: categoryRow?.id || null,
      button_ids: [...new Set(buttonIds)],
      unresolved_buttons: unresolvedButtons,
      existing_guide_id: guide?.id || null,
      existing_translation_id: translation?.id || null,
      action: error ? 'skip' : (translation ? 'update' : 'create'),
      image_source: row.embedded_image ? 'embedded' : (row.image_url ? 'url' : 'none'),
    };
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

async function uploadEmbeddedGuideImage(env, scope, requestUrl, row, embedded) {
  if (!embedded || !isImageSignature(embedded.buffer, embedded.extension)) return '';
  if (!env.GUIDE_IMAGES?.put) throw new Error('Guide image storage is not configured.');
  const key = `tenant-${scope.tenant_id}/platform-${scope.platform_id}/guide-import/${Date.now()}-${randomUUID()}.${embedded.extension}`;
  await env.GUIDE_IMAGES.put(key, embedded.buffer, { httpMetadata: { contentType: embedded.mime }, contentLength: embedded.buffer.length });
  const origin = new URL(requestUrl).origin;
  return `${origin}/uploads/${key}`;
}

async function recordHistory(q, scope, kind, filename, result) {
  await q(
    `INSERT INTO bulk_content_import_batches(tenant_id,platform_id,content_kind,filename,status,total_rows,created_rows,updated_rows,skipped_rows,error_rows,warning_rows,summary_json)
     VALUES($1,$2,$3,$4,'complete',$5,$6,$7,$8,$9,$10,$11)`,
    [scope.tenant_id, scope.platform_id, kind, filename, result.total_rows, result.created, result.updated, result.skipped, result.error_rows || 0, result.warning_rows || 0, JSON.stringify({ errors: result.errors?.slice(0,100) || [], warnings: result.warnings?.slice(0,100) || [] })],
  );
}

export async function buildFaqTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Luke CS AI';
  workbook.title = 'FAQ Import Template';
  const sheet = workbook.addWorksheet('FAQ', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Question', key: 'question', width: 48 },
    { header: 'Locale', key: 'locale', width: 16 },
    { header: 'Answer', key: 'answer', width: 90 },
    { header: 'Status', key: 'status', width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = 'A1:D1';
  sheet.addRow({ question: 'How do I make a deposit?', locale: 'en-us', answer: 'Open Deposit, choose your payment method, and follow the displayed instructions.', status: 'draft' });
  for (let row = 2; row <= 1000; row += 1) sheet.getCell(`D${row}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"draft,published,archived"'] };
  const notes = workbook.addWorksheet('Read Me');
  notes.columns = [{ width: 120 }];
  [
    'FAQ Bulk Content Studio',
    'Required columns: Question, Locale, Answer, Status.',
    'Question + Locale is the import identity. Existing matches are updated; new pairs are created.',
    'Only platform-supported locales are accepted.',
    'Actions is intentionally not an Excel column because Edit/Delete actions exist only in Admin.',
    'By default imports are forced to Draft. Use Preserve spreadsheet status only when you intentionally want the supplied status.',
    `Maximum rows: ${MAX_IMPORT_ROWS}. Maximum workbook size: 20 MB.`,
  ].forEach((value) => notes.addRow([value]));
  notes.getRow(1).font = { bold: true, size: 14 };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function buildGuideTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Luke CS AI';
  workbook.title = 'Guide Import Template';
  const sheet = workbook.addWorksheet('Guide', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Guide locale', key: 'locale', width: 16 },
    { header: 'Stable slug', key: 'slug', width: 30 },
    { header: 'Category', key: 'category', width: 26 },
    { header: 'Title', key: 'title', width: 42 },
    { header: 'Summary', key: 'summary', width: 70 },
    { header: 'Image', key: 'image', width: 28 },
    { header: 'Locale status', key: 'status', width: 16 },
    { header: 'Sort order', key: 'sort', width: 14 },
    { header: 'Recommended buttons', key: 'buttons', width: 42 },
    { header: 'SEO title', key: 'seo', width: 42 },
    { header: 'Image alt text', key: 'alt', width: 52 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = 'A1:K1';
  sheet.addRow({ locale: 'en-us', slug: 'deposit-guide', category: 'Deposit', title: 'How to Make a Deposit', summary: 'Follow these steps to complete a deposit.', status: 'draft', sort: 100, buttons: 'Deposit | Live Chat', seo: 'How to Make a Deposit', alt: 'Deposit guide visual' });
  sheet.getRow(2).height = 60;
  for (let row = 2; row <= 1000; row += 1) sheet.getCell(`G${row}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"draft,published,archived"'] };
  const notes = workbook.addWorksheet('Read Me');
  notes.columns = [{ width: 125 }];
  [
    'Guide Bulk Content Studio',
    'Required visible columns are exactly the columns on the Guide sheet.',
    'Stable slug + Guide locale is the import identity. Keep the slug stable when editing titles.',
    'Image supports a normal HTTPS URL or an image inserted into the Image cell. Google Sheets / Excel embedded-image support is best effort because workbook exports differ.',
    'If an embedded image cannot be mapped to its row, the Guide still imports as Draft and Admin shows a warning so you can replace the image later.',
    'Category must already exist; the importer never creates typo categories automatically.',
    'Recommended buttons use | between names. Unknown buttons are ignored with a warning instead of failing the row.',
    'By default imports are forced to Draft. Existing rich Guide body content is never erased by a blank spreadsheet field.',
    `Maximum rows: ${MAX_IMPORT_ROWS}. Maximum workbook size: 20 MB.`,
  ].forEach((value) => notes.addRow([value]));
  notes.getRow(1).font = { bold: true, size: 14 };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function previewFaqImport(request, env, scope) {
  const { name, buffer } = await workbookFile(request, 'FAQ_Import.xlsx');
  const rows = await parseFaqWorkbook(buffer);
  const validated = await validateFaqRows((sql, params) => query(env, sql, params), scope, rows);
  return { ok: true, filename: name, kind: 'faq', ...previewSummary(validated), rows: validated };
}

export async function previewGuideImport(request, env, scope) {
  const { name, buffer } = await workbookFile(request, 'Guide_Import.xlsx');
  const rows = await parseGuideWorkbook(buffer);
  const validated = await validateGuideRows((sql, params) => query(env, sql, params), scope, rows);
  return { ok: true, filename: name, kind: 'guide', ...previewSummary(validated), rows: validated };
}

export async function applyFaqImport(request, env, scope, options = {}) {
  const { name, buffer } = await workbookFile(request, 'FAQ_Import.xlsx');
  const parsed = await parseFaqWorkbook(buffer);
  const statusMode = options.statusMode === 'preserve' ? 'preserve' : 'draft';
  return transaction(env, async (q) => {
    const rows = await validateFaqRows(q, scope, parsed);
    let created = 0, updated = 0, skipped = 0;
    const errors = [];
    for (const row of rows) {
      if (row.error) { skipped += 1; errors.push({ row_number: row.row_number, error: row.error }); continue; }
      const status = statusMode === 'preserve' ? row.status : 'draft';
      const answerHtml = plainHtml(row.answer);
      const answerJson = plainDoc(row.answer);
      if (row.existing_id) {
        await q(`UPDATE faqs SET question=$1,answer=$2,answer_html=$3,answer_json=$4,locale=$5,status=$6,updated_at=NOW() WHERE id=$7 AND tenant_id=$8 AND platform_id=$9`, [row.question,row.answer,answerHtml,answerJson,row.locale,status,row.existing_id,scope.tenant_id,scope.platform_id]);
        updated += 1;
      } else {
        await q(`INSERT INTO faqs(question,answer,answer_html,answer_json,image_urls,locale,keywords,priority,status,tenant_id,platform_id,updated_at) VALUES($1,$2,$3,$4,'',$5,'',100,$6,$7,$8,NOW())`, [row.question,row.answer,answerHtml,answerJson,row.locale,status,scope.tenant_id,scope.platform_id]);
        created += 1;
      }
    }
    const result = { ok: true, kind: 'faq', filename: name, total_rows: rows.length, created, updated, skipped, error_rows: errors.length, warning_rows: 0, errors, warnings: [] };
    await recordHistory(q, scope, 'faq', name, result);
    return result;
  });
}

export async function applyGuideImport(request, env, scope, options = {}) {
  const { name, buffer } = await workbookFile(request, 'Guide_Import.xlsx');
  const parsed = await parseGuideWorkbook(buffer);
  const statusMode = options.statusMode === 'preserve' ? 'preserve' : 'draft';
  return transaction(env, async (q) => {
    const validated = await validateGuideRows(q, scope, parsed);
    const rawByKey = new Map(parsed.map((row) => [row.key, row]));
    const policy = await getLocalePolicy(q, scope);
    let created = 0, updated = 0, skipped = 0;
    const errors = [];
    const warnings = [];
    for (const row of validated) {
      if (row.error) { skipped += 1; errors.push({ row_number: row.row_number, error: row.error }); continue; }
      const raw = rawByKey.get(row.key);
      let imageUrl = row.image_url;
      if (!imageUrl && raw?.embedded_image && isImageSignature(raw.embedded_image.buffer, raw.embedded_image.extension)) {
        try { imageUrl = await uploadEmbeddedGuideImage(env, scope, request.url, row, raw.embedded_image); }
        catch (error) { warnings.push({ row_number: row.row_number, warning: `Embedded image upload failed: ${error.message}. Guide imported without replacing its image.` }); }
      }
      for (const warning of row.warnings || []) warnings.push({ row_number: row.row_number, warning });
      let guideId = row.existing_guide_id;
      const buttonIdsText = JSON.stringify(row.button_ids || []);
      if (!guideId) {
        const inserted = (await q(`INSERT INTO guides(title,slug,summary,body,image_urls,keywords,language,priority,status,category_id,button_ids,tenant_id,platform_id,updated_at) VALUES($1,$2,$3,'',$4,'',$5,$6,'draft',$7,$8,$9,$10,NOW()) RETURNING id`, [row.title,row.slug,row.summary,imageUrl ? imageUrl : '',policy.defaultLocale,row.sort_order,row.category_id,buttonIdsText,scope.tenant_id,scope.platform_id])).rows[0];
        guideId = Number(inserted.id);
      } else {
        await q(`UPDATE guides SET category_id=$1,priority=$2,button_ids=$3,updated_at=NOW() WHERE id=$4 AND tenant_id=$5 AND platform_id=$6`, [row.category_id,row.sort_order,buttonIdsText,guideId,scope.tenant_id,scope.platform_id]);
      }
      await q('DELETE FROM guide_action_buttons WHERE guide_id=$1', [guideId]);
      let buttonOrder = 100;
      for (const buttonId of row.button_ids || []) await q('INSERT INTO guide_action_buttons(guide_id,button_id,sort_order) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [guideId, buttonId, buttonOrder++]);
      const effectiveStatus = statusMode === 'preserve' ? row.status : 'draft';
      const existingTranslation = (await q('SELECT id,cover_image_url,image_urls,body,rich_json,rich_html FROM guide_translations WHERE guide_id=$1 AND platform_id=$2 AND locale=$3 LIMIT 1', [guideId,scope.platform_id,row.locale])).rows[0];
      if (existingTranslation) {
        await q(`UPDATE guide_translations SET title=$1,summary=$2,cover_image_url=CASE WHEN $3<>'' THEN $3 ELSE cover_image_url END,image_urls=CASE WHEN $3<>'' THEN $3 ELSE image_urls END,seo_title=$4,alt_text=$5,status=$6,updated_at=NOW() WHERE id=$7 AND tenant_id=$8 AND platform_id=$9`, [row.title,row.summary,imageUrl,row.seo_title,row.alt_text,effectiveStatus,existingTranslation.id,scope.tenant_id,scope.platform_id]);
        updated += 1;
      } else {
        await q(`INSERT INTO guide_translations(tenant_id,platform_id,guide_id,locale,title,summary,body,rich_json,rich_html,image_urls,cover_image_url,keywords,seo_title,seo_description,alt_text,status,updated_at) VALUES($1,$2,$3,$4,$5,$6,'','','',$7,$7,'',$8,'',$9,$10,NOW())`, [scope.tenant_id,scope.platform_id,guideId,row.locale,row.title,row.summary,imageUrl,row.seo_title,row.alt_text,effectiveStatus]);
        created += 1;
      }
      if (row.locale === policy.defaultLocale) {
        await q(`UPDATE guides SET title=$1,summary=$2,category_id=$3,priority=$4,button_ids=$5,cover_image_url=CASE WHEN $6<>'' THEN $6 ELSE cover_image_url END,image_urls=CASE WHEN $6<>'' THEN $6 ELSE image_urls END,language=$7,updated_at=NOW() WHERE id=$8`, [row.title,row.summary,row.category_id,row.sort_order,buttonIdsText,imageUrl,policy.defaultLocale,guideId]);
      }
    }
    const result = { ok: true, kind: 'guide', filename: name, total_rows: validated.length, created, updated, skipped, error_rows: errors.length, warning_rows: warnings.length, errors, warnings };
    await recordHistory(q, scope, 'guide', name, result);
    return result;
  });
}

export async function exportFaqWorkbook(env, scope) {
  const rows = (await query(env, 'SELECT question,locale,answer,status FROM faqs WHERE tenant_id=$1 AND platform_id=$2 ORDER BY locale ASC,priority ASC,id ASC', [scope.tenant_id,scope.platform_id])).rows;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Luke CS AI';
  const sheet = workbook.addWorksheet('FAQ', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Question', key: 'question', width: 48 }, { header: 'Locale', key: 'locale', width: 16 }, { header: 'Answer', key: 'answer', width: 90 }, { header: 'Status', key: 'status', width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = 'A1:D1';
  rows.forEach((row) => sheet.addRow({ question: row.question, locale: row.locale, answer: row.answer, status: row.status }));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function exportGuideWorkbook(env, scope) {
  const q = (sql, params) => query(env, sql, params);
  const policy = await getLocalePolicy(q, scope);
  const guides = (await q(`SELECT g.*,c.name AS category_name FROM guides g LEFT JOIN categories c ON c.id=g.category_id WHERE g.tenant_id=$1 AND g.platform_id=$2 AND g.deleted_at IS NULL ORDER BY g.priority ASC,g.id ASC`, [scope.tenant_id,scope.platform_id])).rows;
  const translations = guides.length ? (await q(`SELECT * FROM guide_translations WHERE tenant_id=$1 AND platform_id=$2 AND guide_id=ANY($3::int[]) ORDER BY guide_id ASC,locale ASC`, [scope.tenant_id,scope.platform_id,guides.map((g) => Number(g.id))])).rows : [];
  const buttons = (await q(`SELECT gab.guide_id,b.id,b.label,b.button_key FROM guide_action_buttons gab JOIN action_buttons b ON b.id=gab.button_id WHERE b.tenant_id=$1 AND b.platform_id=$2 AND b.deleted_at IS NULL ORDER BY gab.guide_id,gab.sort_order,b.id`, [scope.tenant_id,scope.platform_id])).rows;
  const buttonsByGuide = new Map();
  for (const row of buttons) {
    const list = buttonsByGuide.get(Number(row.guide_id)) || [];
    list.push(row.label || row.button_key);
    buttonsByGuide.set(Number(row.guide_id), list);
  }
  const translationsByGuide = new Map();
  for (const row of translations) {
    const list = translationsByGuide.get(Number(row.guide_id)) || [];
    list.push(row);
    translationsByGuide.set(Number(row.guide_id), list);
  }
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Luke CS AI';
  const sheet = workbook.addWorksheet('Guide', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Guide locale', key: 'locale', width: 16 }, { header: 'Stable slug', key: 'slug', width: 30 }, { header: 'Category', key: 'category', width: 26 }, { header: 'Title', key: 'title', width: 42 }, { header: 'Summary', key: 'summary', width: 70 }, { header: 'Image', key: 'image', width: 45 }, { header: 'Locale status', key: 'status', width: 16 }, { header: 'Sort order', key: 'sort', width: 14 }, { header: 'Recommended buttons', key: 'buttons', width: 42 }, { header: 'SEO title', key: 'seo', width: 42 }, { header: 'Image alt text', key: 'alt', width: 52 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = 'A1:K1';
  for (const guide of guides) {
    const variants = translationsByGuide.get(Number(guide.id)) || [];
    if (!variants.length) variants.push({ locale: guide.language || policy.defaultLocale, title: guide.title, summary: guide.summary, cover_image_url: guide.cover_image_url, image_urls: guide.image_urls, status: guide.status, seo_title: '', alt_text: '' });
    for (const variant of variants) {
      sheet.addRow({
        locale: variant.locale || policy.defaultLocale,
        slug: guide.slug,
        category: guide.category_name || '',
        title: variant.title || guide.title,
        summary: variant.summary || '',
        image: variant.cover_image_url || String(variant.image_urls || '').split(/[\r\n,]+/).filter(Boolean)[0] || '',
        status: variant.status || 'draft',
        sort: guide.priority || 100,
        buttons: (buttonsByGuide.get(Number(guide.id)) || []).join(' | '),
        seo: variant.seo_title || '',
        alt: variant.alt_text || '',
      });
    }
  }
  const notes = workbook.addWorksheet('Read Me');
  notes.addRow(['Exported Image values are URLs so the file remains re-importable. You can replace a URL with Insert image in cell before importing.']);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function listBulkHistory(env, scope, kind = '') {
  const params = [scope.tenant_id, scope.platform_id];
  let where = 'tenant_id=$1 AND platform_id=$2';
  if (kind === 'faq' || kind === 'guide') { params.push(kind); where += ` AND content_kind=$${params.length}`; }
  const rows = (await query(env, `SELECT id,content_kind,filename,status,total_rows,created_rows,updated_rows,skipped_rows,error_rows,warning_rows,created_at FROM bulk_content_import_batches WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT 50`, params)).rows;
  return { ok: true, rows };
}

export function workbookResponse(buffer, filename) {
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename.replace(/[^A-Za-z0-9_.-]/g, '_')}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function handleBulkContentRoute(request, env, scope) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method.toUpperCase();
  if (method === 'GET' && path === '/admin/content-bulk/faq/template') return workbookResponse(await buildFaqTemplate(), 'FAQ_Import_Template.xlsx');
  if (method === 'GET' && path === '/admin/content-bulk/guide/template') return workbookResponse(await buildGuideTemplate(), 'Guide_Import_Template.xlsx');
  if (method === 'GET' && path === '/admin/content-bulk/faq/export') return workbookResponse(await exportFaqWorkbook(env, scope), 'FAQ_Export.xlsx');
  if (method === 'GET' && path === '/admin/content-bulk/guide/export') return workbookResponse(await exportGuideWorkbook(env, scope), 'Guide_Export.xlsx');
  if (method === 'GET' && path === '/admin/content-bulk/history') return new Response(JSON.stringify(await listBulkHistory(env, scope, url.searchParams.get('kind') || '')), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (method === 'POST' && path === '/admin/content-bulk/faq/preview') return new Response(JSON.stringify(await previewFaqImport(request, env, scope)), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (method === 'POST' && path === '/admin/content-bulk/guide/preview') return new Response(JSON.stringify(await previewGuideImport(request, env, scope)), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  const statusMode = url.searchParams.get('status_mode') === 'preserve' ? 'preserve' : 'draft';
  if (method === 'POST' && path === '/admin/content-bulk/faq/import') return new Response(JSON.stringify(await applyFaqImport(request, env, scope, { statusMode })), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (method === 'POST' && path === '/admin/content-bulk/guide/import') return new Response(JSON.stringify(await applyGuideImport(request, env, scope, { statusMode })), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  return null;
}
