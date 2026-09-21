import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const editorAi = read('backend-api', 'src', 'editor-ai.js');
const server = read('backend-api', 'src', 'server.js');
const api = read('admin-pro', 'src', 'lib', 'api.ts');
const editor = read('admin-pro', 'src', 'components', 'RichKnowledgeEditor.tsx');
const guide = read('admin-pro', 'src', 'routes', '_admin.guide-images.tsx');
const faq = read('admin-pro', 'src', 'routes', '_admin.faq.tsx');
const styles = read('admin-pro', 'src', 'styles.css');
const ci = read('.github', 'workflows', 'ci.yml');
const production = read('.github', 'workflows', 'bdg-production-release.yml');

const checks = [
  ['AI Writer exposes creative and edit actions', editorAi.includes("'write'") && editorAi.includes("'write_section'") && editorAi.includes("'rewrite'") && editorAi.includes("'shorten'") && editorAi.includes("'expand'") && editorAi.includes("'steps'") && editorAi.includes("'bullets'") && editorAi.includes("'table'") && editorAi.includes("'translate'")],
  ['creative writing is no longer constrained to existing text only', editorAi.includes('This is a creative writing task') && !editorAi.includes('Use only facts present in the selected text or nearby document context')],
  ['platform-specific factual invention remains prohibited', editorAi.includes('Do not fabricate platform-specific policies, payment rules, bonus amounts')],
  ['long-form writing receives a larger token budget', editorAi.includes('if (longForm) return 7000') && editorAi.includes('return selectedText.length > 7000 ? 5500 : 4800')],
  ['writer and formatter are separate provider phases', editorAi.includes('openWriterStream') && editorAi.includes('formatRichDocument') && editorAi.includes("stream:false")],
  ['rich formatter retries invalid structured output', editorAi.includes('for (let attempt = 0; attempt < 2; attempt += 1)') && editorAi.includes('AI is repairing rich formatting')],
  ['structured fallback preserves markdown blocks instead of one plain paragraph', editorAi.includes('function markdownFallback') && editorAi.includes("type:'bulletList'") && editorAi.includes("type:'orderedList'") && editorAi.includes("type:'table'")],
  ['formatter supports tables colors and highlights', editorAi.includes('including requested tables, headings, colors, highlights') && editorAi.includes("'textStyle'") && editorAi.includes("'highlight'")],
  ['AI request accepts document metadata context', api.includes('EditorAiDocumentContext') && api.includes('documentContext?: EditorAiDocumentContext')],
  ['AI response exposes repaired and degraded states', api.includes('repaired?: boolean') && api.includes('formatError?: string')],
  ['AI Writer modal supports 10k custom instructions', editor.includes('maxLength={10000}') && editor.includes('Tell AI exactly what to write, rewrite, format, translate, expand, summarize, or organize')],
  ['AI Writer has full command palette', editor.includes('Write from scratch') && editor.includes('Write a section') && editor.includes('Continue writing') && editor.includes('Rewrite selection') && editor.includes('Turn into steps') && editor.includes('Turn into bullets') && editor.includes('Turn into table') && editor.includes('Translate')],
  ['AI generation keeps a reviewable draft instead of auto-overwriting', editor.includes('setAiCandidate({') && editor.includes('AI draft ready') && editor.includes('commitAiCandidate')],
  ['draft review supports replace insert regenerate and discard', editor.includes('Replace selection') && editor.includes('Insert below') && editor.includes('Insert at cursor') && editor.includes('regenerateAiCandidate') && editor.includes('discardAiCandidate')],
  ['Guide passes live locale and metadata context', guide.includes('locale={activeLocale || defaultLocale}') && guide.includes('documentType: "guide"') && guide.includes('topics: categories') && guide.includes('tags: tags')],
  ['FAQ passes locale and metadata context', faq.includes('documentType: "faq"') && faq.includes('watchedLocale') && faq.includes('watchedQuestion')],
  ['ready AI drafts have a distinct review state', styles.includes('.bdg-ai-draft[data-status="ready"]')],
  ['runtime advertises AI Writer features', server.includes("'ai-writer-v126'") && server.includes("'ai-writer-rich-repair'") && server.includes("'ai-writer-draft-review'")],
  ['normal CI runs v1.26 AI Writer regression', ci.includes('npm run test:v1260-ai-writer')],
  ['production release runs v1.26 AI Writer regression', production.includes('npm --prefix backend-api run test:v1260-ai-writer')],
];

for (const [name, ok] of checks) {
  assert.ok(ok, name);
  console.log(`PASS ${name}`);
}
console.log(`PASS v1.26.0 AI Writer regression (${checks.length} checks)`);
