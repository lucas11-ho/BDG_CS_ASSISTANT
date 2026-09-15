import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import pg from 'pg';
import api, { closeDatabasePools, processNextAiJob, runMigrations } from '../src/core.js';
import { applyGuideImport, closeBulkContentPools } from '../src/bulk-content-studio.js';

const { Pool } = pg;
const ADMIN_ORIGIN = 'https://admin.ar-ai666.com'; // Luke shared Admin infrastructure origin; unknown hostnames are reserved for custom-domain guard tests.
const SHARED_CHAT_ORIGIN = 'https://bdg-chat-pages.pages.dev';
const originalFetch = globalThis.fetch;
let providerMode = 'success';
let selectedSourceId = 0;
const providerRequestKinds = [];
const providerSystemPrompts = [];
const connectionString = String(process.env.TEST_DATABASE_URL || '').trim();
if (!connectionString) throw new Error('TEST_DATABASE_URL is required. Integration tests never fall back to DATABASE_URL.');

const databaseName = decodeURIComponent(new URL(connectionString).pathname.replace(/^\//, ''));
if (!/test/i.test(databaseName)) {
  throw new Error(`Refusing to reset database "${databaseName}" because its name does not contain "test".`);
}

const env = {
  APP_NAME: 'BDG integration test',
  NODE_ENV: 'test',
  DATABASE_PROVIDER: 'postgres',
  DATABASE_URL: connectionString,
  DATABASE_SSL: 'false',
  REQUIRE_NEON_POOLER: false,
  DB_POOL_MAX: '4',
  DB_CONNECT_TIMEOUT_MS: '10000',
  DB_QUERY_TIMEOUT_MS: '120000',
  ADMIN_EMAIL: 'integration-owner@example.test',
  ADMIN_PASSWORD: 'Integration-Test-Password-2026!',
  JWT_SECRET: 'integration-test-jwt-secret-at-least-32-characters-long',
  ALLOWED_ORIGINS: ADMIN_ORIGIN,
  AI_MODE_ENABLED: 'true',
  DEEPSEEK_API_KEY: 'integration-test-provider-key',
  DEEPSEEK_API_BASE: 'https://deepseek.integration.test',
  DEEPSEEK_MODEL: 'deepseek-v4-flash',
  R2_REQUIRED: false,
  GUIDE_IMAGES: null,
  RATE_LIMIT_WINDOW_MS: 60_000,
  RATE_LIMIT_CHAT: 10_000,
  RATE_LIMIT_LOGIN: 10_000,
};

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url;
  if (!String(url || '').startsWith('https://deepseek.integration.test/')) return originalFetch(input, init);
  const request = JSON.parse(String(init.body || '{}'));
  assert.equal(request.model, 'deepseek-v4-flash', 'Integration provider calls must use the current DeepSeek model');
  const systemPrompt = String(request.messages?.[0]?.content || '');
  const isPlainTextPrompt = /Return only the customer-facing answer as plain text/i.test(systemPrompt)
    && /ACTIVE ASSISTANT SETUP RUNTIME/i.test(systemPrompt);
  const requestKind = systemPrompt.startsWith('This is a provider connectivity test')
    ? 'connectivity'
    : isPlainTextPrompt ? 'prompt_first'
    : systemPrompt.startsWith('You are the AI Meaning Judge') ? 'judge' : 'composer';
  providerRequestKinds.push(requestKind);
  providerSystemPrompts.push(systemPrompt);
  if (providerMode === 'outage') return new Response(JSON.stringify({ error:{ message:'simulated provider outage' } }), { status:503, headers:{ 'Content-Type':'application/json' } });
  const userMessage = String(request.messages?.[1]?.content || '');
  if (requestKind === 'connectivity') return new Response(JSON.stringify({ choices:[{ message:{ content:JSON.stringify({ ok:true }) } }] }), { status:200, headers:{ 'Content-Type':'application/json' } });
  if (requestKind === 'prompt_first') {
    const matched = /Customer message:\s*Integration duplicate intent/i.test(userMessage);
    const greeting = /Customer message:\s*halo/i.test(userMessage);
    const indonesian = /requested locale \(id\)|naturally in id\b/i.test(systemPrompt);
    const localizedReply = greeting ? 'Halo, saya mengikuti Prompt Manager.' : matched && indonesian ? 'Jawaban terverifikasi' : matched ? 'Verified answer' : 'I can help with general support questions under the configured role and instructions.';
    return new Response(JSON.stringify({ choices:[{ message:{ content:localizedReply } }] }), { status:200, headers:{ 'Content-Type':'application/json' } });
  }
  // The composer prompt contains an "AI Meaning Judge decision" section.
  // Classify only the dedicated judge prompt by its authoritative prefix so
  // the fake provider cannot accidentally send judge JSON to the composer.
  if (systemPrompt.startsWith('You are the AI Meaning Judge')) {
    return new Response(JSON.stringify({ choices:[{ message:{ content:JSON.stringify({ decision:'match', item_id:selectedSourceId, confidence:96, user_intent:'integration test', desired_outcome:'verified answer', clarification_question:'', reason:'Matched the integration source', tool_call:null }) } }] }), { status:200, headers:{ 'Content-Type':'application/json' } });
  }
  if (providerMode === 'composer_fail') return new Response(JSON.stringify({ error:{ message:'simulated composer outage' } }), { status:503, headers:{ 'Content-Type':'application/json' } });
  const localizedReply = userMessage.includes('Customer message: Integration duplicate intent') && systemPrompt.includes('requested locale (id)')
    ? 'Jawaban terverifikasi'
    : 'Verified answer';
  return new Response(JSON.stringify({ choices:[{ message:{ content:JSON.stringify({ reply:localizedReply, blocks:[{ type:'paragraph', text:localizedReply }] }) } }] }), { status:200, headers:{ 'Content-Type':'application/json' } });
};

let database;
let token = '';
let platform;

async function call(path, {
  method = 'GET', body, platformRoute = platform?.public_route_key, auth = true, authToken = token, origin = ADMIN_ORIGIN,
} = {}) {
  const headers = new Headers();
  if (origin) headers.set('Origin', origin);
  if (auth && authToken) headers.set('Authorization', `Bearer ${authToken}`);
  if (platformRoute) headers.set('X-BDG-Platform-Route', platformRoute);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await api.fetch(new Request(`https://api.example.test${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { response, payload };
}

function base32Bytes(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(secret || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const character of clean) bits += alphabet.indexOf(character).toString(2).padStart(5, '0');
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return new Uint8Array(bytes);
}

async function currentTotp(secret) {
  const counter = Math.floor(Date.now() / 30000);
  const message = new ArrayBuffer(8);
  new DataView(message).setUint32(4, counter);
  const key = await crypto.subtle.importKey('raw', base32Bytes(secret), { name:'HMAC', hash:'SHA-1' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
  const offset = signature.at(-1) & 0xf;
  const binary = ((signature[offset] & 0x7f) << 24) | ((signature[offset + 1] & 0xff) << 16) | ((signature[offset + 2] & 0xff) << 8) | (signature[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, '0');
}

async function multilingualGuideWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Guide');
  sheet.addRow(['Guide locale', 'Stable slug', 'Category', 'Title', 'Summary', 'Image', 'Locale status', 'Sort order', 'Recommended buttons', 'SEO title', 'Image alt text']);
  sheet.addRow(['en-us', 'how-to-withdraw', '', 'How to withdraw', 'English withdrawal guide', '', 'draft', 100, '', 'How to withdraw', 'Withdrawal guide']);
  sheet.addRow(['hi-in', 'how-to-withdraw', '', 'निकासी कैसे करें', 'हिंदी निकासी गाइड', '', 'draft', 100, '', 'निकासी कैसे करें', 'निकासी गाइड']);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function expectStatus(result, status, label) {
  assert.equal(result.response.status, status, `${label}: ${JSON.stringify(result.payload)}`);
  return result.payload;
}

function jsonObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function processQueuedAiJob(jobId, label) {
  let job = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await processNextAiJob(env, `integration-worker-${jobId}-${attempt + 1}`);
    job = (await database.query('SELECT * FROM ai_jobs WHERE id=$1 LIMIT 1', [jobId])).rows[0] || null;
    assert.ok(job, `${label}: queued AI job must exist`);
    if (['COMPLETED','FAILED','CANCELLED','SUPPRESSED'].includes(String(job.status))) break;
    if (job.status === 'RETRYING') {
      await database.query('UPDATE ai_jobs SET available_at=NOW(),locked_at=NULL,locked_by=NULL WHERE id=$1', [jobId]);
    }
  }
  assert.ok(job && ['COMPLETED','FAILED','CANCELLED','SUPPRESSED'].includes(String(job.status)), `${label}: AI job did not reach a terminal state: ${JSON.stringify(job)}`);
  const message = (await database.query('SELECT * FROM support_messages WHERE id=$1 LIMIT 1', [job.result_message_id])).rows[0] || null;
  assert.ok(message, `${label}: terminal AI job must save a customer-visible message`);
  const metadata = jsonObject(message.metadata_json, {});
  const chatLog = (await database.query('SELECT * FROM chat_logs WHERE session_id=$1 ORDER BY id DESC LIMIT 1', [job.chat_session_id])).rows[0] || null;
  return {
    job,
    message,
    metadata,
    chatLog,
    reply:String(message.body_text || ''),
    response_blocks:Array.isArray(metadata.response_blocks) ? metadata.response_blocks : [],
    response_status:String(metadata.response_status || chatLog?.response_status || ''),
    resolution_path:String(metadata.resolution_path || chatLog?.resolution_path || ''),
  };
}

async function submitAndCompleteChat(body, label) {
  const accepted = expectStatus(await call('/chat', {
    method:'POST', auth:false, platformRoute:'', origin:SHARED_CHAT_ORIGIN, body,
  }), 202, label);
  assert.equal(accepted.ok, true, `${label}: asynchronous acknowledgement must be successful`);
  assert.equal(accepted.accepted, true, `${label}: message must be accepted`);
  assert.equal(accepted.mode, 'AI_PROCESSING', `${label}: response mode must be AI_PROCESSING`);
  assert.ok(Number(accepted.ai_job?.id) > 0, `${label}: acknowledgement must include the durable AI job`);
  const completed = await processQueuedAiJob(Number(accepted.ai_job.id), label);
  return { accepted, ...completed };
}

try {
  const reset = new Pool({ connectionString, ssl:false, max:1 });
  await reset.query('DROP SCHEMA public CASCADE');
  await reset.query('CREATE SCHEMA public');
  await reset.end();

  const migrationFiles = (await readdir(new URL('../migrations/', import.meta.url)))
    .filter((name) => /^\d{3}_.+\.sql$/i.test(name));
  const firstMigration = await runMigrations(env);
  assert.equal(firstMigration.file_migrations.applied.length, migrationFiles.length, 'Every SQL migration file should run on a clean database');
  const secondMigration = await runMigrations(env);
  assert.equal(secondMigration.file_migrations.skipped.length, migrationFiles.length, 'A second migration run should skip every checksum-matched file');

  database = new Pool({ connectionString, ssl:false, max:2 });
  const registry = await database.query('SELECT filename,checksum_sha256 FROM schema_migration_files ORDER BY filename');
  assert.equal(registry.rowCount, migrationFiles.length);
  assert.ok(registry.rows.every((row) => /^[a-f0-9]{64}$/.test(row.checksum_sha256)));
  const qualityTables = await database.query("SELECT COUNT(*)::integer AS count FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('ai_quality_findings','ai_quality_test_cases','ai_quality_test_runs')");
  assert.equal(qualityTables.rows[0].count, 3);
  const promptRuntimeTables = await database.query("SELECT COUNT(*)::integer AS count FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('ai_prompt_runtime_versions','ai_prompt_runtime_state')");
  assert.equal(promptRuntimeTables.rows[0].count, 2);
  const supportTables = await database.query("SELECT COUNT(*)::integer AS count FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('support_staff_profiles','support_staff_permissions','support_settings','support_conversations','support_messages','support_assignments','support_transfers','support_internal_notes','support_staff_sessions','support_presence_sessions','support_activity_events','support_audit_events')");
  assert.equal(supportTables.rows[0].count, 12, 'Migration 038 must create the complete Human Support foundation');
  const supportDefaults = (await database.query('SELECT human_support_enabled,heartbeat_interval_seconds,offline_timeout_seconds FROM support_settings ORDER BY id LIMIT 1')).rows[0];
  assert.equal(supportDefaults.human_support_enabled, false, 'Human Support must remain disabled until acceptance testing');
  assert.equal(Number(supportDefaults.heartbeat_interval_seconds), 30);
  assert.equal(Number(supportDefaults.offline_timeout_seconds), 90);
  const modelSettings = (await database.query('SELECT model,require_approved_context,max_tokens FROM ai_model_settings ORDER BY id LIMIT 1')).rows[0];
  assert.equal(modelSettings.model, 'deepseek-v4-flash');
  assert.equal(modelSettings.require_approved_context, false);
  assert.ok(Number(modelSettings.max_tokens) >= 1200);

  const login = await call('/auth/login', {
    method:'POST', auth:false, platformRoute:'',
    body:{ email:env.ADMIN_EMAIL, password:env.ADMIN_PASSWORD },
  });
  const loginBody = expectStatus(login, 200, 'Owner login');
  token = loginBody.access_token;
  assert.ok(token);

  platform = (await database.query(`SELECT id,tenant_id,public_route_key FROM saas_platforms
    WHERE archived_at IS NULL AND status='active' ORDER BY id LIMIT 1`)).rows[0];
  assert.ok(platform?.public_route_key, 'Bootstrap must create an active routed platform');
  const workflowMode = (await database.query('SELECT workflow_mode FROM ai_reliability_settings WHERE tenant_id=$1 AND platform_id=$2', [platform.tenant_id,platform.id])).rows[0]?.workflow_mode;
  assert.equal(workflowMode, 'prompt_first');
  await database.query(`UPDATE saas_platforms SET supported_languages='["en","id"]' WHERE id=$1`, [platform.id]);
  await database.query(`INSERT INTO platform_locales(tenant_id,platform_id,locale,display_name,native_name,direction,is_default,is_enabled)
    VALUES($1,$2,'id','Indonesian','Bahasa Indonesia','ltr',FALSE,TRUE)
    ON CONFLICT(tenant_id,platform_id,locale) DO UPDATE SET is_enabled=TRUE`, [platform.tenant_id,platform.id]);

  const secondaryEmail = 'security-admin@example.test';
  const secondaryPassword = 'Security-Admin-Password-2026!';
  const createdAdmin = expectStatus(await call('/admin/admin-users', {
    method:'POST', platformRoute:'', body:{ name:'Security Admin', email:secondaryEmail, password:secondaryPassword, role:'owner' },
  }), 200, 'Create a protected secondary administrator');
  assert.equal(createdAdmin.role, 'admin', 'Only the configured account may retain the global owner role');

  const secondaryLogin = expectStatus(await call('/auth/login', {
    method:'POST', auth:false, platformRoute:'', body:{ email:secondaryEmail, password:secondaryPassword },
  }), 200, 'Log in as the secondary administrator');
  const secondaryToken = secondaryLogin.access_token;
  assert.ok(secondaryToken);
  expectStatus(await call('/admin/me', { platformRoute:'', authToken:secondaryToken }), 200, 'Secondary token works before revocation');
  expectStatus(await call(`/admin/admin-users/${createdAdmin.id}/force-logout`, {
    method:'POST', platformRoute:'', body:{},
  }), 200, 'Owner force logout revokes the target account');
  expectStatus(await call('/admin/me', { platformRoute:'', authToken:secondaryToken }), 401, 'Revoked secondary token is rejected');

  const ownerSecret = 'JBSWY3DPEHPK3PXP';
  const targetSecret = 'KRUGS4ZANFZSAYJA';
  await database.query('UPDATE admin_users SET twofa_enabled=TRUE,twofa_secret=$1 WHERE lower(email)=lower($2)', [ownerSecret, env.ADMIN_EMAIL]);
  await database.query('UPDATE admin_users SET twofa_enabled=TRUE,twofa_secret=$1 WHERE id=$2', [targetSecret, createdAdmin.id]);
  const setupWhileEnabled = expectStatus(await call('/admin/me/2fa/setup', { method:'POST', platformRoute:'', body:{} }), 409, 'Enabled 2FA cannot be silently replaced');
  assert.equal(setupWhileEnabled.code, 'TWOFA_ALREADY_ENABLED');
  const missingConfirmation = expectStatus(await call(`/admin/admin-users/${createdAdmin.id}/reset-2fa`, {
    method:'POST', platformRoute:'', body:{ owner_code:await currentTotp(ownerSecret) },
  }), 400, 'Reset 2FA requires typed target confirmation');
  assert.equal(missingConfirmation.code, 'ADMIN_CONFIRMATION_REQUIRED');
  const missingStepUp = expectStatus(await call(`/admin/admin-users/${createdAdmin.id}/reset-2fa`, {
    method:'POST', platformRoute:'', body:{ confirmation:secondaryEmail },
  }), 403, 'Reset 2FA requires owner step-up verification');
  assert.equal(missingStepUp.code, 'OWNER_2FA_REQUIRED');
  expectStatus(await call(`/admin/admin-users/${createdAdmin.id}/reset-2fa`, {
    method:'POST', platformRoute:'', body:{ confirmation:secondaryEmail, owner_code:await currentTotp(ownerSecret) },
  }), 200, 'Owner reset 2FA clears protection and revokes target sessions');
  const resetTarget = (await database.query('SELECT twofa_enabled,twofa_secret FROM admin_users WHERE id=$1', [createdAdmin.id])).rows[0];
  assert.equal(resetTarget.twofa_enabled, false);
  assert.equal(resetTarget.twofa_secret, null);
  const ownerAudit = expectStatus(await call('/admin/audit-logs'), 200, 'Owner reads scoped and owner-security audit events');
  assert.ok(ownerAudit.some((entry) => entry.action === 'reset_2fa' && entry.actor_email === env.ADMIN_EMAIL));

  await database.query(`INSERT INTO platform_locales(tenant_id,platform_id,locale,display_name,native_name,direction,is_default,is_enabled,sort_order)
    VALUES
      ($1,$2,'en-us','English (US)','English (US)','ltr',FALSE,TRUE,20),
      ($1,$2,'hi-in','Hindi (India)','हिन्दी','ltr',FALSE,TRUE,30)
    ON CONFLICT(tenant_id,platform_id,locale) DO UPDATE SET is_enabled=TRUE`, [platform.tenant_id,platform.id]);
  const workbook = await multilingualGuideWorkbook();
  const importForm = new FormData();
  importForm.append('file', new Blob([workbook], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'Guide_Multilingual.xlsx');
  const importResult = await applyGuideImport(new Request('https://api.example.test/admin/content-bulk/guide/import', { method:'POST', body:importForm }), env, platform, { statusMode:'draft' });
  assert.equal(importResult.created, 2);
  assert.equal(Number((await database.query("SELECT COUNT(*)::int AS count FROM guides WHERE platform_id=$1 AND slug='how-to-withdraw' AND deleted_at IS NULL", [platform.id])).rows[0].count), 1);
  const importedGuide = (await database.query("SELECT id FROM guides WHERE platform_id=$1 AND slug='how-to-withdraw' AND deleted_at IS NULL", [platform.id])).rows[0];
  assert.equal(Number((await database.query('SELECT COUNT(*)::int AS count FROM guide_translations WHERE platform_id=$1 AND guide_id=$2', [platform.id, importedGuide.id])).rows[0].count), 2);
  await database.query("UPDATE guide_translations SET body='preserved body',rich_html='<p>preserved body</p>' WHERE guide_id=$1 AND locale='en-us'", [importedGuide.id]);
  const secondImportForm = new FormData();
  secondImportForm.append('file', new Blob([workbook], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'Guide_Multilingual.xlsx');
  const secondImport = await applyGuideImport(new Request('https://api.example.test/admin/content-bulk/guide/import', { method:'POST', body:secondImportForm }), env, platform, { statusMode:'draft' });
  assert.equal(secondImport.updated, 2);
  const preservedTranslation = (await database.query("SELECT body,rich_html FROM guide_translations WHERE guide_id=$1 AND locale='en-us'", [importedGuide.id])).rows[0];
  assert.equal(preservedTranslation.body, 'preserved body');
  assert.equal(preservedTranslation.rich_html, '<p>preserved body</p>');

  const runtimeRole = expectStatus(await call('/admin/ai/prompts', {
    method:'POST', body:{ section_key:'integration_runtime_role', title:'Integration Runtime Role', content:'INTEGRATION_ROLE_MARKER: You are the versioned integration assistant.', enabled:true, priority:5 },
  }), 200, 'Publish integration runtime role section');
  const runtimeOutput = expectStatus(await call('/admin/ai/prompts', {
    method:'POST', body:{ section_key:'integration_runtime_output', title:'Integration Runtime Output', content:'INTEGRATION_OUTPUT_MARKER: Answer clearly and directly.', enabled:true, priority:6 },
  }), 200, 'Publish integration runtime output section');
  assert.ok(runtimeOutput.prompt_runtime.version_number > runtimeRole.prompt_runtime.version_number);
  assert.notEqual(runtimeOutput.prompt_runtime.compiled_prompt_hash, runtimeRole.prompt_runtime.compiled_prompt_hash);
  const runtimeResponse = await call('/admin/ai/prompt-runtime');
  const runtimeAdmin = expectStatus(runtimeResponse, 200, 'Read exact active prompt runtime');
  assert.match(runtimeResponse.response.headers.get('cache-control') || '', /no-store/i);
  assert.match(runtimeAdmin.runtime.compiled_prompt, /INTEGRATION_ROLE_MARKER/);
  assert.match(runtimeAdmin.runtime.compiled_prompt, /INTEGRATION_OUTPUT_MARKER/);
  assert.ok(runtimeAdmin.runtime.section_ids.includes(Number(runtimeRole.id)));
  assert.ok(runtimeAdmin.runtime.section_ids.includes(Number(runtimeOutput.id)));

  const providerTest = expectStatus(await call('/admin/ai/reliability/test', { method:'POST', body:{ message:'provider connectivity' } }), 200, 'Run a real provider connectivity test');
  assert.equal(providerTest.ok, true);
  assert.equal(providerTest.model, 'deepseek-v4-flash');
  assert.equal(providerTest.checks.find((check) => check.name === 'provider connection')?.ok, true);

  const unsafeHtml = '<p>Verified answer</p><img src="https://cdn.example.test/help.png" onerror="alert(1)"><a href="javascript:alert(2)">bad</a><script>alert(3)</script>';
  const createdFaq = expectStatus(await call('/admin/faqs', {
    method:'POST',
    body:{ question:'Integration duplicate intent', answer:'Verified answer', answer_html:unsafeHtml, locale:'en', status:'published' },
  }), 200, 'Create sanitized FAQ');
  assert.ok(createdFaq.id);
  assert.doesNotMatch(createdFaq.answer_html, /script|onerror|javascript:/i);
  const storedFaq = (await database.query('SELECT answer_html FROM faqs WHERE id=$1', [createdFaq.id])).rows[0];
  assert.doesNotMatch(storedFaq.answer_html, /script|onerror|javascript:/i);


  const createdMenuSource = expectStatus(await call('/admin/ai-content', {
    method:'POST',
    body:{
      content_name:'Integration duplicate intent', title:'Integration duplicate intent',
      intent_key:'integration-duplicate-intent', locale:'en', source_type:'prompt_image',
      status:'published', approval_status:'approved',
      positive_examples:'Integration duplicate intent\nVerified integration answer',
      negative_examples:'Unrelated integration request',
      knowledge_content:'Verified answer', example_answers:'Verified answer',
      ai_instruction:'Use only the approved content.',
      image_urls:['https://cdn.example.test/help.png'], image_delivery:'after_answer',
    },
  }), 200, 'Create approved Menu & Images source');
  selectedSourceId = Number(createdMenuSource.id);
  assert.equal(createdMenuSource.source_type, 'prompt_image');

  const publicFaqPath = `/faqs?platform=${encodeURIComponent(platform.public_route_key)}&language=en`;
  const publicFaqs = expectStatus(await call(publicFaqPath, {
    auth:false, platformRoute:'', origin:SHARED_CHAT_ORIGIN,
  }), 200, 'Read public FAQs through the shared Chat hostname');
  const publicFaq = publicFaqs.find((row) => Number(row.id) === Number(createdFaq.id));
  assert.ok(publicFaq);
  assert.doesNotMatch(publicFaq.answer_html, /script|onerror|javascript:/i);

  const mismatchedHostname = expectStatus(await call(publicFaqPath, {
    auth:false, platformRoute:'', origin:'https://unmapped-customer.example.test',
  }), 400, 'Reject a route that does not match the custom hostname');
  assert.equal(mismatchedHostname.code, 'PLATFORM_CONTEXT_MISMATCH');

  const isolatedTenant = (await database.query(`INSERT INTO saas_tenants(tenant_key,name,status,default_locale)
    VALUES('integration-isolated','Integration Isolated','active','en') RETURNING id`)).rows[0];
  const isolatedPlatform = (await database.query(`INSERT INTO saas_platforms(tenant_id,platform_key,public_route_key,name,default_locale,supported_languages,support_mode,legacy_support_platform_key,status)
    VALUES($1,'isolated','p-integration-isolated-1a2b3c4d5e','Integration Isolated','en','["en"]','none','integration-isolated','active') RETURNING public_route_key`, [isolatedTenant.id])).rows[0];
  const isolatedFaqs = expectStatus(await call('/admin/faqs', { platformRoute:isolatedPlatform.public_route_key }), 200, 'Read isolated platform FAQs');
  assert.equal(isolatedFaqs.some((row) => Number(row.id) === Number(createdFaq.id)), false, 'Platform-scoped API must not leak FAQ rows');

  const callsBeforeGreeting = providerRequestKinds.length;
  const promptGreeting = await submitAndCompleteChat({ message:'halo', language:'id', platform_key:platform.public_route_key, session_id:'integration-prompt-greeting' }, 'Queue and complete an Indonesian greeting through the active Prompt Manager runtime');
  assert.equal(promptGreeting.job.status, 'COMPLETED');
  assert.equal(promptGreeting.response_status, 'success');
  assert.equal(promptGreeting.resolution_path, 'prompt_first_general_answer');
  assert.match(promptGreeting.reply, /Halo/i);
  assert.deepEqual(providerRequestKinds.slice(callsBeforeGreeting), ['prompt_first']);
  assert.match(providerSystemPrompts.at(-1), /INTEGRATION_ROLE_MARKER/);
  assert.match(providerSystemPrompts.at(-1), /INTEGRATION_OUTPUT_MARKER/);
  assert.equal(promptGreeting.response_blocks.some((block) => block.type === 'error'), false);

  const localizedAiAnswer = await submitAndCompleteChat({ message:'Integration duplicate intent', language:'id', platform_key:platform.public_route_key, session_id:'integration-id-answer' }, 'Queue and complete a default-locale verified answer for an Indonesian customer');
  assert.equal(localizedAiAnswer.job.status, 'COMPLETED');
  assert.equal(localizedAiAnswer.response_status, 'success');
  assert.match(localizedAiAnswer.reply, /Jawaban terverifikasi/);
  assert.equal(localizedAiAnswer.resolution_path, 'prompt_first_grounded_answer');
  assert.equal(localizedAiAnswer.response_blocks.filter((block) => block.type === 'image').length, 1, 'A matched source must attach its approved image once');
  assert.match(localizedAiAnswer.response_blocks.find((block) => block.type === 'image')?.url || '', /cdn\.example\.test\/help\.png/);
  assert.deepEqual(providerRequestKinds.slice(-1), ['prompt_first'], 'A normal answer must use one provider call');

  const callsBeforeGeneral = providerRequestKinds.length;
  const generalAnswer = await submitAndCompleteChat({ message:'What can you help me with today?', language:'en', platform_key:platform.public_route_key, session_id:'integration-general-answer' }, 'Queue and complete a general question under Prompt Manager rules');
  assert.equal(generalAnswer.job.status, 'COMPLETED');
  assert.equal(generalAnswer.response_status, 'success');
  assert.equal(generalAnswer.resolution_path, 'prompt_first_general_answer');
  assert.match(generalAnswer.reply, /general support questions/i);
  assert.deepEqual(providerRequestKinds.slice(callsBeforeGeneral), ['prompt_first'], 'A general prompt answer must use exactly one provider call');

  const runtimeBeforeEdit = String(generalAnswer.chatLog?.prompt_runtime_hash || '');
  assert.match(runtimeBeforeEdit, /^[a-f0-9]{64}$/);
  const editedRole = expectStatus(await call(`/admin/ai/prompts/${runtimeRole.id}`, {
    method:'PUT', body:{ section_key:'integration_runtime_role', title:'Integration Runtime Role', content:'INTEGRATION_ROLE_MARKER_V2: You are the newly published integration assistant.', enabled:true, priority:5 },
  }), 200, 'Publish a changed prompt runtime');
  assert.notEqual(editedRole.prompt_runtime.compiled_prompt_hash, runtimeBeforeEdit);
  const afterPromptChange = await submitAndCompleteChat({ message:'What changed in your instructions?', language:'en', platform_key:platform.public_route_key, session_id:'integration-general-answer' }, 'Queue and complete an answer after a prompt runtime change');
  assert.equal(afterPromptChange.job.status, 'COMPLETED');
  assert.match(String(afterPromptChange.chatLog?.memory_reset_reason || ''), /^prompt_runtime_changed:/);
  assert.equal(afterPromptChange.chatLog?.prompt_runtime_hash, editedRole.prompt_runtime.compiled_prompt_hash);
  assert.match(providerSystemPrompts.at(-1), /INTEGRATION_ROLE_MARKER_V2/);
  assert.doesNotMatch(providerSystemPrompts.at(-1), /INTEGRATION_ROLE_MARKER: /);
  const promptChangeLog = (await database.query(`SELECT prompt_runtime_hash,memory_reset_reason,prompt_section_ids_json FROM chat_logs WHERE session_id='integration-general-answer' ORDER BY id DESC LIMIT 1`)).rows[0];
  assert.equal(promptChangeLog.prompt_runtime_hash, editedRole.prompt_runtime.compiled_prompt_hash);
  assert.match(promptChangeLog.memory_reset_reason, /^prompt_runtime_changed:/);
  assert.ok(JSON.parse(promptChangeLog.prompt_section_ids_json).includes(Number(runtimeRole.id)));

  providerMode = 'outage';
  const outageCallsBefore = providerRequestKinds.length;
  const failedAnswer = await submitAndCompleteChat({ message:'Integration duplicate intent', language:'en', platform_key:platform.public_route_key, session_id:'integration-provider-fallback' }, 'Retry a temporary provider outage through the durable AI queue');
  assert.equal(failedAnswer.job.status, 'FAILED');
  assert.equal(Number(failedAnswer.job.attempt_count), 3, 'Durable worker must perform the configured three job attempts');
  assert.equal(failedAnswer.response_status, 'degraded');
  assert.equal(failedAnswer.resolution_path, 'provider_failure_retry_exhausted');
  assert.match(failedAnswer.reply, /couldn[’']t complete that answer/i);
  assert.equal(failedAnswer.response_blocks.some((block) => block.type === 'error'), false);
  assert.equal(failedAnswer.response_blocks.some((block) => block.action_type === 'human_handoff'), false, 'Handoff-disabled provider failure must not recommend support');
  assert.equal(providerRequestKinds.length - outageCallsBefore, 3, 'Each durable job attempt must perform one provider request');
  assert.equal(String(failedAnswer.job.last_error_detail || '').includes('simulated provider outage'), true, 'Provider detail remains available only in the internal job record');
  providerMode = 'success';

  const blockedConnector = await call('/admin/connector', {
    method:'PUT',
    body:{ enabled:true, allowed_actions:['game_status'], game_status_url:'https://127.0.0.1/private' },
  });
  const blockedBody = expectStatus(blockedConnector, 400, 'Reject private connector target');
  assert.match(blockedBody.code, /^CONNECTOR_/);

  for (const [path, method] of [
    ['/admin/ai-qa', 'GET'],
    ['/admin/ai-source-router', 'GET'],
    ['/admin/knowledge-imports', 'GET'],
    ['/admin/ai-quality/scan', 'POST'],
    ['/admin/locale-studio', 'GET'],
  ]) {
    const retired = expectStatus(await call(path, { method, body:method === 'POST' ? {} : undefined }), 410, `Retire ${path}`);
    assert.equal(retired.code, 'AI_MODULE_RETIRED');
  }


  console.log(`PASS ${migrationFiles.length} immutable SQL migration files applied and rechecked`);
  console.log('PASS Real login, scoped CRUD, shared-host public read, hostname guard, and tenant-isolation paths');
  console.log('PASS Owner 2FA step-up, typed reset confirmation, force logout, session revocation, and security audit paths');
  console.log('PASS Multilingual Guide import creates one stable parent, preserves two locales, and keeps rich body content on re-import');
  console.log('PASS Rich HTML is sanitized in the API response and PostgreSQL row');
  console.log('PASS Private connector targets are rejected through the authenticated API');
  console.log('PASS Asynchronous HTTP 202 chat acknowledgement, durable worker completion, plain-text answers, approved images, and provider retry exhaustion paths');
  console.log('PASS Prompt runtime versions, hashes, and prompt-aware memory reset persist in PostgreSQL');
  console.log('PASS Retired AI Admin modules return HTTP 410 and cannot participate in production routing');
} finally {
  globalThis.fetch = originalFetch;
  if (database) await database.end();
  await closeBulkContentPools();
  await closeDatabasePools();
}
