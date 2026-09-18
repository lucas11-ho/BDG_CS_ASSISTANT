import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const editor = read('admin-pro', 'src', 'components', 'RichKnowledgeEditor.tsx');
const utils = read('admin-pro', 'src', 'lib', 'rich-editor-utils.ts');
const adminStyles = read('admin-pro', 'src', 'styles.css');
const guideStyles = read('guide-pro', 'src', 'styles.css');
const adminHeaders = read('admin-pro', 'public', '_headers');
const guideHeaders = read('guide-pro', 'public', '_headers');
const richHtml = read('backend-api', 'src', 'rich-html.js');
const publicSanitizer = read('guide-pro', 'src', 'lib', 'sanitize-html.ts');
const ci = read('.github', 'workflows', 'ci.yml');
const production = read('.github', 'workflows', 'bdg-production-release.yml');

const checks = [
  ['Admin CSP permits YouTube frames', adminHeaders.includes('frame-src https://www.youtube.com') && !adminHeaders.includes("frame-src 'none'")],
  ['Guide CSP permits YouTube frames', guideHeaders.includes('frame-src https://www.youtube.com') && !guideHeaders.includes("frame-src 'none'")],
  ['CSP remains provider-scoped rather than arbitrary https frames', !adminHeaders.includes('frame-src https:;') && !guideHeaders.includes('frame-src https:;')],
  ['YouTube URLs use the standard inline embed player', utils.includes('https://www.youtube.com/embed/') && utils.includes('?rel=0&playsinline=1')],
  ['YouTube watch shorts live embed and youtu.be parsing remain supported', utils.includes('host === "youtu.be"') && utils.includes('(?:embed|shorts|live|v)')],
  ['Editor player enables standard playback capabilities', editor.includes('clipboard-write') && editor.includes('gyroscope') && editor.includes('picture-in-picture')],
  ['Backend sanitizer permits standard YouTube embed host', richHtml.includes("host === 'www.youtube.com'") && richHtml.includes("host === 'youtube.com'")],
  ['Public sanitizer permits standard YouTube embed host', publicSanitizer.includes('host === "www.youtube.com"') && publicSanitizer.includes('host === "youtube.com"')],
  ['Admin embeds use compact inline article width', adminStyles.includes('width: min(100%, 360px)') && adminStyles.includes('max-width: 360px')],
  ['Public embeds use compact inline article width', guideStyles.includes('width: min(100%, 360px)') && guideStyles.includes('max-width: 360px')],
  ['Open-original fallback remains available', editor.includes('bdg-media-fallback') && guideStyles.includes('.bdg-media-fallback')],
  ['Normal CI runs v1.25.2 YouTube regression', ci.includes('npm run test:v1252-youtube')],
  ['Production release runs v1.25.2 YouTube regression', production.includes('npm --prefix backend-api run test:v1252-youtube')],
];

for (const [name, ok] of checks) {
  assert.ok(ok, name);
  console.log(`PASS ${name}`);
}
console.log(`PASS v1.25.2 YouTube inline player regression (${checks.length} checks)`);
