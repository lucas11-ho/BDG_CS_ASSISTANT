import { sanitizeRichHtml } from './rich-html.js';

const TRANSFER_VERSION = 1;
const GRANT_TTL_MINUTES = 30;
const ROLLBACK_DAYS = 7;
const MAX_MANIFEST_BYTES = 32 * 1024 * 1024;
const MAX_MEDIA_FILES = 10_000;
const MAX_MEDIA_BYTES = 20 * 1024 * 1024 * 1024;
const MEDIA_BATCH_SIZE = 25;
const MEDIA_BATCH_BUDGET_MS = 12_000;
const MAX_MEDIA_ATTEMPTS = 5;
const HTML_COLUMNS = new Set(['answer_html','body_html','body_html_hi','rich_html','rich_html_hi','qa_answer_html']);

export const PLATFORM_TRANSFER_PERMISSIONS = Object.freeze([
  'platform.transfer.generate',
  'platform.transfer.import',
  'platform.transfer.rollback',
]);

export const PLATFORM_TRANSFER_MODULES = Object.freeze([
  'locales',
  'categories',
  'guides',
  'faqs',
  'branding',
  'assistant',
  'experience',
  'ai_knowledge',
]);

const TABLE_COLUMNS = Object.freeze({
  platform_locales: ['locale','display_name','native_name','direction','is_default','is_enabled','sort_order'],
  categories: ['name','slug','description','icon','icon_url','sort_order'],
  guides: ['title','slug','summary','body','image_urls','keywords','language','priority','status','category_id','title_hi','summary_hi','body_hi','body_html','body_blocks_json','cover_image_url','body_html_hi','body_blocks_json_hi','image_urls_hi','cover_image_url_hi','version_number'],
  guide_translations: ['guide_id','locale','title','summary','body','rich_json','rich_html','image_urls','cover_image_url','keywords','seo_title','seo_description','alt_text','status','cover_media_type','cover_video_url','cover_video_poster_url','video_autoplay','video_loop','video_muted','video_controls','motion_enabled','title_animation','summary_animation','content_animation','motion_intensity'],
  faqs: ['question','answer','answer_html','answer_json','image_urls','locale','keywords','priority','status','topic'],
  theme_settings: ['app_name','logo_text','banner_title','banner_subtitle','primary_color','favicon_url','chat_icon_url','guide_logo_url','chat_header_title','chat_online_text','show_chat_support_button','show_guide_support_button','chat_welcome_title','chat_welcome_subtitle','chat_input_placeholder','brand_name','brand_tagline','admin_logo_url','admin_favicon_url','guide_favicon_url','chat_favicon_url','accent_color','surface_color','font_family','button_style','chat_start_enabled','chat_start_title','chat_start_body','chat_start_image_url','chat_start_animation','chat_start_button_label','chat_start_announcement','chat_start_maintenance_banner','chat_start_responsible_notice','chat_layout','chat_bubble_style','chat_input_style','chat_background_url','chat_start_text_color','chat_start_accent_color','guide_background_url','guide_hero_background_url','guide_hero_overlay_color','guide_font_family','guide_surface_color','guide_text_color','guide_card_radius','guide_content_width'],
  guide_theme_settings: ['background_url','hero_background_url','hero_overlay_color','surface_color','text_color','font_family','card_radius','content_width'],
  chat_theme_settings: ['header_title','online_text','welcome_title','welcome_subtitle','input_placeholder','icon_url','background_url','layout','bubble_style','input_style','start_enabled','start_title','start_body','start_image_url','start_animation','start_button_label','start_announcement','start_maintenance_banner','start_responsible_notice','start_text_color','start_accent_color','show_language_selector','initial_message_limit'],
  ai_prompt_sections: ['section_key','title','content','enabled','priority'],
  ai_reliability_settings: ['enabled','clarification_threshold','escalation_threshold','max_retries','provider_timeout_ms','workflow_mode','fallback_mode','unknown_reply','provider_error_reply'],
  ai_source_router_settings: ['enabled','prompt_manager_enabled','source_order','enabled_sources','locale_strategy','max_candidates'],
  site_content_blocks: ['block_key','label','value','input_type','sort_order'],
  popular_help_cards: ['title','subtitle','icon','query','linked_category_slug','sort_order','status'],
  navigation_items: ['nav_key','label','icon','href','sort_order','status'],
  guide_home_sections: ['section_key','title','enabled','sort_order'],
  chat_quick_replies: ['text','query','sort_order','status','lifecycle_mode'],
  ai_content_items: ['content_name','title','intent_key','locale','status','source_type','priority','confidence_threshold','keywords','positive_examples','negative_examples','required_fields','faq_content','knowledge_content','example_answers','example_answers_hi','ai_instruction','ai_instruction_hi','rich_json','rich_html','rich_json_hi','rich_html_hi','qa_answer_html','qa_answer_json','qa_steps_json','localized_fields_json','image_urls','image_delivery','approval_status','version_label','route_policy','category','matching_aliases_json'],
  guide_media_assets: ['storage_key','public_url','original_name','content_type','size_bytes','status','media_kind'],
});

const MODULE_TABLES = Object.freeze({
  locales: ['platform_locales'],
  categories: ['categories'],
  guides: ['guides','guide_translations','guide_media_assets'],
  faqs: ['faqs'],
  branding: ['theme_settings','guide_theme_settings','chat_theme_settings'],
  assistant: ['ai_prompt_sections','ai_reliability_settings','ai_source_router_settings'],
  experience: ['site_content_blocks','popular_help_cards','navigation_items','guide_home_sections','chat_quick_replies'],
  ai_knowledge: ['ai_content_items'],
});

const SINGLETON_TABLES = new Set(['theme_settings','guide_theme_settings','chat_theme_settings','ai_reliability_settings','ai_source_router_settings']);
const REPLACE_KEY = Object.freeze({
  ai_prompt_sections: 'section_key',
  site_content_blocks: 'block_key',
  navigation_items: 'nav_key',
  guide_home_sections: 'section_key',
});
const SKIP_KEY = Object.freeze({
  platform_locales: ['locale'],
  categories: ['slug'],
  guides: ['slug'],
  guide_translations: ['guide_id','locale'],
  faqs: ['question','locale'],
  popular_help_cards: ['title'],
  chat_quick_replies: ['text'],
  ai_content_items: ['intent_key'],
});

function fail(message, status = 400, code = 'PLATFORM_TRANSFER_INVALID') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

function fromB64url(value) {
  return new Uint8Array(Buffer.from(String(value || ''), 'base64url'));
}

async function sha256(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return b64url(await crypto.subtle.digest('SHA-256', bytes));
}

async function transferKey(env, purpose) {
  if (!env.JWT_SECRET) fail('Transfer encryption is not configured', 503, 'TRANSFER_ENCRYPTION_NOT_CONFIGURED');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`bdg-platform-transfer:${purpose}:v1:${env.JWT_SECRET}`));
  return crypto.subtle.importKey('raw', digest, { name:'AES-GCM' }, false, ['encrypt','decrypt']);
}

async function encryptManifest(env, manifest) {
  const plaintext = new TextEncoder().encode(JSON.stringify(manifest));
  if (plaintext.byteLength > MAX_MANIFEST_BYTES) fail('The selected platform data exceeds the secure transfer limit', 413, 'TRANSFER_MANIFEST_TOO_LARGE');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, await transferKey(env, 'manifest'), plaintext);
  return { ciphertext:`enc$v1$${b64url(iv)}$${b64url(encrypted)}`, checksum:await sha256(plaintext), bytes:plaintext.byteLength };
}

async function decryptManifest(env, value, expectedChecksum) {
  const parts = String(value || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'enc' || parts[1] !== 'v1') fail('Transfer snapshot is invalid', 500, 'TRANSFER_MANIFEST_INVALID');
  try {
    const plaintext = await crypto.subtle.decrypt({ name:'AES-GCM', iv:fromB64url(parts[2]) }, await transferKey(env, 'manifest'), fromB64url(parts[3]));
    const bytes = new Uint8Array(plaintext);
    if ((await sha256(bytes)) !== expectedChecksum) fail('Transfer snapshot checksum failed', 500, 'TRANSFER_MANIFEST_CHECKSUM_FAILED');
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error?.code) throw error;
    fail('Transfer snapshot cannot be decrypted', 500, 'TRANSFER_MANIFEST_DECRYPT_FAILED');
  }
}

function safeModules(input) {
  const requested = Array.isArray(input) ? input.map(String) : [...PLATFORM_TRANSFER_MODULES];
  const modules = [...new Set(requested.filter((value) => PLATFORM_TRANSFER_MODULES.includes(value)))];
  if (!modules.length) fail('Select at least one transfer module', 400, 'TRANSFER_MODULE_REQUIRED');
  return modules;
}

function publicGrant(value) {
  if (!value) return null;
  return {
    id:value.public_id,
    status:value.status,
    modules:Array.isArray(value.modules_json) ? value.modules_json : [],
    counts:value.counts_json || {},
    token_hint:value.token_hint,
    source_platform_id:Number(value.source_platform_id),
    target_platform_id:value.target_platform_id == null ? null : Number(value.target_platform_id),
    expires_at:String(value.expires_at || ''),
    created_by:value.created_by,
    claimed_by:value.claimed_by || '',
    created_at:String(value.created_at || ''),
  };
}

function safeHashEqual(left, right) {
  const a = new TextEncoder().encode(String(left || ''));
  const b = new TextEncoder().encode(String(right || ''));
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function publicJob(value) {
  if (!value) return null;
  const totalFiles = Number(value.media_total_files || 0);
  const completedFiles = Number(value.media_completed_files || 0);
  const failedFiles = Number(value.media_failed_files || 0);
  const pendingFiles = Math.max(0, totalFiles - completedFiles - failedFiles);
  const totalBytes = Number(value.media_total_bytes || 0);
  const completedBytes = Number(value.media_completed_bytes || 0);
  const percent = totalFiles > 0 ? Math.max(0, Math.min(100, Math.round((completedFiles / totalFiles) * 100))) : 100;
  return {
    id:value.public_id,
    status:value.status,
    source_platform_id:Number(value.source_platform_id),
    target_platform_id:Number(value.target_platform_id),
    source_platform_name:value.source_platform_name || '',
    target_platform_name:value.target_platform_name || '',
    conflict_policy:value.conflict_policy,
    preview:value.preview_json || {},
    result:value.result_json || {},
    media_progress:{
      total_files:totalFiles,
      completed_files:completedFiles,
      failed_files:failedFiles,
      pending_files:pendingFiles,
      total_bytes:totalBytes,
      completed_bytes:completedBytes,
      percent,
      batch_size:Number(value.media_batch_size || MEDIA_BATCH_SIZE),
      last_progress_at:value.media_last_progress_at ? String(value.media_last_progress_at) : '',
    },
    data_imported_at:value.data_imported_at ? String(value.data_imported_at) : '',
    rollback_available:['completed','failed'].includes(String(value.status || ''))
      && value.rollback_expires_at
      && new Date(value.rollback_expires_at).getTime() > Date.now(),
    rollback_expires_at:value.rollback_expires_at ? String(value.rollback_expires_at) : '',
    created_by:value.created_by,
    applied_by:value.applied_by || '',
    created_at:String(value.created_at || ''),
    completed_at:value.completed_at ? String(value.completed_at) : '',
    rolled_back_at:value.rolled_back_at ? String(value.rolled_back_at) : '',
    error_code:value.error_code || '',
    error_message:value.error_message || '',
  };
}

function selectColumns(row, table) {
  const out = { _source_id:Number(row.id || 0) || null };
  for (const column of TABLE_COLUMNS[table] || []) if (Object.prototype.hasOwnProperty.call(row, column)) out[column] = row[column];
  return out;
}

async function snapshotTable(query, table, scope) {
  const rows = (await query(`SELECT * FROM ${table} WHERE tenant_id=$1 AND platform_id=$2 ORDER BY id ASC`, [scope.tenant_id,scope.platform_id])).rows;
  return rows.map((row) => selectColumns(row, table));
}

async function buildSnapshot(query, scope, modules) {
  const tables = [...new Set(modules.flatMap((module) => MODULE_TABLES[module] || []))];
  const data = {};
  for (const table of tables) data[table] = await snapshotTable(query, table, scope);
  const categoryById = new Map((data.categories || []).map((row) => [Number(row._source_id), row.slug]));
  for (const guide of data.guides || []) {
    guide.category_slug = categoryById.get(Number(guide.category_id)) || '';
    delete guide.category_id;
  }
  const guideById = new Map((data.guides || []).map((row) => [Number(row._source_id), row.slug]));
  for (const translation of data.guide_translations || []) {
    translation.guide_slug = guideById.get(Number(translation.guide_id)) || '';
    delete translation.guide_id;
  }
  for (const navigation of data.navigation_items || []) {
    if (!/^(?:\/|#|\?)/.test(String(navigation.href || ''))) navigation.href = '#review-required';
  }
  const counts = Object.fromEntries(Object.entries(data).map(([table, rows]) => [table, rows.length]));
  return {
    version:TRANSFER_VERSION,
    created_at:new Date().toISOString(),
    source:{ tenant_id:Number(scope.tenant_id), platform_id:Number(scope.platform_id), platform_name:scope.platform_name || '' },
    modules,
    counts,
    data,
    exclusions:['administrators','passwords','2fa','sessions','customers','conversations','staff','audit_logs','analytics','domains','dns','ssl','route_keys','api_keys','provider_secrets','connector_secrets','webhooks'],
  };
}

export async function createPlatformTransferGrant({ env, query, withTransaction, scope, admin, payload = {}, audit }) {
  const modules = safeModules(payload.modules);
  const secretBytes = crypto.getRandomValues(new Uint8Array(32));
  const publicId = crypto.randomUUID();
  const secret = `LTX1_${publicId}.${b64url(secretBytes)}`;
  const tokenHash = await sha256(`token:v1:${env.JWT_SECRET}:${secret}`);
  const tokenHint = secret.slice(-8);
  const grant = await withTransaction(async (tx) => {
    await tx('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    const manifest = await buildSnapshot(tx, scope, modules);
    const encrypted = await encryptManifest(env, manifest);
    const result = await tx(`INSERT INTO platform_transfer_grants(
        public_id,source_tenant_id,source_platform_id,token_hash,token_hint,manifest_version,manifest_ciphertext,manifest_checksum,modules_json,counts_json,status,expires_at,created_by
      ) VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,'created',NOW()+INTERVAL '${GRANT_TTL_MINUTES} minutes',$11)
      RETURNING *`, [publicId,scope.tenant_id,scope.platform_id,tokenHash,tokenHint,TRANSFER_VERSION,encrypted.ciphertext,encrypted.checksum,JSON.stringify(modules),JSON.stringify(manifest.counts),admin.email]);
    return result.rows[0];
  });
  await audit('create','platform_transfer_grants',publicId,`Secure transfer grant created (${modules.join(', ')})`,scope);
  return { ok:true, grant:publicGrant(grant), secret, shown_once:true, expires_in_minutes:GRANT_TTL_MINUTES };
}

export async function listPlatformTransfers({ query, scope }) {
  await query(`UPDATE platform_transfer_grants
    SET status='expired',manifest_ciphertext='',manifest_checksum='',manifest_purged_at=NOW(),updated_at=NOW()
    WHERE status='created' AND expires_at<=NOW()`);
  const grants = (await query(`SELECT * FROM platform_transfer_grants WHERE source_platform_id=$1 ORDER BY created_at DESC LIMIT 50`, [scope.platform_id])).rows.map(publicGrant);
  const jobs = (await query(`SELECT j.*,source.name AS source_platform_name,target.name AS target_platform_name
    FROM platform_transfer_jobs j
    JOIN saas_platforms source ON source.id=j.source_platform_id
    JOIN saas_platforms target ON target.id=j.target_platform_id
    WHERE j.target_platform_id=$1 OR j.source_platform_id=$1 ORDER BY j.created_at DESC LIMIT 50`, [scope.platform_id])).rows.map(publicJob);
  return { ok:true, platform:{ id:Number(scope.platform_id),name:scope.platform_name || '' }, modules:[...PLATFORM_TRANSFER_MODULES], grants, jobs, policy:{ grant_ttl_minutes:GRANT_TTL_MINUTES, rollback_days:ROLLBACK_DAYS, conflict_policy:'skip_existing', imported_content_status:'draft', max_manifest_bytes:MAX_MANIFEST_BYTES, max_media_files:MAX_MEDIA_FILES, max_media_bytes:MAX_MEDIA_BYTES, media_batch_size:MEDIA_BATCH_SIZE, media_max_attempts:MAX_MEDIA_ATTEMPTS } };
}

export async function revokePlatformTransferGrant({ query, scope, admin, grantId, audit }) {
  const result = await query(`UPDATE platform_transfer_grants
    SET status='revoked',revoked_at=NOW(),manifest_ciphertext='',manifest_checksum='',manifest_purged_at=NOW(),updated_at=NOW()
    WHERE public_id=$1::uuid AND source_platform_id=$2 AND status='created' RETURNING *`, [grantId,scope.platform_id]);
  if (!result.rows[0]) fail('Active transfer grant was not found', 404, 'TRANSFER_GRANT_NOT_FOUND');
  await audit('revoke','platform_transfer_grants',grantId,'Secure transfer grant revoked',scope);
  return { ok:true, grant:publicGrant(result.rows[0]) };
}

async function registerBadToken(query, publicId) {
  await query(`UPDATE platform_transfer_grants SET failed_attempts=failed_attempts+1,
    locked_until=CASE WHEN failed_attempts+1>=5 THEN NOW()+INTERVAL '15 minutes' ELSE locked_until END,updated_at=NOW()
    WHERE public_id=$1::uuid`, [publicId]).catch(() => undefined);
}

async function conflictPreview(query, manifest, targetScope) {
  const modules = {};
  let create = 0;
  let skip = 0;
  let replace = 0;
  for (const module of manifest.modules) {
    const detail = { create:0, skip:0, replace:0, total:0 };
    for (const table of MODULE_TABLES[module] || []) {
      const rows = manifest.data[table] || [];
      detail.total += rows.length;
      if (SINGLETON_TABLES.has(table) || REPLACE_KEY[table]) {
        for (const row of rows) {
          const existing = await findExisting(query,table,row,targetScope);
          if (existing) detail.replace += 1; else detail.create += 1;
        }
        continue;
      }
      const keys = SKIP_KEY[table];
      if (!keys) { detail.create += rows.length; continue; }
      for (const row of rows) {
        if (table === 'guide_translations') {
          const guide = (await query(`SELECT id FROM guides WHERE tenant_id=$1 AND platform_id=$2 AND slug=$3 AND deleted_at IS NULL LIMIT 1`, [targetScope.tenant_id,targetScope.platform_id,row.guide_slug])).rows[0];
          const existing = guide ? await findExisting(query,table,row,targetScope,guide.id) : null;
          if (existing) detail.skip += 1; else detail.create += 1;
          continue;
        }
        const clauses = keys.map((key, index) => `COALESCE(${key}::text,'')=COALESCE($${index + 3}::text,'')`).join(' AND ');
        const values = keys.map((key) => row[key]);
        const found = (await query(`SELECT id FROM ${table} WHERE tenant_id=$1 AND platform_id=$2 AND ${clauses} AND ${table === 'faqs' || table === 'categories' || table === 'guides' || table === 'ai_content_items' ? 'deleted_at IS NULL' : 'TRUE'} LIMIT 1`, [targetScope.tenant_id,targetScope.platform_id,...values])).rows[0];
        if (found) detail.skip += 1; else detail.create += 1;
      }
    }
    modules[module] = detail;
    create += detail.create;
    skip += detail.skip;
    replace += detail.replace;
  }
  return { modules, totals:{ create,skip,replace,total:create+skip+replace }, warnings:['Existing natural keys will be skipped.','Branding and Assistant singleton settings will be replaced.','Guides, FAQs, and AI knowledge are imported as drafts.','External action/support URLs and every credential are excluded.'] };
}

export async function claimPlatformTransfer({ env, query, withTransaction, scope, admin, secret, audit }) {
  const match = /^LTX1_([0-9a-f-]{36})\.([A-Za-z0-9_-]{40,})$/.exec(String(secret || '').trim());
  if (!match) fail('Transfer key format is invalid', 400, 'TRANSFER_KEY_INVALID');
  const publicId = match[1];
  const tokenHash = await sha256(`token:v1:${env.JWT_SECRET}:${String(secret).trim()}`);
  const candidate = (await query(`SELECT status,token_hash,locked_until,expires_at FROM platform_transfer_grants WHERE public_id=$1::uuid LIMIT 1`, [publicId])).rows[0];
  if (!candidate) fail('Transfer key was not found', 404, 'TRANSFER_KEY_NOT_FOUND');
  if (!safeHashEqual(candidate.token_hash,tokenHash)) {
    await registerBadToken(query,publicId);
    fail('Transfer key is invalid', 403, 'TRANSFER_KEY_INVALID');
  }
  const outcome = await withTransaction(async (tx) => {
    const grant = (await tx(`SELECT * FROM platform_transfer_grants WHERE public_id=$1::uuid FOR UPDATE`, [publicId])).rows[0];
    if (!grant) fail('Transfer key was not found', 404, 'TRANSFER_KEY_NOT_FOUND');
    if (grant.locked_until && new Date(grant.locked_until).getTime() > Date.now()) fail('Transfer key is temporarily locked', 429, 'TRANSFER_KEY_LOCKED');
    if (grant.status !== 'created') fail('Transfer key has already been used or revoked', 409, 'TRANSFER_KEY_ALREADY_USED');
    if (new Date(grant.expires_at).getTime() <= Date.now()) {
      await tx(`UPDATE platform_transfer_grants
        SET status='expired',manifest_ciphertext='',manifest_checksum='',manifest_purged_at=NOW(),updated_at=NOW()
        WHERE id=$1`, [grant.id]);
      return { expired:true };
    }
    if (!safeHashEqual(grant.token_hash,tokenHash)) fail('Transfer key is invalid', 403, 'TRANSFER_KEY_INVALID');
    if (Number(grant.source_platform_id) === Number(scope.platform_id)) fail('Choose a different destination platform', 409, 'TRANSFER_SAME_PLATFORM');
    const manifest = await decryptManifest(env, grant.manifest_ciphertext, grant.manifest_checksum);
    const preview = await conflictPreview(tx, manifest, scope);
    const jobId = crypto.randomUUID();
    const job = (await tx(`INSERT INTO platform_transfer_jobs(public_id,grant_id,source_tenant_id,source_platform_id,target_tenant_id,target_platform_id,status,conflict_policy,preview_json,created_by)
      VALUES($1::uuid,$2,$3,$4,$5,$6,'preview','skip_existing',$7::jsonb,$8) RETURNING *`, [jobId,grant.id,grant.source_tenant_id,grant.source_platform_id,scope.tenant_id,scope.platform_id,JSON.stringify(preview),admin.email])).rows[0];
    await tx(`UPDATE platform_transfer_grants SET status='claimed',target_tenant_id=$1,target_platform_id=$2,claimed_by=$3,claimed_at=NOW(),updated_at=NOW() WHERE id=$4`, [scope.tenant_id,scope.platform_id,admin.email,grant.id]);
    return { job, source:manifest.source, modules:manifest.modules };
  });
  if (outcome.expired) fail('Transfer key has expired', 410, 'TRANSFER_KEY_EXPIRED');
  await audit('claim','platform_transfer_jobs',outcome.job.public_id,`One-time transfer key claimed from platform ${outcome.job.source_platform_id}`,scope);
  return { ok:true, job:publicJob(outcome.job), source:outcome.source, modules:outcome.modules, key_consumed:true };
}

function dbValues(row, table, overrides = {}) {
  const value = { ...row, ...overrides };
  delete value._source_id;
  delete value.category_slug;
  delete value.guide_slug;
  return Object.fromEntries((TABLE_COLUMNS[table] || [])
    .filter((column) => Object.prototype.hasOwnProperty.call(value, column))
    .map((column) => [column,HTML_COLUMNS.has(column) && typeof value[column] === 'string' ? sanitizeRichHtml(value[column]) : value[column]]));
}

async function insertRow(query, table, row, scope, overrides = {}) {
  const values = dbValues(row, table, overrides);
  const columns = ['tenant_id','platform_id',...Object.keys(values)];
  const params = [scope.tenant_id,scope.platform_id,...Object.values(values)];
  const placeholders = params.map((_, index) => `$${index + 1}`).join(',');
  return (await query(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${placeholders}) RETURNING *`, params)).rows[0];
}

async function updateRow(query, table, id, row) {
  const values = dbValues(row, table);
  const columns = Object.keys(values);
  if (!columns.length) return null;
  const params = Object.values(values);
  return (await query(`UPDATE ${table} SET ${columns.map((column,index) => `${column}=$${index + 1}`).join(',')},updated_at=NOW() WHERE id=$${params.length + 1} RETURNING *`, [...params,id])).rows[0];
}

async function findExisting(query, table, row, scope, guideId = null) {
  if (SINGLETON_TABLES.has(table)) return (await query(`SELECT * FROM ${table} WHERE tenant_id=$1 AND platform_id=$2 LIMIT 1`, [scope.tenant_id,scope.platform_id])).rows[0];
  const key = REPLACE_KEY[table] ? [REPLACE_KEY[table]] : SKIP_KEY[table];
  if (!key) return null;
  const normalized = table === 'guide_translations' ? { ...row, guide_id:guideId } : row;
  const clauses = key.map((column,index) => `COALESCE(${column}::text,'')=COALESCE($${index + 3}::text,'')`).join(' AND ');
  return (await query(`SELECT * FROM ${table} WHERE tenant_id=$1 AND platform_id=$2 AND ${clauses} AND ${['categories','guides','faqs','ai_content_items'].includes(table) ? 'deleted_at IS NULL' : 'TRUE'} LIMIT 1`, [scope.tenant_id,scope.platform_id,...key.map((column) => normalized[column])])).rows[0];
}

function collectOwnedMediaKeys(value, source) {
  const keys = new Set();
  const prefix = `tenant-${source.tenant_id}/platform-${source.platform_id}/`;
  const visit = (item) => {
    if (typeof item === 'string') {
      const regex = /\/uploads\/([^\s"'<>),\\]+)/g;
      for (const match of item.matchAll(regex)) {
        try { const key = decodeURIComponent(match[1]); if (key.startsWith(prefix)) keys.add(key); } catch (_) {}
      }
    } else if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === 'object') Object.values(item).forEach(visit);
  };
  visit(value);
  return [...keys];
}

async function bodyBytes(body) {
  if (body instanceof Uint8Array) return body;
  if (Buffer.isBuffer(body)) return new Uint8Array(body);
  if (body?.getReader) {
    const reader = body.getReader();
    const chunks = [];
    let length = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); length += value.byteLength; }
    const out = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; } return out;
  }
  if (body?.[Symbol.asyncIterator]) {
    const chunks = [];
    let length = 0;
    for await (const chunk of body) {
      const bytes = new Uint8Array(chunk);
      chunks.push(bytes);
      length += bytes.byteLength;
    }
    const out = new Uint8Array(length);
    let offset = 0;
    for (const bytes of chunks) { out.set(bytes,offset); offset += bytes.byteLength; }
    return out;
  }
  return new Uint8Array(await new Response(body).arrayBuffer());
}

async function prepareMediaQueue(query, manifest, targetScope, jobDbId, jobPublicId) {
  const keys = collectOwnedMediaKeys(manifest, manifest.source);
  if (keys.length > MAX_MEDIA_FILES) {
    fail(`Transfer contains ${keys.length} media files; the large-library limit is ${MAX_MEDIA_FILES}`, 413, 'TRANSFER_MEDIA_LIMIT');
  }
  const replacements = new Map();
  for (const sourceKey of keys) {
    const rawTail = sourceKey.split('/').pop() || 'media';
    const tail = rawTail.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-180) || 'media';
    const proposedTarget = `tenant-${targetScope.tenant_id}/platform-${targetScope.platform_id}/transfer-${jobPublicId}/${crypto.randomUUID()}-${tail}`;
    const item = (await query(`INSERT INTO platform_transfer_media_items(job_id,source_key,target_key,status)
      VALUES($1,$2,$3,'pending')
      ON CONFLICT(job_id,source_key) DO UPDATE SET source_key=EXCLUDED.source_key
      RETURNING target_key`, [jobDbId,sourceKey,proposedTarget])).rows[0];
    replacements.set(sourceKey,String(item?.target_key || proposedTarget));
  }
  return { replacements,total_files:keys.length };
}

async function verifyCopiedMedia(env, targetKey, expectedBytes) {
  let object = null;
  if (env.GUIDE_IMAGES?.head) object = await env.GUIDE_IMAGES.head(targetKey);
  else if (env.GUIDE_IMAGES?.get) object = await env.GUIDE_IMAGES.get(targetKey,{ rangeHeader:'bytes=0-0' });
  if (!object) throw new Error('Copied media could not be verified in destination storage');
  let actual = Number(object.contentLength);
  if ((!Number.isFinite(actual) || actual < 0) && object.contentRange) {
    const match = /\/(\d+)$/.exec(String(object.contentRange));
    if (match) actual = Number(match[1]);
  }
  try { await object.body?.cancel?.(); } catch {}
  if (Number.isFinite(expectedBytes) && expectedBytes >= 0 && Number.isFinite(actual) && actual !== expectedBytes) {
    throw new Error(`Copied media size verification failed (expected ${expectedBytes}, got ${actual})`);
  }
  return Number.isFinite(actual) ? actual : expectedBytes;
}

async function resetStaleMediaClaims(query, jobDbId) {
  await query(`UPDATE platform_transfer_media_items
    SET status='failed',last_error='Previous media-copy request was interrupted; queued for retry',updated_at=NOW()
    WHERE job_id=$1 AND status='copying' AND updated_at < NOW()-INTERVAL '5 minutes'`, [jobDbId]);
}

async function claimNextMediaItem(withTransaction, jobDbId) {
  return withTransaction(async (tx) => {
    const row = (await tx(`WITH picked AS (
        SELECT id FROM platform_transfer_media_items
        WHERE job_id=$1
          AND (status='pending' OR (status='failed' AND attempts < $2))
        ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END,id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE platform_transfer_media_items item
      SET status='copying',attempts=item.attempts+1,last_error=NULL,updated_at=NOW()
      FROM picked
      WHERE item.id=picked.id
      RETURNING item.*`, [jobDbId,MAX_MEDIA_ATTEMPTS])).rows[0];
    return row || null;
  });
}

async function mediaProgress(query, jobDbId) {
  const stats = (await query(`SELECT
      COUNT(*)::int AS total_files,
      COUNT(*) FILTER (WHERE status='completed')::int AS completed_files,
      COUNT(*) FILTER (WHERE status='failed')::int AS failed_files,
      COUNT(*) FILTER (WHERE status='pending' OR (status='failed' AND attempts < $2))::int AS retryable_files,
      COUNT(*) FILTER (WHERE status='copying')::int AS copying_files,
      COALESCE(SUM(size_bytes),0)::bigint AS total_bytes,
      COALESCE(SUM(size_bytes) FILTER (WHERE status='completed'),0)::bigint AS completed_bytes
    FROM platform_transfer_media_items WHERE job_id=$1`, [jobDbId,MAX_MEDIA_ATTEMPTS])).rows[0] || {};
  return {
    total_files:Number(stats.total_files || 0),
    completed_files:Number(stats.completed_files || 0),
    failed_files:Number(stats.failed_files || 0),
    retryable_files:Number(stats.retryable_files || 0),
    copying_files:Number(stats.copying_files || 0),
    total_bytes:Number(stats.total_bytes || 0),
    completed_bytes:Number(stats.completed_bytes || 0),
  };
}

async function syncMediaJob(query, jobDbId) {
  const stats = await mediaProgress(query,jobDbId);
  const current = (await query(`SELECT * FROM platform_transfer_jobs WHERE id=$1 LIMIT 1`, [jobDbId])).rows[0];
  if (!current) fail('Transfer job was not found',404,'TRANSFER_JOB_NOT_FOUND');

  let nextStatus = String(current.status || 'running');
  let errorCode = current.error_code || null;
  let errorMessage = current.error_message || null;
  const allDone = stats.total_files === stats.completed_files;
  const exhausted = !allDone && stats.retryable_files === 0 && stats.copying_files === 0 && stats.failed_files > 0;

  if (allDone) {
    nextStatus = 'completed';
    errorCode = null;
    errorMessage = null;
  } else if (exhausted) {
    nextStatus = 'failed';
    errorCode = 'TRANSFER_MEDIA_INCOMPLETE';
    errorMessage = `${stats.failed_files} media file(s) could not be copied after ${MAX_MEDIA_ATTEMPTS} attempts`;
  } else {
    nextStatus = 'running';
    errorCode = null;
    errorMessage = null;
  }

  const result = {
    ...(current.result_json || {}),
    media_files:stats.total_files,
    media_bytes:stats.completed_bytes,
    media:{
      total_files:stats.total_files,
      completed_files:stats.completed_files,
      failed_files:stats.failed_files,
      total_bytes:stats.total_bytes,
      completed_bytes:stats.completed_bytes,
    },
  };

  const updated = (await query(`UPDATE platform_transfer_jobs SET
      status=$1,
      result_json=$2::jsonb,
      media_total_files=$3,
      media_completed_files=$4,
      media_failed_files=$5,
      media_total_bytes=$6,
      media_completed_bytes=$7,
      media_last_progress_at=NOW(),
      completed_at=CASE WHEN $1='completed' THEN COALESCE(completed_at,NOW()) ELSE completed_at END,
      error_code=$8,
      error_message=$9,
      updated_at=NOW()
    WHERE id=$10 RETURNING *`, [
      nextStatus,JSON.stringify(result),stats.total_files,stats.completed_files,stats.failed_files,
      stats.total_bytes,stats.completed_bytes,errorCode,errorMessage,jobDbId,
    ])).rows[0];

  if (nextStatus === 'completed' || nextStatus === 'failed') {
    await query(`UPDATE platform_transfer_grants SET
      status='completed',completed_at=COALESCE(completed_at,NOW()),
      manifest_ciphertext='',manifest_checksum='',manifest_purged_at=COALESCE(manifest_purged_at,NOW()),updated_at=NOW()
      WHERE id=$1 AND status='claimed'`, [current.grant_id]);
  }
  return updated;
}

async function copyQueuedMediaItem(env, query, job, item) {
  try {
    const source = await env.GUIDE_IMAGES.get(item.source_key);
    if (!source) throw new Error(`Source media is missing: ${String(item.source_key).split('/').pop()}`);

    let size = Number(source.contentLength);
    let payload = source.body;
    if (!Number.isFinite(size) || size < 0) {
      const bytes = await bodyBytes(source.body);
      payload = bytes;
      size = bytes.byteLength;
    }

    const projected = Number(job.media_completed_bytes || 0) + size;
    if (projected > MAX_MEDIA_BYTES) {
      await query(`UPDATE platform_transfer_media_items SET status='failed',attempts=$1,size_bytes=$2,
        last_error=$3,updated_at=NOW() WHERE id=$4`, [
        MAX_MEDIA_ATTEMPTS,size,`Transfer media exceeds the ${Math.round(MAX_MEDIA_BYTES/(1024*1024*1024))} GB large-library limit`,item.id,
      ]);
      return false;
    }

    await env.GUIDE_IMAGES.put(item.target_key,payload,{
      httpMetadata:{ contentType:source.httpMetadata?.contentType || 'application/octet-stream' },
      contentLength:size,
    });
    const verifiedBytes = await verifyCopiedMedia(env,item.target_key,size);
    await query(`UPDATE platform_transfer_media_items SET
      status='completed',content_type=$1,size_bytes=$2,last_error=NULL,verified_at=NOW(),updated_at=NOW()
      WHERE id=$3`, [source.httpMetadata?.contentType || 'application/octet-stream',Number(verifiedBytes || size || 0),item.id]);
    job.media_completed_bytes = Number(job.media_completed_bytes || 0) + Number(verifiedBytes || size || 0);
    return true;
  } catch (error) {
    await query(`UPDATE platform_transfer_media_items SET status='failed',last_error=$1,updated_at=NOW() WHERE id=$2`, [
      String(error?.message || 'Media copy failed').slice(0,1000),item.id,
    ]).catch(() => undefined);
    return false;
  }
}

function rewriteMedia(value, replacements) {
  if (typeof value === 'string') {
    let next = value;
    for (const [source,target] of replacements) next = next.split(encodeURI(source)).join(encodeURI(target)).split(source).join(target);
    return next;
  }
  if (Array.isArray(value)) return value.map((item) => rewriteMedia(item,replacements));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item]) => [key,rewriteMedia(item,replacements)]));
  return value;
}

async function importManifest(query, manifest, scope) {
  const rollback = { inserted:{}, replaced:{}, copied_media:[] };
  const result = { created:0, skipped:0, replaced:0, by_table:{} };
  const guideIds = new Map();
  const tableResult = (table) => result.by_table[table] ||= { created:0,skipped:0,replaced:0 };
  const rememberInsert = (table,id) => { (rollback.inserted[table] ||= []).push(Number(id)); result.created += 1; tableResult(table).created += 1; };
  const rememberReplace = (table,row) => { (rollback.replaced[table] ||= []).push(selectColumns(row,table)); result.replaced += 1; tableResult(table).replaced += 1; };
  const rememberSkip = (table) => { result.skipped += 1; tableResult(table).skipped += 1; };

  for (const table of ['platform_locales','categories']) for (const row of manifest.data[table] || []) {
    const existing = await findExisting(query,table,row,scope);
    if (existing) { rememberSkip(table); continue; }
    const created = await insertRow(query,table,row,scope,table === 'platform_locales' ? { is_default:false } : {});
    rememberInsert(table,created.id);
  }
  for (const row of manifest.data.guides || []) {
    const existing = await findExisting(query,'guides',row,scope);
    if (existing) { guideIds.set(row.slug,Number(existing.id)); rememberSkip('guides'); continue; }
    let categoryId = null;
    if (row.category_slug) categoryId = Number((await query(`SELECT id FROM categories WHERE platform_id=$1 AND slug=$2 AND deleted_at IS NULL LIMIT 1`, [scope.platform_id,row.category_slug])).rows[0]?.id || 0) || null;
    const created = await insertRow(query,'guides',row,scope,{ category_id:categoryId,status:'draft' });
    guideIds.set(row.slug,Number(created.id)); rememberInsert('guides',created.id);
  }
  for (const row of manifest.data.guide_translations || []) {
    const guideId = guideIds.get(row.guide_slug);
    if (!guideId) { rememberSkip('guide_translations'); continue; }
    const existing = await findExisting(query,'guide_translations',row,scope,guideId);
    if (existing) { rememberSkip('guide_translations'); continue; }
    const created = await insertRow(query,'guide_translations',row,scope,{ guide_id:guideId,status:'draft' });
    rememberInsert('guide_translations',created.id);
  }
  for (const table of ['faqs','popular_help_cards','chat_quick_replies','ai_content_items']) for (const row of manifest.data[table] || []) {
    const existing = await findExisting(query,table,row,scope);
    if (existing) { rememberSkip(table); continue; }
    const draft = table === 'faqs' ? { status:'draft' } : table === 'ai_content_items' ? { status:'draft',approval_status:'draft' } : {};
    const created = await insertRow(query,table,row,scope,draft); rememberInsert(table,created.id);
  }
  for (const row of manifest.data.guide_media_assets || []) {
    const created = await insertRow(query,'guide_media_assets',row,scope);
    rememberInsert('guide_media_assets',created.id);
  }
  for (const table of ['theme_settings','guide_theme_settings','chat_theme_settings','ai_reliability_settings','ai_source_router_settings','ai_prompt_sections','site_content_blocks','navigation_items','guide_home_sections']) for (const row of manifest.data[table] || []) {
    const existing = await findExisting(query,table,row,scope);
    if (existing) { rememberReplace(table,existing); await updateRow(query,table,existing.id,row); }
    else { const created = await insertRow(query,table,row,scope); rememberInsert(table,created.id); }
  }
  return { result,rollback };
}

async function processPlatformTransferMediaBatch({ env, query, withTransaction, scope, admin, jobId, audit }) {
  const job = (await query(`SELECT j.*,source.name AS source_platform_name,target.name AS target_platform_name
    FROM platform_transfer_jobs j
    JOIN saas_platforms source ON source.id=j.source_platform_id
    JOIN saas_platforms target ON target.id=j.target_platform_id
    WHERE j.public_id=$1::uuid AND j.target_platform_id=$2 LIMIT 1`, [jobId,scope.platform_id])).rows[0];
  if (!job) fail('Transfer job was not found',404,'TRANSFER_JOB_NOT_FOUND');
  if (job.status === 'completed' || job.status === 'rolled_back') return { ok:true,job:publicJob(job) };
  if (job.status !== 'running') fail('Media copy is not ready to continue',409,'TRANSFER_MEDIA_NOT_READY');
  if (Number(job.media_total_files || 0) > 0 && !env.GUIDE_IMAGES) {
    await query(`UPDATE platform_transfer_jobs SET status='failed',error_code='TRANSFER_MEDIA_STORAGE_NOT_CONFIGURED',
      error_message='Platform media storage is not configured',updated_at=NOW() WHERE id=$1`, [job.id]);
    fail('Platform media storage is not configured',503,'TRANSFER_MEDIA_STORAGE_NOT_CONFIGURED');
  }

  await resetStaleMediaClaims(query,job.id);
  const started = Date.now();
  let processed = 0;
  while (processed < MEDIA_BATCH_SIZE && (processed === 0 || Date.now() - started < MEDIA_BATCH_BUDGET_MS)) {
    const item = await claimNextMediaItem(withTransaction,job.id);
    if (!item) break;
    await copyQueuedMediaItem(env,query,job,item);
    processed += 1;
  }

  const synced = await syncMediaJob(query,job.id);
  const output = { ...synced,source_platform_name:job.source_platform_name,target_platform_name:job.target_platform_name };
  if (synced.status === 'completed') {
    await audit('apply','platform_transfer_jobs',jobId,`Platform transfer completed with ${synced.media_completed_files || 0} verified media file(s)`,scope);
  } else if (synced.status === 'failed') {
    await audit('update','platform_transfer_jobs',jobId,`Platform transfer media requires attention: ${synced.media_failed_files || 0} failed file(s)`,scope);
  }
  return { ok:true,job:publicJob(output),batch:{ processed } };
}

export async function applyPlatformTransfer({ env, query, withTransaction, scope, admin, jobId, confirmation, audit }) {
  if (String(confirmation || '').trim() !== String(scope.platform_name || '').trim()) fail('Type the destination platform name to confirm',400,'TRANSFER_DESTINATION_CONFIRMATION_REQUIRED');
  const claimed = (await query(`SELECT j.*,g.manifest_ciphertext,g.manifest_checksum,g.status AS grant_status
    FROM platform_transfer_jobs j
    JOIN platform_transfer_grants g ON g.id=j.grant_id
    WHERE j.public_id=$1::uuid AND j.target_platform_id=$2 LIMIT 1`, [jobId,scope.platform_id])).rows[0];
  if (!claimed) fail('Transfer preview was not found',404,'TRANSFER_JOB_NOT_FOUND');
  if (claimed.status !== 'preview' || claimed.grant_status !== 'claimed') fail('Transfer has already been applied or is unavailable',409,'TRANSFER_JOB_NOT_READY');

  const manifest = await decryptManifest(env,claimed.manifest_ciphertext,claimed.manifest_checksum);
  const sourceMediaKeys = collectOwnedMediaKeys(manifest,manifest.source);
  if (sourceMediaKeys.length > MAX_MEDIA_FILES) {
    fail(`Transfer contains ${sourceMediaKeys.length} media files; the large-library limit is ${MAX_MEDIA_FILES}`,413,'TRANSFER_MEDIA_LIMIT');
  }
  if (sourceMediaKeys.length > 0 && !env.GUIDE_IMAGES) fail('Platform media storage is not configured',503,'TRANSFER_MEDIA_STORAGE_NOT_CONFIGURED');

  try {
    const importedJob = await withTransaction(async (tx) => {
      const locked = (await tx(`SELECT status FROM platform_transfer_jobs WHERE id=$1 FOR UPDATE`, [claimed.id])).rows[0];
      if (locked?.status !== 'preview') fail('Transfer is no longer ready',409,'TRANSFER_JOB_NOT_READY');

      await tx(`UPDATE platform_transfer_jobs SET status='running',started_at=COALESCE(started_at,NOW()),
        applied_by=$1,error_code=NULL,error_message=NULL,updated_at=NOW() WHERE id=$2`, [admin.email,claimed.id]);

      const media = await prepareMediaQueue(tx,manifest,scope,claimed.id,jobId);
      const rewritten = rewriteMedia(manifest,media.replacements);
      const imported = await importManifest(tx,rewritten,scope);
      imported.result.data_imported = true;
      imported.result.media_files = media.total_files;
      imported.result.media_bytes = 0;
      imported.result.media = {
        total_files:media.total_files,
        completed_files:0,
        failed_files:0,
        completed_bytes:0,
      };

      const nextStatus = media.total_files ? 'running' : 'completed';
      const row = (await tx(`UPDATE platform_transfer_jobs SET
        status=$1,
        result_json=$2::jsonb,
        rollback_json=$3::jsonb,
        rollback_expires_at=NOW()+INTERVAL '${ROLLBACK_DAYS} days',
        data_imported_at=NOW(),
        media_total_files=$4,
        media_completed_files=0,
        media_failed_files=0,
        media_total_bytes=0,
        media_completed_bytes=0,
        media_batch_size=$5,
        media_last_progress_at=NOW(),
        completed_at=CASE WHEN $1='completed' THEN NOW() ELSE NULL END,
        updated_at=NOW()
        WHERE id=$6 RETURNING *`, [
          nextStatus,JSON.stringify(imported.result),JSON.stringify(imported.rollback),
          media.total_files,MEDIA_BATCH_SIZE,claimed.id,
        ])).rows[0];

      await tx(`UPDATE platform_transfer_grants SET
        manifest_ciphertext='',manifest_checksum='',manifest_purged_at=NOW(),
        status=CASE WHEN $1='completed' THEN 'completed' ELSE status END,
        completed_at=CASE WHEN $1='completed' THEN NOW() ELSE completed_at END,
        updated_at=NOW()
        WHERE id=$2`, [nextStatus,claimed.grant_id]);
      return row;
    });

    await audit('apply','platform_transfer_jobs',jobId,`Platform data imported: ${importedJob.result_json?.created || 0} created, ${importedJob.result_json?.skipped || 0} skipped; media queued: ${importedJob.media_total_files || 0}`,scope);

    if (importedJob.status === 'completed') {
      return { ok:true,job:publicJob(importedJob) };
    }
    return processPlatformTransferMediaBatch({ env,query,withTransaction,scope,admin,jobId,audit });
  } catch (error) {
    const current = (await query(`SELECT status,data_imported_at FROM platform_transfer_jobs WHERE id=$1 LIMIT 1`, [claimed.id]).catch(() => ({ rows:[] }))).rows?.[0];
    if (!current?.data_imported_at) {
      await query(`UPDATE platform_transfer_jobs SET status='failed',error_code=$1,error_message=$2,updated_at=NOW()
        WHERE id=$3 AND status IN ('preview','running')`, [
        String(error?.code || 'TRANSFER_APPLY_FAILED'),String(error?.message || 'Transfer failed').slice(0,1000),claimed.id,
      ]).catch(() => undefined);
      await query(`UPDATE platform_transfer_grants SET status='revoked',revoked_at=NOW(),
        manifest_ciphertext='',manifest_checksum='',manifest_purged_at=NOW(),updated_at=NOW()
        WHERE id=$1 AND status='claimed'`, [claimed.grant_id]).catch(() => undefined);
    }
    throw error;
  }
}

export async function continuePlatformTransferMedia(deps) {
  return processPlatformTransferMediaBatch(deps);
}

export async function retryPlatformTransferMedia({ env, query, withTransaction, scope, admin, jobId, audit }) {
  const job = (await query(`SELECT * FROM platform_transfer_jobs
    WHERE public_id=$1::uuid AND target_platform_id=$2 LIMIT 1`, [jobId,scope.platform_id])).rows[0];
  if (!job) fail('Transfer job was not found',404,'TRANSFER_JOB_NOT_FOUND');
  if (!job.data_imported_at) fail('Transfer data has not been imported yet',409,'TRANSFER_MEDIA_NOT_READY');
  if (!['failed','running'].includes(String(job.status))) fail('This transfer does not have failed media to retry',409,'TRANSFER_MEDIA_NOT_RETRYABLE');

  await query(`UPDATE platform_transfer_media_items SET status='pending',attempts=0,last_error=NULL,updated_at=NOW()
    WHERE job_id=$1 AND status='failed'`, [job.id]);
  await query(`UPDATE platform_transfer_jobs SET status='running',error_code=NULL,error_message=NULL,updated_at=NOW()
    WHERE id=$1`, [job.id]);
  await audit('update','platform_transfer_jobs',jobId,'Retrying failed platform-transfer media files',scope);
  return processPlatformTransferMediaBatch({ env,query,withTransaction,scope,admin,jobId,audit });
}


const ROLLBACK_ORDER = ['guide_translations','guide_media_assets','guides','faqs','ai_content_items','categories','platform_locales','popular_help_cards','chat_quick_replies','ai_prompt_sections','site_content_blocks','navigation_items','guide_home_sections','theme_settings','guide_theme_settings','chat_theme_settings','ai_reliability_settings','ai_source_router_settings'];

export async function rollbackPlatformTransfer({ env, query, withTransaction, scope, admin, jobId, confirmation, audit }) {
  if (String(confirmation || '').trim() !== 'ROLLBACK') fail('Type ROLLBACK to confirm', 400, 'TRANSFER_ROLLBACK_CONFIRMATION_REQUIRED');
  const job = (await query(`SELECT * FROM platform_transfer_jobs WHERE public_id=$1::uuid AND target_platform_id=$2 LIMIT 1`, [jobId,scope.platform_id])).rows[0];
  if (!job) fail('Transfer job was not found', 404, 'TRANSFER_JOB_NOT_FOUND');
  if (job.status !== 'completed') fail('Only a completed transfer can be rolled back', 409, 'TRANSFER_ROLLBACK_UNAVAILABLE');
  if (!job.rollback_expires_at || new Date(job.rollback_expires_at).getTime() <= Date.now()) fail('The seven-day rollback window has expired', 410, 'TRANSFER_ROLLBACK_EXPIRED');
  const rollback = job.rollback_json || {};
  const finished = await withTransaction(async (tx) => {
    const locked = (await tx(`SELECT status FROM platform_transfer_jobs WHERE id=$1 FOR UPDATE`, [job.id])).rows[0];
    if (locked?.status !== 'completed') fail('Transfer was already rolled back', 409, 'TRANSFER_ROLLBACK_UNAVAILABLE');
    for (const table of ROLLBACK_ORDER) {
      const ids = rollback.inserted?.[table] || [];
      if (ids.length) await tx(`DELETE FROM ${table} WHERE tenant_id=$1 AND platform_id=$2 AND id=ANY($3::bigint[])`, [scope.tenant_id,scope.platform_id,ids]);
      for (const previous of rollback.replaced?.[table] || []) if (previous._source_id) await updateRow(tx,table,previous._source_id,previous);
    }
    return (await tx(`UPDATE platform_transfer_jobs SET status='rolled_back',rolled_back_by=$1,rolled_back_at=NOW(),updated_at=NOW() WHERE id=$2 RETURNING *`, [admin.email,job.id])).rows[0];
  });
  if (env.GUIDE_IMAGES?.delete) await Promise.allSettled((rollback.copied_media || []).map((key) => env.GUIDE_IMAGES.delete(key)));
  await audit('rollback','platform_transfer_jobs',jobId,'Platform transfer rolled back within the seven-day recovery window',scope);
  return { ok:true, job:publicJob(finished) };
}

export async function getPlatformTransferJob({ query, scope, jobId }) {
  const row = (await query(`SELECT j.*,source.name AS source_platform_name,target.name AS target_platform_name
    FROM platform_transfer_jobs j
    JOIN saas_platforms source ON source.id=j.source_platform_id
    JOIN saas_platforms target ON target.id=j.target_platform_id
    WHERE j.public_id=$1::uuid AND (j.target_platform_id=$2 OR j.source_platform_id=$2) LIMIT 1`, [jobId,scope.platform_id])).rows[0];
  if (!row) fail('Transfer job was not found', 404, 'TRANSFER_JOB_NOT_FOUND');
  return { ok:true, job:publicJob(row) };
}
