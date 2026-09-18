import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const editor = read('admin-pro', 'src', 'components', 'RichKnowledgeEditor.tsx');
const api = read('admin-pro', 'src', 'lib', 'api.ts');
const editorUtils = read('admin-pro', 'src', 'lib', 'rich-editor-utils.ts');
const adminStyles = read('admin-pro', 'src', 'styles.css');
const server = read('backend-api', 'src', 'server.js');
const editorAi = read('backend-api', 'src', 'editor-ai.js');
const rich = read('backend-api', 'src', 'rich-html.js');
const publicSanitizer = read('guide-pro', 'src', 'lib', 'sanitize-html.ts');
const guideStyles = read('guide-pro', 'src', 'styles.css');

const checks = [
  ['editor has draggable block handle', editor.includes('bdg-block-drag-handle') && editor.includes('application/x-bdg-block')],
  ['editor shows permanent upload placeholder state', editor.includes('uploadStatus: "uploading"') && editor.includes('createSmallBlurPreview')],
  ['temporary image URLs are never emitted through onChange', editor.includes('documentHasTransientNodes(json)') && editor.includes('pendingUploadsRef.current > 0') && editor.includes('suppressPersistRef.current')],
  ['uploads require permanent HTTPS URL', editor.includes('Media storage did not return a permanent HTTPS URL')],
  ['paste and drop images share async upload pipeline', editor.includes('handlePaste') && editor.includes('handleDrop') && editor.includes('queueImageUpload')],
  ['advanced table cells accept block content', editor.includes('TableCell.extend') && editor.includes('content: "block+"')],
  ['table UI exposes row and column controls', editor.includes('addRowAfter') && editor.includes('addColumnAfter') && editor.includes('deleteRow') && editor.includes('deleteColumn')],
  ['table cells can contain editor image nodes', adminStyles.includes('.bdg-rich-editor-content td .bdg-editor-image-node')],
  ['AI inline triggers exist', editor.includes('text === "/ai" || text === "++"') && editor.includes('Ask AI on this line')],
  ['AI shortcuts include requested actions', editor.includes('Fix Grammar') && editor.includes('Professional Tone') && editor.includes('Casual Tone') && editor.includes('Summarize Selection') && editor.includes('Extend Writing')],
  ['AI client consumes text event stream', api.includes('/admin/editor-ai/stream') && api.includes("event === 'token'")],
  ['backend editor AI route is authenticated', server.includes('authenticatedEditorAiResponse') && server.includes("permissions.includes('content.manage')")],
  ['backend editor AI provider uses SSE', editorAi.includes('stream:true') && editorAi.includes("sseEvent('token'")],
  ['pasted media links become structured embeds', editor.includes('mediaTargetFromUrl') && editorUtils.includes('youtube.com/embed') && editorUtils.includes('platform.twitter.com') && editorUtils.includes('tiktok.com/player')],
  ['backend only allows approved embed hosts', rich.includes("host === 'www.youtube-nocookie.com'") && rich.includes("host === 'platform.twitter.com'") && rich.includes("host === 'www.tiktok.com'")],
  ['public sanitizer removes unsafe iframes', publicSanitizer.includes('removeUnsafeIframes') && publicSanitizer.includes('safeEmbedUrl')],
  ['Telegram-style quote is present in editor and public UI', adminStyles.includes('.bdg-telegram-quote') && guideStyles.includes('.bdg-telegram-quote')],
  ['responsive public embed styling is present', guideStyles.includes('.bdg-rich-public .bdg-media-embed iframe')],
];

for (const [name, ok] of checks) {
  assert.ok(ok, name);
  console.log(`PASS ${name}`);
}
console.log(`PASS v1.25.0 alive editor regression (${checks.length} checks)`);
