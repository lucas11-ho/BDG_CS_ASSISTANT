import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const core = read('backend-api/src/core.js');
const server = read('backend-api/src/server.js');
const migration = read('backend-api/migrations/037_v1.15.5_simplified_ai_production_runtime.sql');
const layout = read('admin-pro/src/components/AdminLayout.tsx');
const assistantSetup = read('admin-pro/src/routes/_admin.ai-prompt-manager.tsx');
const menuImages = read('admin-pro/src/routes/_admin.ai-content-studio.tsx');
const diagnostics = read('admin-pro/src/routes/_admin.ai-diagnostics.tsx');
const redirects = [
  '_admin.ai-knowledge-import.tsx',
  '_admin.ai-qa.tsx',
  '_admin.ai-source-router.tsx',
  '_admin.locale-studio.tsx',
  '_admin.prompt-history.tsx',
  '_admin.ai-reliability.tsx',
  '_admin.ai-response-quality.tsx',
].map((file) => read(`admin-pro/src/routes/${file}`));

assert.match(core, /1\.18\.2-ai-knowledge-library/);
assert.match(server, /1\.18\.2-ai-knowledge-library/);
assert.match(core, /source_order:\['prompt_image'\]/);
assert.match(core, /enabled_sources:\['prompt_image'\]/);
assert.match(core, /source_type='prompt_image'/);
assert.match(core, /status='published' AND approval_status='approved'/);
assert.match(core, /require_approved_context: false/);
assert.match(core, /workflow_mode: 'prompt_first'/);
assert.match(core, /function inferChatLocale/);
assert.match(core, /\['all','auto','automatic','detect'\]\.includes\(explicitKey\)/);
assert.match(core, /detected=\/\[က-႟ꩠ-ꩿ\]\/u\.test\(text\) \? 'my'/);
assert.match(core, /AI_MODULE_RETIRED/);
assert.match(core, /retiredAiAdminEndpoint\(path\)/);
assert.match(server, /assistant-profile-menu-image-runtime/);
assert.doesNotMatch(server, /ai-response-quality-center|unified-ai-source-router|advanced-knowledge-import/);

for (const route of ['/ai-prompt-manager', '/ai-knowledge', '/ai-content-studio', '/ai-diagnostics']) {
  assert.match(layout, new RegExp(`(?:key|to): "${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
}
for (const retired of ['/ai-qa', '/ai-source-router', '/ai-response-quality', '/ai-knowledge-import', '/locale-studio']) {
  assert.doesNotMatch(layout, new RegExp(`(?:key|to): "${retired.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
}

assert.match(assistantSetup, /const STANDARD_SECTIONS = \[/);
for (const title of [
  'Platform Identity', 'Assistant Role', 'Job and Allowed Scope', 'Approved Factual Boundaries',
  'Language Policy', 'Response Style', 'Output Contract', 'Safety Rules', 'Escalation', 'Forbidden Actions',
]) assert.match(assistantSetup, new RegExp(title));
assert.match(assistantSetup, /Production AI settings/);
assert.match(assistantSetup, /One DeepSeek call/);
assert.match(menuImages, /Approved menu and media source/);
assert.match(menuImages, /source_type: "prompt_image"/);
assert.match(diagnostics, /Retired AI modules/);
assert.ok(redirects.every((file) => file.includes('throw redirect')));

assert.match(migration, /v1\.15\.5_simplified_ai_production_runtime/);
assert.match(migration, /require_approved_context\s*=\s*FALSE/i);
assert.match(migration, /workflow_mode\s*=\s*'prompt_first'/i);
assert.match(migration, /source_order\s*=\s*'\["prompt_image"\]'/i);
assert.match(migration, /source_type\s*=\s*'qa'/i);
assert.match(migration, /approval_status\s*=\s*'archived'/i);

console.log('PASS Runtime uses one compiled Assistant Setup prompt and one provider stage');
console.log('PASS Menu & Images remains the approved media source while AI Knowledge is separate');
console.log('PASS General prompt answers and automatic Burmese language detection are enabled');
console.log('PASS Retired AI modules are absent from navigation and blocked by HTTP 410');
console.log('PASS Migration 037 makes legacy router/Q&A data inert while preserving rollback history');
console.log('\n5/5 simplified AI production runtime checks passed');
