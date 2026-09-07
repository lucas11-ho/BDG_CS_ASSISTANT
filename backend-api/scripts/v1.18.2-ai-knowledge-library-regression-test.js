import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildAiKnowledgeTemplate, parseAiKnowledgeWorkbook } from '../src/ai-knowledge-library.js';
import { rankApprovedMenuCandidates } from '../src/plain-text-ai.js';

const core = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const api = await readFile(new URL('../../admin-pro/src/lib/api.ts', import.meta.url), 'utf8');
const admin = await readFile(new URL('../../admin-pro/src/routes/_admin.ai-knowledge.tsx', import.meta.url), 'utf8');

assert.match(core, /1\.18\.2-ai-knowledge-library/, 'Runtime version must advance for production release gating');
assert.match(core, /\/admin\/knowledge\/template/, 'AI Knowledge template route must exist');
assert.match(core, /\/admin\/knowledge\/import-preview/, 'AI Knowledge preview route must exist');
assert.match(core, /\/admin\/knowledge\/import'/, 'AI Knowledge import route must exist');
assert.match(core, /rankApprovedMenuCandidates\(message, knowledgeRows, 5\)/, 'Runtime must allow combining up to five relevant knowledge records');
assert.match(api, /\/admin\/knowledge\/template/, 'Admin API must download the new template');
assert.match(api, /\/admin\/knowledge\/import-preview/, 'Admin API must preview the new workbook import');
assert.match(api, /\/admin\/knowledge\/import/, 'Admin API must apply the new workbook import');
assert.match(admin, /Download Template/, 'AI Knowledge page must expose the template action');
assert.match(admin, /Import Excel/, 'AI Knowledge page must expose Excel import');
assert.match(admin, /not a trigger/i, 'Admin must explain that Question is not a trigger');

const template = await buildAiKnowledgeTemplate();
assert.ok(Buffer.isBuffer(template) && template.length > 1000, 'Template must be a real XLSX workbook');
const parsed = await parseAiKnowledgeWorkbook(template);
assert.equal(parsed.valid_rows, 2, 'Template example rows must parse successfully');
assert.equal(parsed.rows[0].type, 'Withdrawal');
assert.equal(parsed.rows[0].enabled, true);

const rows = [
  {
    id: -2001,
    source_type: 'knowledge',
    title: 'Reference A',
    keywords: 'General',
    knowledge_content: 'Normal withdrawals are usually processed within 5–30 minutes. Bank or payment-channel delays can extend processing time.',
    priority: 100,
    confidence_threshold: 55,
  },
  {
    id: -2002,
    source_type: 'knowledge',
    title: 'Reference B',
    keywords: 'General',
    knowledge_content: 'Deposits are credited after the payment provider confirms the transaction.',
    priority: 100,
    confidence_threshold: 55,
  },
];
const ranked = rankApprovedMenuCandidates('Why is my withdrawal processing taking so long?', rows, 5);
assert.equal(ranked[0]?.row.id, -2001, 'Knowledge retrieval must rank by Answer content rather than a configured question trigger');
assert.equal(ranked[0]?.method, 'knowledge_content_semantic');

const misleadingTitle = rankApprovedMenuCandidates('How do I reset password?', [{
  id: -2003,
  source_type: 'knowledge',
  title: 'How do I reset password?',
  keywords: 'General',
  knowledge_content: 'Weekend promotion rewards are credited after the campaign closes.',
  priority: 100,
}], 5);
assert.equal(misleadingTitle.length, 0, 'An exact Question/title alone must not trigger unrelated knowledge');

console.log('v1.18.2 AI Knowledge library regression checks passed');
