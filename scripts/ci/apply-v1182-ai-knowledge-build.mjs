import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const NEW_VERSION = '1.18.2-ai-knowledge-library';
const OLD_VERSION = '1.18.1-ai-knowledge-runtime';

function file(rel) { return path.join(root, rel); }
function read(rel) { return fs.readFileSync(file(rel), 'utf8'); }
function write(rel, value) { fs.writeFileSync(file(rel), value, 'utf8'); }
function replaceOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly 1 marker, found ${count}`);
  return source.replace(search, replacement);
}
function patch(rel, mutate) {
  const before = read(rel);
  const after = mutate(before);
  if (after === before) throw new Error(`${rel}: patch produced no changes`);
  write(rel, after);
  console.log(`PATCH ${rel}`);
}

patch('backend-api/src/core.js', (source) => {
  source = replaceOnce(
    source,
    "import { importedRowToAiContentDraft, parseKnowledgeWorkbook } from './knowledge-import.js';",
    "import { importedRowToAiContentDraft, parseKnowledgeWorkbook } from './knowledge-import.js';\nimport { applyAiKnowledgeImport, buildAiKnowledgeTemplate, previewAiKnowledgeImport } from './ai-knowledge-library.js';",
    'core AI Knowledge library import',
  );
  source = source.replaceAll(OLD_VERSION, NEW_VERSION);
  source = replaceOnce(
    source,
    "  // AI Knowledge is a private assistant-only knowledge source. It is separate from Guide-page FAQs.\n  if (method === 'GET' && path === '/admin/knowledge') return json(await listKnowledge(env, scope), 200, env);",
    `  // AI Knowledge is a private assistant-only knowledge source. It is separate from Guide-page FAQs.\n  if (method === 'GET' && path === '/admin/knowledge/template') {\n    const workbook = await buildAiKnowledgeTemplate();\n    return new Response(workbook, { status:200, headers:{ ...corsHeaders(env), 'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition':'attachment; filename=\"AI_Knowledge_Import_Template.xlsx\"', 'Cache-Control':'no-store' } });\n  }\n  if (method === 'POST' && path === '/admin/knowledge/import-preview') return json(await previewAiKnowledgeImport(request, scope, (sql, params) => q(env, sql, params)), 200, env);\n  if (method === 'POST' && path === '/admin/knowledge/import') {\n    const result = await applyAiKnowledgeImport(request, scope, (sql, params) => q(env, sql, params));\n    await audit(env, 'import', 'knowledge_items', 'excel', \`AI Knowledge Excel import: \${result.created} created, \${result.updated} updated, \${result.skipped} skipped\`, scope);\n    return json(result, 200, env);\n  }\n  if (method === 'GET' && path === '/admin/knowledge') return json(await listKnowledge(env, scope), 200, env);`,
    'core AI Knowledge CRUD route',
  );
  source = replaceOnce(
    source,
    'const rankedKnowledge = rankApprovedMenuCandidates(message, knowledgeRows, 3);',
    'const rankedKnowledge = rankApprovedMenuCandidates(message, knowledgeRows, 5);',
    'knowledge top-five retrieval',
  );
  source = replaceOnce(
    source,
    "`Knowledge ${index + 1}:\\nQuestion: ${promptClip(entry.row.title || '', 500)}\\nType: ${promptClip(entry.row.keywords || 'General', 200)}\\nApproved answer: ${promptClip(entry.row.knowledge_content || '', 4500)}`",
    "`Knowledge ${index + 1}:\\nReference title: ${promptClip(entry.row.title || '', 500)}\\nType: ${promptClip(entry.row.keywords || 'General', 200)}\\nApproved knowledge: ${promptClip(entry.row.knowledge_content || '', 4500)}`",
    'knowledge prompt wording',
  );
  return source;
});

patch('backend-api/src/plain-text-ai.js', (source) => {
  const helper = `function retrievalTokenRelated(left, right) {\n  if (left === right) return true;\n  if (left.length < 4 || right.length < 4) return false;\n  const short = left.length <= right.length ? left : right;\n  const long = left.length <= right.length ? right : left;\n  const prefix = short.slice(0, Math.min(6, short.length));\n  return prefix.length >= 4 && long.startsWith(prefix) && Math.abs(left.length - right.length) <= 5;\n}\nfunction knowledgeAnswerPhrases(value) {\n  return String(value || '').split(/[\\n.!?。！？။]+/u).map((item) => item.trim()).filter((item) => item.length > 3).slice(0, 40);\n}\nfunction rankKnowledgeContentCandidate(message, row) {\n  const answer = String(row.knowledge_content || row.content || '').trim();\n  if (!answer) return null;\n  const messageTokens = [...new Set(tokenizeForRetrieval(message))];\n  if (!messageTokens.length) return null;\n  const answerTokens = [...new Set(tokenizeForRetrieval(answer))];\n  const matched = messageTokens.filter((token) => answerTokens.some((candidate) => retrievalTokenRelated(token, candidate)));\n  const directOverlap = messageTokens.filter((token) => answerTokens.includes(token)).length;\n  const messageCoverage = matched.length / messageTokens.length;\n  const answerPhrases = knowledgeAnswerPhrases(answer);\n  const messageNgrams = charNgrams(message);\n  let bestSimilarity = 0;\n  let matchedPhrase = '';\n  for (const phrase of answerPhrases) {\n    const similarity = jaccard(messageNgrams, charNgrams(phrase));\n    if (similarity > bestSimilarity) { bestSimilarity = similarity; matchedPhrase = phrase; }\n  }\n  const typeTokens = tokenizeForRetrieval(row.keywords || row.category || '');\n  const typeOverlap = messageTokens.filter((token) => typeTokens.some((candidate) => retrievalTokenRelated(token, candidate))).length;\n  const titleTokens = tokenizeForRetrieval(row.title || '');\n  const titleOverlap = messageTokens.filter((token) => titleTokens.some((candidate) => retrievalTokenRelated(token, candidate))).length;\n  // Answer content is the routing evidence. Question/title and Type are only light context,\n  // so an exact Question can never select unrelated knowledge by itself.\n  if (!matched.length && bestSimilarity < 0.12) return null;\n  const score = Math.min(100,\n    messageCoverage * 62 +\n    bestSimilarity * 28 +\n    Math.min(2, typeOverlap) * 3 +\n    Math.min(2, titleOverlap) * 2 +\n    Math.min(2, directOverlap) * 2\n  );\n  const threshold = 18;\n  if (score < threshold) return null;\n  return {\n    row,\n    score:Number(score.toFixed(2)),\n    threshold,\n    method:'knowledge_content_semantic',\n    matchedPhrase,\n    overlap:matched.length,\n    titleOverlap,\n    tokenCoverage:Number(messageCoverage.toFixed(3)),\n    phraseSimilarity:Number(bestSimilarity.toFixed(3)),\n    titleSimilarity:Number(jaccard(messageNgrams, charNgrams(row.title || '')).toFixed(3)),\n  };\n}\n\n`;
  source = replaceOnce(source, 'export function rankApprovedMenuCandidates(message, rows = [], limit = 3) {', helper + 'export function rankApprovedMenuCandidates(message, rows = [], limit = 3) {', 'knowledge semantic helper insertion');
  source = replaceOnce(
    source,
    '  const ranked = [];\n  for (const row of rows) {\n    const sourceText=candidateText(row);',
    "  const ranked = [];\n  for (const row of rows) {\n    if (row?.source_type === 'knowledge') {\n      const knowledgeRank = rankKnowledgeContentCandidate(message, row);\n      if (knowledgeRank) ranked.push(knowledgeRank);\n      continue;\n    }\n    const sourceText=candidateText(row);",
    'knowledge semantic ranking branch',
  );
  return source;
});

patch('backend-api/src/server.js', (source) => source.replaceAll(OLD_VERSION, NEW_VERSION));

patch('admin-pro/src/lib/api.ts', (source) => {
  source = replaceOnce(source, '/admin/knowledge-imports/preview', '/admin/knowledge/import-preview', 'new knowledge preview endpoint');
  source = replaceOnce(source, '/admin/knowledge-imports/template', '/admin/knowledge/template', 'new knowledge template endpoint');
  source = replaceOnce(
    source,
    '  listKnowledgeImports: async () => {',
    `  importAiKnowledgeWorkbook: async (file: File) => {\n    if (MOCK_MODE) return delay({ ok: true, created: 1, updated: 0, skipped: 0 });\n    return uploadAdminFile(file, \"/admin/knowledge/import\") as Promise<any>;\n  },\n\n  listKnowledgeImports: async () => {`,
    'AI Knowledge apply import API',
  );
  return source;
});

patch('admin-pro/src/components/AdminLayout.tsx', (source) => replaceOnce(source, 'const ADMIN_VERSION = "v1.18.1";', 'const ADMIN_VERSION = "v1.18.2";', 'Admin version'));

const activeScriptRoots = ['backend-api/scripts', 'scripts'];
for (const dirRel of activeScriptRoots) {
  const dir = file(dirRel);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(?:js|mjs)$/.test(entry.name)) continue;
    const rel = path.join(dirRel, entry.name).replaceAll('\\', '/');
    let source = read(rel);
    const before = source;
    source = source.replaceAll(OLD_VERSION, NEW_VERSION);
    source = source.replaceAll('const ADMIN_VERSION = "v1.18.1"', 'const ADMIN_VERSION = "v1.18.2"');
    source = source.replaceAll('Admin displays current v1.18.1', 'Admin displays current v1.18.2');
    if (source !== before) { write(rel, source); console.log(`PATCH ${rel}`); }
  }
}

patch('backend-api/package.json', (source) => replaceOnce(
  source,
  '    "test:v1181-ai-knowledge": "node scripts/v1.18.1-ai-knowledge-regression-test.js"',
  '    "test:v1181-ai-knowledge": "node scripts/v1.18.1-ai-knowledge-regression-test.js",\n    "test:v1182-ai-knowledge": "node scripts/v1.18.2-ai-knowledge-library-regression-test.js"',
  'backend v1.18.2 test script',
));

for (const rel of ['.github/workflows/ci.yml', '.github/workflows/bdg-production-release.yml']) {
  patch(rel, (source) => replaceOnce(
    source,
    '          npm --prefix backend-api run test:v1181-ai-knowledge\n',
    '          npm --prefix backend-api run test:v1181-ai-knowledge\n          npm --prefix backend-api run test:v1182-ai-knowledge\n',
    `${rel} v1.18.2 test`,
  ));
}

console.log('v1.18.2 guarded source patch complete');
