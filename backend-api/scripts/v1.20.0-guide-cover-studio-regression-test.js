import assert from 'node:assert/strict';
import fs from 'node:fs';

const component = fs.readFileSync(new URL('../../admin-pro/src/components/GuideCoverStudio.tsx', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../../admin-pro/src/routes/_admin.guide-images.tsx', import.meta.url), 'utf8');
const publicApi = fs.readFileSync(new URL('../../guide-pro/src/lib/api.ts', import.meta.url), 'utf8');

assert.ok(component.includes('canvas.width = 1280'));
assert.ok(component.includes('canvas.height = 720'));
for (const template of ['professional', 'screenshot-focus', 'security-notice', 'minimal']) {
  assert.ok(component.includes(`\"${template}\"`), `missing cover template ${template}`);
}
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
assert.ok(component.includes('api.getSettings()'));
assert.ok(component.includes('api.update("site-content"'));
assert.ok(component.includes('api.uploadGuide(file)'));
assert.ok(component.includes('api.uploadGuideMotion(file)'));
assert.ok(component.includes('Generate & use cover'));
assert.ok(route.includes('GuideCoverStudio'));
assert.ok(route.includes('Professional cover studio'));
assert.ok(route.includes('cover_media_type: \"image\", cover_image_url: url'));
assert.ok(route.includes('Motion media cover / custom override'));
assert.ok(publicApi.includes('tr?.cover_image_url || row?.cover_image_url'));

console.log('Advanced Guide Cover Designer regression contract passed.');
