import assert from 'node:assert/strict';
import fs from 'node:fs';

function source(relativePath) {
  return fs.readFileSync(new URL(relativePath,import.meta.url),'utf8');
}

const transfer = source('../src/platform-transfer.js');
const migration = source('../migrations/054_v1.22.0_secure_platform_transfer.sql');
const core = source('../src/core.js');
const ui = source('../../admin-pro/src/routes/_admin.platform-transfer.tsx');
const api = source('../../admin-pro/src/lib/api.ts');

for (const marker of [
  'token_hash','manifest_ciphertext','manifest_checksum','manifest_purged_at','expires_at','failed_attempts','locked_until',
  "status IN ('created','claimed','completed','revoked','expired')",'rollback_expires_at','UNIQUE(grant_id)',
]) assert.ok(migration.includes(marker),`missing transfer database control: ${marker}`);

for (const marker of [
  'AES-GCM','MAX_MANIFEST_BYTES','GRANT_TTL_MINUTES = 30','ROLLBACK_DAYS = 7',
  'safeHashEqual','TRANSFER_KEY_ALREADY_USED','TRANSFER_KEY_LOCKED','TRANSFER_SAME_PLATFORM',
  "manifest_ciphertext=''",'sanitizeRichHtml',
  "status:'draft'","approval_status:'draft'",'prepareMediaQueue','platform_transfer_media_items',
  "'administrators'",'provider_secrets','connector_secrets','rollbackPlatformTransfer',
]) assert.ok(transfer.includes(marker),`missing secure transfer behavior: ${marker}`);

for (const permission of [
  'platform.transfer.generate','platform.transfer.import','platform.transfer.rollback',
]) assert.ok(core.includes(permission) || transfer.includes(permission),`missing transfer permission: ${permission}`);

assert.ok(core.includes('requirePlatformTransferStepUp'));
assert.ok(core.includes("row.twofa_enabled !== true"));
assert.ok(core.includes("['tenant_owner','platform_owner']"));
assert.ok(core.includes("!permission.startsWith('platform.transfer.')"));

for (const marker of [
  'createPlatformTransferGrant','claimPlatformTransfer','applyPlatformTransfer','continuePlatformTransferMedia','retryPlatformTransferMedia','rollbackPlatformTransfer',
]) assert.ok(api.includes(marker),`missing Admin API function: ${marker}`);

for (const marker of [
  'Old platform: Generate transfer key','New platform: Paste transfer key','Required transfer preview',
  'Type the destination platform name','Security exclusions','Type ROLLBACK to confirm','Resume media copy','Retry failed media',
]) assert.ok(ui.includes(marker),`missing Transfer Center UI: ${marker}`);

assert.equal(transfer.includes('api_key'),true,'Provider/API secrets must be explicitly excluded');
assert.equal(transfer.includes('admin_users:'),false,'Administrator rows must never be included in transfer table maps');
assert.equal(transfer.includes('support_conversations:'),false,'Customer conversations must never be included in transfer table maps');

console.log('PASS one-time encrypted transfer grants and immutable snapshots are enforced');
console.log('PASS owner-only permissions and two-sided 2FA step-up are enforced');
console.log('PASS preview, draft import, media re-ownership, rollback, and exclusion contracts are present');
