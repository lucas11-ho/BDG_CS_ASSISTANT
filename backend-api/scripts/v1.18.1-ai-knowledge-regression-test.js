import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rankApprovedMenuCandidates } from '../src/plain-text-ai.js';

const core = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const admin = await readFile(new URL('../../admin-pro/src/routes/_admin.ai-knowledge.tsx', import.meta.url), 'utf8');

assert.match(core, /async function buildAiKnowledgeCatalog\(/, 'AI Knowledge catalog must exist');
assert.match(core, /path === '\/admin\/knowledge'/, 'AI Knowledge admin CRUD route must be active');
assert.match(core, /APPROVED AI KNOWLEDGE/, 'AI Knowledge must be injected as bounded dynamic context');
assert.match(core, /buildAiKnowledgeCatalog\(env, scope, 500\)/, 'AI Knowledge retrieval must remain bounded');
assert.match(core, /promptClip\(entry\.row\.knowledge_content \|\| '', 4500\)/, 'Selected answers must have a per-entry prompt budget');

const retiredStart = core.indexOf('function retiredAiAdminEndpoint');
assert.ok(retiredStart >= 0, 'Retired AI endpoint guard must remain present');
const retiredBlock = core.slice(retiredStart, retiredStart + 1800);
assert.equal(retiredBlock.includes('/^\\/admin\\/knowledge(?:\\/|$)/'), false, 'AI Knowledge must not remain inside the retired endpoint guard');
assert.match(retiredBlock, /knowledge-import/, 'Other retired knowledge-import modules must stay retired');

assert.match(admin, /label="Question"/, 'Admin UI must expose Question');
assert.match(admin, /label="Type"/, 'Admin UI must expose Type');
assert.match(admin, /label="Answer"/, 'Admin UI must expose Answer');
assert.match(admin, /separate from Guide-page FAQs/, 'Admin UI must state Guide FAQ separation');

const rows = [{
  id: -1001,
  title: 'How can I change my withdrawal bank account?',
  positive_examples: 'change bank | wrong withdrawal bank | replace linked bank',
  keywords: 'Account Bank Withdrawal',
  knowledge_content: 'Use the approved bank-change procedure.',
  priority: 100,
  confidence_threshold: 25,
}];
const ranked = rankApprovedMenuCandidates('my withdrawal bank is wrong, how can I change it?', rows, 3);
assert.equal(ranked.length, 1, 'Relevant AI Knowledge must be retrievable');
assert.equal(ranked[0].row.id, -1001, 'The matching knowledge row must be selected');
assert.ok(ranked[0].score >= ranked[0].threshold, 'Matched knowledge must meet its confidence threshold');

console.log('v1.18.1 AI Knowledge regression checks passed');
