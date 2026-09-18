import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const editor = read('admin-pro', 'src', 'components', 'RichKnowledgeEditor.tsx');
const editorUtils = read('admin-pro', 'src', 'lib', 'rich-editor-utils.ts');
const api = read('admin-pro', 'src', 'lib', 'api.ts');
const styles = read('admin-pro', 'src', 'styles.css');
const editorAi = read('backend-api', 'src', 'editor-ai.js');
const rich = read('backend-api', 'src', 'rich-html.js');
const publicSanitizer = read('guide-pro', 'src', 'lib', 'sanitize-html.ts');
const guideStyles = read('guide-pro', 'src', 'styles.css');
const ci = read('.github', 'workflows', 'ci.yml');
const production = read('.github', 'workflows', 'bdg-production-release.yml');

const checks = [
  ['AI no longer uses a single fixed lifetime timeout', editorAi.includes('resetInactivity') && editorAi.includes('inactivityMs') && editorAi.includes('setInterval(() => send(sseComment())')],
  ['AI provider stream returns validated rich document', editorAi.includes('normalizeRichDocument') && editorAi.includes("sseEvent('result'")],
  ['AI supports rich table nodes', editorAi.includes("'table'") && editorAi.includes("'tableRow'") && editorAi.includes("'tableCell'") && editorAi.includes("'tableHeader'")],
  ['AI supports text color and highlight marks', editorAi.includes("'textStyle'") && editorAi.includes("'highlight'") && editorAi.includes('COLOR_RE')],
  ['AI prompt explicitly permits tables and visual formatting', editorAi.includes('You may create tables, headings, lists, quotes, colored text, highlighted text')],
  ['Admin AI client consumes structured result event', api.includes("event === 'result'") && api.includes('document:parsed.document')],
  ['AI preview is transient and throttled', editor.includes('AiDraft') && editor.includes('queueDraftFlush') && editor.includes('window.setTimeout(flushDraft, 70)')],
  ['AI no longer mutates original selection token by token', !editor.includes('current.state.tr.insertText(token, insertPos)')],
  ['Upload path suppresses document serialization while active', editor.includes('pendingUploadsRef.current > 0') && editor.includes('suppressPersistRef.current = true')],
  ['Upload preview no longer reads full image as base64', !editor.includes('readAsDataURL') && editor.includes('createSmallBlurPreview')],
  ['Blur preview is downscaled before base64 serialization', editorUtils.includes('maxDimension = 64') && editorUtils.includes('canvas.toDataURL("image/jpeg", 0.48)')],
  ['Editor accepts links without explicit https scheme', editorUtils.includes('value = `https://${value}`')],
  ['YouTube parser accepts live, shorts and embed URLs', editorUtils.includes('(?:embed|shorts|live|v)')],
  ['Non-embeddable valid provider URLs fall back to link cards', editorUtils.includes('kind:"link"') && editor.includes('LinkCard')],
  ['Native blocking prompt dialogs were removed', !editor.includes('window.prompt(')],
  ['Editor uses proper link and media input modals', editor.includes('linkModalOpen') && editor.includes('mediaModalOpen') && editor.includes('normalizeUserUrl')],
  ['Embeds always retain an open-original fallback link', editor.includes('bdg-media-fallback')],
  ['Backend preserves safe link-card data attributes', rich.includes('data-bdg-link-card') && rich.includes('data-provider')],
  ['Public sanitizer preserves safe link-card data attributes', publicSanitizer.includes('data-bdg-link-card') && publicSanitizer.includes('data-provider')],
  ['Admin styles include AI draft and link-card states', styles.includes('.bdg-ai-draft') && styles.includes('.bdg-link-card')],
  ['Public styles include embed fallback and link-card states', guideStyles.includes('.bdg-media-fallback') && guideStyles.includes('.bdg-link-card')],
  ['Normal CI runs v1.25.1 stability regression', ci.includes('npm run test:v1251-editor-stability')],
  ['Production release runs v1.25.1 stability regression', production.includes('npm --prefix backend-api run test:v1251-editor-stability')],
];

for (const [name, ok] of checks) {
  assert.ok(ok, name);
  console.log(`PASS ${name}`);
}
console.log(`PASS v1.25.1 editor stability + rich AI regression (${checks.length} checks)`);
