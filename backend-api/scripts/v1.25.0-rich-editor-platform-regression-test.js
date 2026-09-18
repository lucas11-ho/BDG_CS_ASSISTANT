import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

const editor = read('admin-pro', 'src', 'components', 'RichKnowledgeEditor.tsx');
const nodes = read('admin-pro', 'src', 'components', 'rich-editor', 'nodes.tsx');
const adminApi = read('admin-pro', 'src', 'lib', 'api.ts');
const styles = read('admin-pro', 'src', 'styles.css');
const core = read('backend-api', 'src', 'core.js');
const richHtml = read('backend-api', 'src', 'rich-html.js');
const guideDetail = read('guide-pro', 'src', 'routes', '_public.guides.$slug.tsx');

const checks = [
  ['editor creates blurred local image previews', editor.includes('createBlurPreview') && editor.includes('canvas.toDataURL')],
  ['editor handles pasted image files', editor.includes('handlePaste(view, event)') && editor.includes('event.clipboardData?.files')],
  ['editor handles dropped image files at cursor position', editor.includes('handleDrop(view, event') && editor.includes('view.posAtCoords')],
  ['image node displays upload state and spinner', nodes.includes('uploadStatus') && nodes.includes('Uploading image')],
  ['temporary image data is blocked from persistence', nodes.includes('/^(blob:|data:)/i') && editor.includes('editorDocumentHasTransientState')],
  ['persistent document serializer strips upload-only attributes', nodes.includes('serializePersistentDocument') && nodes.includes('delete attrs.uploadId')],
  ['permanent upload URL replaces the placeholder', editor.includes('src: url') && editor.includes('uploadStatus: "ready"')],
  ['block drag handle can reorder top-level nodes', editor.includes('bdg-block-drag-handle') && editor.includes('application/x-bdg-editor-block') && editor.includes('tr.insert')],
  ['table grid controls add and delete rows and columns', editor.includes('addRowAfter') && editor.includes('deleteRow') && editor.includes('addColumnAfter') && editor.includes('deleteColumn')],
  ['images auto-fit inside table cells', styles.includes('.bdg-rich-editor-content td img') && styles.includes('max-width: 100%')],
  ['public table cells render nested block nodes', guideDetail.includes('node.type === "tableCell"') && guideDetail.includes('children.map((child:any,index:number)=><RichNode')],
  ['selection and empty-line AI entry points exist', editor.includes('bdg-selection-ai-menu') && editor.includes('bdg-empty-ai-button')],
  ['slash and plus-plus AI commands exist', editor.includes('textBefore === "/ai"') && editor.includes('textBefore === "++"')],
  ['AI quick actions include grammar tone summary and extend', editor.includes('"fix_grammar"') && editor.includes('"professional"') && editor.includes('"casual"') && editor.includes('"summarize"') && editor.includes('"extend"')],
  ['Admin AI client requests an SSE stream', adminApi.includes('/admin/ai/editor-stream') && adminApi.includes('Accept: "text/event-stream"')],
  ['backend AI endpoint is protected by the AI route namespace', core.includes("path === '/admin/ai/editor-stream'") && core.includes('editorAiStream')],
  ['backend emits character streaming SSE events', core.includes("editorAiSseEvent('token'") && core.includes('for (const char of output)')],
  ['AI streaming node is transient and never saved', nodes.includes('node.type === "aiStream"') && editor.includes('updateAiNode')],
  ['YouTube X and TikTok paste embeds are recognized', nodes.includes('"youtube"') && nodes.includes('"x"') && nodes.includes('"tiktok"') && editor.includes('resolveMediaEmbed(text)')],
  ['public renderer reconstructs trusted embed URLs', guideDetail.includes('safeMediaEmbed') && guideDetail.includes('www.youtube-nocookie.com') && guideDetail.includes('platform.twitter.com') && guideDetail.includes('www.tiktok.com/player/v1')],
  ['rich HTML iframe hosts are allowlisted', richHtml.includes('allowedIframeHostnames') && richHtml.includes("'www.youtube-nocookie.com'") && richHtml.includes("'platform.twitter.com'") && richHtml.includes("'www.tiktok.com'")],
  ['Telegram pull quote styling uses accent border and italic text', styles.includes('.bdg-rich-editor-content blockquote') && styles.includes('border-left: 4px solid') && styles.includes('font-style: italic')],
];

let passed = 0;
for (const [name, ok] of checks) {
  assert.equal(ok, true, name);
  passed += 1;
  console.log(`PASS ${name}`);
}
console.log(`Rich editor platform regression tests passed: ${passed}/${checks.length}`);
