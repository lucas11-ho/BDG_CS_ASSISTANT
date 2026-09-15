import assert from 'node:assert/strict';
import fs from 'node:fs';

const wrapper = fs.readFileSync(new URL('../../admin-pro/src/components/GuideCoverStudio.tsx', import.meta.url), 'utf8');
const component = fs.readFileSync(new URL('../../admin-pro/src/components/GuideCoverStudioV3.tsx', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../../admin-pro/src/routes/_admin.guide-images.tsx', import.meta.url), 'utf8');
const faqRoute = fs.readFileSync(new URL('../../admin-pro/src/routes/_admin.faq.tsx', import.meta.url), 'utf8');
const publicApi = fs.readFileSync(new URL('../../guide-pro/src/lib/api.ts', import.meta.url), 'utf8');

assert.ok(wrapper.includes('GuideCoverStudioV3'));
assert.ok(component.includes('canvas.width = 1280'));
assert.ok(component.includes('canvas.height = 720'));
for (const template of [
  'professional',
  'screenshot-focus',
  'security-notice',
  'minimal',
  'app-tutorial',
  'split-panel',
  'glass-card',
  'bold-promo',
  'step-guide',
  'centered-modern',
]) {
  assert.ok(component.includes(`\"${template}\"`), `missing cover template ${template}`);
}
assert.ok(component.includes('TEMPLATE_RECIPES'));
assert.ok(component.includes('applyTemplate'));
assert.ok(component.includes('onChange={(value) => applyTemplate(value)}'));
assert.ok(component.includes('drawTemplateDecorations'));
assert.ok(component.includes('TemplatePreviewDecorations'));
assert.ok(component.includes('layout applied'));
assert.ok(component.includes('template changes apply immediately'));

for (const localeFont of ['Noto Sans Myanmar', 'Noto Sans Devanagari', 'Noto Sans Thai', 'Noto Sans SC', 'Noto Sans Arabic']) {
  assert.ok(component.includes(localeFont), `missing multilingual font fallback ${localeFont}`);
}
assert.ok(component.includes('SF Pro Display'));
assert.ok(component.includes('iOS / Apple System'));
assert.ok(component.includes('isRtlLocale'));
assert.ok(component.includes('Platform / cover logo'));
assert.ok(component.includes('Upload custom logo'));
assert.ok(component.includes('Logo shape'));
assert.ok(component.includes('Alignment / position'));
assert.ok(component.includes('Banner contains text'));
assert.ok(component.includes('Banner font'));
assert.ok(component.includes('Banner text'));
assert.ok(component.includes('Save as platform default'));
assert.ok(component.includes('Guide cover design presets'));
assert.ok(component.includes('guide.cover.default_design.v2'));
assert.ok(component.includes('guide.cover.design_presets.v2'));
assert.ok(component.includes('guide.cover.workspace.v2'));
assert.ok(component.includes('api.getSettings()'));
assert.ok(component.includes('api.update("site-content"'));
assert.ok(component.includes('api.uploadGuide(file)'));
assert.ok(component.includes('api.uploadGuideMotion(file)'));
assert.ok(component.includes('Generate & use cover'));
assert.ok(component.includes('Add screenshot'));
assert.ok(component.includes('Add icon'));
assert.ok(component.includes('Icon library'));
assert.ok(component.includes('Upload custom icon'));
assert.ok(component.includes('Save editable layout'));
assert.ok(component.includes('Load saved layout'));
assert.ok(component.includes('Screenshot added. Drag it directly on the cover'));
assert.ok(component.includes('builtinIconSrc'));
assert.ok(component.includes('selectedLayerId'));

assert.ok(route.includes('GuideCoverStudio'));
assert.ok(route.includes('Professional cover studio'));
assert.ok(route.includes('cover_media_type: \"image\", cover_image_url: url'));
assert.ok(route.includes('Motion media cover / custom override'));
assert.ok(publicApi.includes('tr?.cover_image_url || row?.cover_image_url'));

assert.ok(faqRoute.includes('FAQ Management v2'));
assert.ok(faqRoute.includes('Search question, answer, keywords or topic'));
assert.ok(faqRoute.includes('rowSelection'));
assert.ok(faqRoute.includes('Select all'));
assert.ok(faqRoute.includes('Publish selected'));
assert.ok(faqRoute.includes('Move to draft'));
assert.ok(faqRoute.includes('Delete selected'));
assert.ok(faqRoute.includes('bulkSetStatus'));
assert.ok(faqRoute.includes('bulkDelete'));

console.log('Guide Cover Builder v3 live-template regression contract passed.');
