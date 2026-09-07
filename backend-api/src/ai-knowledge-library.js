import ExcelJS from 'exceljs';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;

function text(value, max = 20000) {
  return String(value == null ? '' : value).replace(/\u00a0/g, ' ').trim().slice(0, max);
}

function headerKey(value) {
  return text(value, 200).toLowerCase().replace(/[^a-z0-9]+/g, '');
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

function normalizeQuestion(value) {
  return text(value, 500).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function enabledValue(value) {
  const normalized = text(value, 40).toLowerCase();
  if (!normalized) return true;
  return !['false', '0', 'no', 'n', 'off', 'disabled', 'inactive'].includes(normalized);
}

function locate(headers, names) {
  const wanted = new Set(names.map(headerKey));
  return headers.findIndex((header) => wanted.has(headerKey(header)));
}

async function workbookFileFromRequest(request) {
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    const error = new Error('Excel workbook is required.');
    error.status = 400;
    error.code = 'AI_KNOWLEDGE_FILE_REQUIRED';
    throw error;
  }
  const name = text(file.name || 'AI_Knowledge.xlsx', 255);
  if (!/\.xlsx$/i.test(name)) {
    const error = new Error('Only .xlsx Excel workbooks are supported.');
    error.status = 415;
    error.code = 'AI_KNOWLEDGE_FILE_TYPE';
    throw error;
  }
  if (!Number.isFinite(file.size) || file.size < 1) {
    const error = new Error('Excel workbook is empty.');
    error.status = 400;
    error.code = 'AI_KNOWLEDGE_FILE_EMPTY';
    throw error;
  }
  if (file.size > MAX_FILE_BYTES) {
    const error = new Error('Excel workbook exceeds the 5 MB limit.');
    error.status = 413;
    error.code = 'AI_KNOWLEDGE_FILE_TOO_LARGE';
    throw error;
  }
  return { name, buffer: Buffer.from(await file.arrayBuffer()) };
}

export async function buildAiKnowledgeTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Luke CS AI';
  workbook.title = 'AI Knowledge Import Template';
  const sheet = workbook.addWorksheet('AI Knowledge', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Question', key: 'question', width: 42 },
    { header: 'Type', key: 'type', width: 22 },
    { header: 'Answer', key: 'answer', width: 90 },
    { header: 'Enabled', key: 'enabled', width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = 'A1:D1';
  sheet.addRow({
    question: 'How long does a withdrawal take?',
    type: 'Withdrawal',
    answer: 'Normal withdrawals are usually processed within 5–30 minutes. Bank or payment-channel delays may extend the processing time.',
    enabled: 'TRUE',
  });
  sheet.addRow({
    question: 'Can I change my bank account?',
    type: 'Account',
    answer: 'A linked withdrawal bank account can be changed only through the approved account-change procedure. Follow the current verification requirements before changing bank details.',
    enabled: 'TRUE',
  });
  sheet.getColumn(4).eachCell({ includeEmpty: true }, (cell, rowNumber) => {
    if (rowNumber > 1) cell.dataValidation = { type: 'list', allowBlank: true, formulae: ['"TRUE,FALSE"'] };
  });
  const notes = workbook.addWorksheet('Read Me');
  notes.columns = [{ width: 110 }];
  [
    'AI Knowledge Import',
    'Question is a human-readable title/example. It is NOT an exact keyword trigger.',
    'Answer is the trusted knowledge content. Write answers so they make sense on their own and include the relevant business context.',
    'Type is a free-form category used for organization and light retrieval context.',
    'Enabled accepts TRUE/FALSE, On/Off, Yes/No, or 1/0. Blank defaults to TRUE.',
    'Existing questions are updated (case-insensitive). New questions are created. Duplicate questions inside one workbook are skipped after the first occurrence.',
    `Maximum rows per import: ${MAX_IMPORT_ROWS}. Maximum file size: 5 MB.`,
  ].forEach((value) => notes.addRow([value]));
  notes.getRow(1).font = { bold: true, size: 14 };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function parseAiKnowledgeWorkbook(buffer) {
  if (!buffer?.length) throw new Error('Excel workbook is empty.');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('AI Knowledge') || workbook.worksheets[0];
  if (!sheet) throw new Error('The workbook does not contain an AI Knowledge sheet.');

  const width = Math.max(sheet.actualColumnCount || 0, 4);
  const headers = Array.from({ length: width }, (_, index) => cellText(sheet.getRow(1).getCell(index + 1).value));
  const questionIndex = locate(headers, ['question', 'title', 'example question']);
  const typeIndex = locate(headers, ['type', 'category', 'knowledge type']);
  const answerIndex = locate(headers, ['answer', 'knowledge', 'content', 'approved answer']);
  const enabledIndex = locate(headers, ['enabled', 'active', 'status']);
  if (questionIndex < 0 || answerIndex < 0) {
    const error = new Error('The workbook must contain Question and Answer columns.');
    error.status = 400;
    error.code = 'AI_KNOWLEDGE_COLUMNS_REQUIRED';
    throw error;
  }

  const rows = [];
  const seen = new Map();
  for (let rowNumber = 2; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values = Array.from({ length: width }, (_, index) => cellText(row.getCell(index + 1).value));
    if (!values.some(Boolean)) continue;
    if (rows.length >= MAX_IMPORT_ROWS) {
      const error = new Error(`The workbook contains more than ${MAX_IMPORT_ROWS} data rows.`);
      error.status = 400;
      error.code = 'AI_KNOWLEDGE_ROW_LIMIT';
      throw error;
    }
    const question = text(values[questionIndex], 500);
    const answer = text(values[answerIndex], 20000);
    const type = text(typeIndex >= 0 ? values[typeIndex] : '', 200) || 'General';
    const enabled = enabledIndex >= 0 ? enabledValue(values[enabledIndex]) : true;
    const normalized = normalizeQuestion(question);
    let error = '';
    if (!question) error = 'Question is required.';
    else if (!answer) error = 'Answer is required.';
    else if (seen.has(normalized)) error = `Duplicate question in workbook (first seen on row ${seen.get(normalized)}).`;
    if (!error) seen.set(normalized, rowNumber);
    rows.push({ row_number: rowNumber, question, type, answer, enabled, normalized_question: normalized, error });
  }
  return { rows, total_rows: rows.length, valid_rows: rows.filter((row) => !row.error).length, error_rows: rows.filter((row) => row.error).length };
}

function existingMap(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const key = normalizeQuestion(row.title);
    if (key && !map.has(key)) map.set(key, row);
  }
  return map;
}

export async function previewAiKnowledgeImport(request, scope, query) {
  const { name, buffer } = await workbookFileFromRequest(request);
  const parsed = await parseAiKnowledgeWorkbook(buffer);
  const existing = (await query(
    'SELECT id,title,content,keywords,priority,status FROM knowledge_items WHERE tenant_id=$1 AND platform_id=$2 ORDER BY id ASC',
    [scope.tenant_id, scope.platform_id],
  )).rows;
  const byQuestion = existingMap(existing);
  const rows = parsed.rows.map((row) => ({
    ...row,
    action: row.error ? 'skip' : (byQuestion.has(row.normalized_question) ? 'update' : 'create'),
    existing_id: row.error ? null : Number(byQuestion.get(row.normalized_question)?.id || 0) || null,
  }));
  return {
    ok: true,
    filename: name,
    total_rows: rows.length,
    valid_rows: rows.filter((row) => !row.error).length,
    error_rows: rows.filter((row) => row.error).length,
    create_rows: rows.filter((row) => row.action === 'create').length,
    update_rows: rows.filter((row) => row.action === 'update').length,
    rows,
  };
}

export async function applyAiKnowledgeImport(request, scope, query) {
  const { name, buffer } = await workbookFileFromRequest(request);
  const parsed = await parseAiKnowledgeWorkbook(buffer);
  const existing = (await query(
    'SELECT id,title,content,keywords,priority,status FROM knowledge_items WHERE tenant_id=$1 AND platform_id=$2 ORDER BY id ASC',
    [scope.tenant_id, scope.platform_id],
  )).rows;
  const byQuestion = existingMap(existing);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (const row of parsed.rows) {
    if (row.error) {
      skipped += 1;
      errors.push({ row_number: row.row_number, error: row.error });
      continue;
    }
    const status = row.enabled ? 'active' : 'inactive';
    const match = byQuestion.get(row.normalized_question);
    if (match) {
      const result = await query(
        `UPDATE knowledge_items SET title=$1,content=$2,keywords=$3,priority=100,status=$4,updated_at=NOW()
         WHERE id=$5 AND tenant_id=$6 AND platform_id=$7 RETURNING id,title,content,keywords,priority,status`,
        [row.question, row.answer, row.type, status, match.id, scope.tenant_id, scope.platform_id],
      );
      if (result.rows[0]) {
        byQuestion.set(row.normalized_question, result.rows[0]);
        updated += 1;
      }
    } else {
      const result = await query(
        `INSERT INTO knowledge_items(title,content,keywords,priority,status,tenant_id,platform_id)
         VALUES($1,$2,$3,100,$4,$5,$6) RETURNING id,title,content,keywords,priority,status`,
        [row.question, row.answer, row.type, status, scope.tenant_id, scope.platform_id],
      );
      if (result.rows[0]) {
        byQuestion.set(row.normalized_question, result.rows[0]);
        created += 1;
      }
    }
  }

  return {
    ok: true,
    filename: name,
    total_rows: parsed.total_rows,
    created,
    updated,
    skipped,
    errors: errors.slice(0, 100),
  };
}
