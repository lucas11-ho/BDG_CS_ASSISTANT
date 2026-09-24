import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const transfer = read('backend-api','src','platform-transfer.js');
const migration = read('backend-api','migrations','058_v1.27.0_resumable_platform_transfer_media.sql');
const r2 = read('backend-api','src','r2-adapter.js');
const core = read('backend-api','src','core.js');
const server = read('backend-api','src','server.js');
const api = read('admin-pro','src','lib','api.ts');
const ui = read('admin-pro','src','routes','_admin.platform-transfer.tsx');
const ci = read('.github','workflows','ci.yml');
const production = read('.github','workflows','bdg-production-release.yml');

const checks = [
  ['migration adds durable media queue', migration.includes('CREATE TABLE IF NOT EXISTS platform_transfer_media_items') && migration.includes("status IN ('pending','copying','completed','failed')")],
  ['migration adds durable job progress columns', migration.includes('media_total_files') && migration.includes('media_completed_files') && migration.includes('media_failed_files') && migration.includes('media_completed_bytes') && migration.includes('data_imported_at')],
  ['media queue is idempotent per source and target', migration.includes('UNIQUE(job_id, source_key)') && migration.includes('UNIQUE(job_id, target_key)')],
  ['large library file limit is ten thousand', transfer.includes('const MAX_MEDIA_FILES = 10_000')],
  ['large library byte limit is twenty GiB', transfer.includes('const MAX_MEDIA_BYTES = 20 * 1024 * 1024 * 1024')],
  ['manifest ceiling is expanded to 32 MiB', transfer.includes('const MAX_MANIFEST_BYTES = 32 * 1024 * 1024')],
  ['media copy is bounded to 25 files and 12 seconds per request', transfer.includes('const MEDIA_BATCH_SIZE = 25') && transfer.includes('const MEDIA_BATCH_BUDGET_MS = 12_000')],
  ['individual media retry budget is bounded', transfer.includes('const MAX_MEDIA_ATTEMPTS = 5')],
  ['retryable media is not reported as a terminal failure', transfer.includes("status='failed' AND attempts >= $2")],
  ['queue work uses database row locking', transfer.includes('FOR UPDATE SKIP LOCKED')],
  ['stale in-progress media becomes retryable', transfer.includes("status='copying'") && transfer.includes("INTERVAL '5 minutes'")],
  ['source media discovery includes raw owned R2 keys and upload URLs', transfer.includes('if (item.startsWith(prefix)) keys.add(item)') && transfer.includes('/\\/uploads\\/')],
  ['external media remains outside owned-prefix transfer', transfer.includes('if (key.startsWith(prefix)) keys.add(key)')],
  ['apply imports database data before processing batches', transfer.indexOf('const imported = await importManifest') < transfer.indexOf('return processPlatformTransferMediaBatch')],
  ['manifest media references are rewritten to destination-owned keys before import', transfer.includes('const rewritten = rewriteMedia(manifest,media.replacements)') && transfer.includes('importManifest(tx,rewritten,scope)')],
  ['encrypted manifest is purged after durable database import', transfer.includes("manifest_ciphertext='',manifest_checksum='',manifest_purged_at=NOW()") && transfer.includes('data_imported_at=NOW()')],
  ['media continuation is resumable', transfer.includes('export async function continuePlatformTransferMedia') && transfer.includes('processPlatformTransferMediaBatch')],
  ['failed media can be explicitly retried', transfer.includes('export async function retryPlatformTransferMedia') && transfer.includes("SET status='pending',attempts=0,last_error=NULL")],
  ['destination media is verified after copy', transfer.includes('verifyCopiedMedia') && transfer.includes('GUIDE_IMAGES.head')],
  ['R2 adapter supports object HEAD verification', r2.includes('HeadObjectCommand') && r2.includes('async head(key)')],
  ['old one-shot media copier is removed', !transfer.includes('async function copyOwnedMedia')],
  ['failed media imports remain rollbackable', transfer.includes("['completed','failed'].includes(String(job.status))") && transfer.includes('SELECT target_key FROM platform_transfer_media_items')],
  ['core exposes continue and retry routes', core.includes('/media\\/continue') && core.includes('/media\\/retry') && core.includes('continuePlatformTransferMedia') && core.includes('retryPlatformTransferMedia')],
  ['Admin API exposes continue and retry methods', api.includes('continuePlatformTransferMedia') && api.includes('retryPlatformTransferMedia')],
  ['Admin UI renders progress and recovery actions', ui.includes('<Progress') && ui.includes('Resume media copy') && ui.includes('Retry failed media') && ui.includes('Open progress')],
  ['Admin automatically resumes durable running jobs after refresh', ui.includes('job.status === "running" && job.data_imported_at') && ui.includes('void pumpMedia(running.id)')],
  ['initial transfer still requires typed confirmation and 2FA', ui.includes('Type the destination platform name') && api.includes('twofa_code') && core.includes('requirePlatformTransferStepUp')],
  ['policy exposes large transfer capabilities', transfer.includes('max_media_files:MAX_MEDIA_FILES') && transfer.includes('media_batch_size:MEDIA_BATCH_SIZE')],
  ['runtime advertises resumable transfer features', server.includes("'resumable-platform-transfer-media'") && server.includes("'verified-transfer-media-queue'")],
  ['normal CI runs v1.27 transfer regression', ci.includes('npm run test:v1270-transfer')],
  ['production release runs v1.27 transfer regression', production.includes('npm --prefix backend-api run test:v1270-transfer')],
  ['integration suite forces a multi-batch 30-file transfer', read('backend-api','scripts','integration-test.js').includes("completed_files),25") && read('backend-api','scripts','integration-test.js').includes("completed_files),30")],
];

for (const [name, ok] of checks) {
  assert.ok(ok, name);
  console.log(`PASS ${name}`);
}
console.log(`PASS v1.27.0 resumable Platform Transfer regression (${checks.length} checks)`);
