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
assert.ok(component.includes('isRtlLocale'));
assert.ok(component.includes('api.uploadGuideMotion(file)'));
assert.ok(component.includes('Generate & use cover'));
assert.ok(route.includes('GuideCoverStudio'));
assert.ok(route.includes('Professional cover studio'));
assert.ok(route.includes('cover_media_type: \"image\", cover_image_url: url'));
assert.ok(route.includes('Motion media cover / custom override'));
assert.ok(publicApi.includes('tr?.cover_image_url || row?.cover_image_url'));

console.log('Guide Cover Studio v1 regression contract passed.');
