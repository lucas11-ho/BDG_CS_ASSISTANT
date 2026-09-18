import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const route = read('guide-pro', 'src', 'routes', '_public.guides.$slug.tsx');
const styles = read('guide-pro', 'src', 'styles.css');
const headers = read('guide-pro', 'public', '_headers');
const ci = read('.github', 'workflows', 'ci.yml');
const production = read('.github', 'workflows', 'bdg-production-release.yml');

const checks = [
  ['Guide rich document activates public rich-content styling', route.includes('className="bdg-rich-public space-y-4"')],
  ['Guide JSON renderer handles mediaEmbed nodes', route.includes('node.type === "mediaEmbed"')],
  ['Guide JSON renderer handles linkCard nodes', route.includes('node.type === "linkCard"')],
  ['Guide renderer validates embed hosts before rendering iframe', route.includes('function safeEmbedUrl') && route.includes('host === "www.youtube.com"') && route.includes('host === "platform.twitter.com"') && route.includes('host === "www.tiktok.com"')],
  ['Guide media iframe enables standard playback capabilities', route.includes('clipboard-write') && route.includes('gyroscope') && route.includes('allowFullScreen')],
  ['Guide retains open-original media fallback', route.includes('className="bdg-media-fallback"')],
  ['Guide public media CSS exists', styles.includes('.bdg-rich-public .bdg-media-embed iframe')],
  ['Guide production CSP permits approved YouTube frames', headers.includes('frame-src https://www.youtube.com') && !headers.includes("frame-src 'none'")],
  ['Normal CI runs public rich-media regression', ci.includes('npm run test:v1253-public-media')],
  ['Production release runs public rich-media regression', production.includes('npm --prefix backend-api run test:v1253-public-media')],
];

for (const [name, ok] of checks) {
  assert.ok(ok, name);
  console.log(`PASS ${name}`);
}
console.log(`PASS v1.25.3 public rich-media renderer regression (${checks.length} checks)`);
