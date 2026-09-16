import assert from 'node:assert/strict';
import fs from 'node:fs';

// Final release verification contract for the v1.23.0 topics and security control center.
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../migrations/055_v1.23.0_topics_security_control.sql');
const core = read('../src/core.js');
const server = read('../src/server.js');
const topics = read('../src/multi-topics.js');
const adminApi = read('../../admin-pro/src/lib/api.ts');
const layout = read('../../admin-pro/src/components/AdminLayout.tsx');
const account = read('../../admin-pro/src/components/AccountSecurityDrawer.tsx');
const guide = read('../../admin-pro/src/routes/_admin.guide-images.tsx');
const faq = read('../../admin-pro/src/routes/_admin.faq.tsx');
const security = read('../../admin-pro/src/routes/_admin.security-permissions.tsx');

assert.match(migration, /CREATE TABLE IF NOT EXISTS guide_topics/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS faq_topics/);
assert.match(migration, /permissions_json TEXT/);
assert.match(migration, /require_2fa BOOLEAN NOT NULL DEFAULT FALSE/);
assert.match(migration, /uq_guide_topics_primary/);
assert.match(migration, /uq_faq_topics_primary/);
assert.match(migration, /INSERT INTO guide_topics/);
assert.match(migration, /INSERT INTO faq_topics/);

assert.match(topics, /syncTopicsFromResponse/);
assert.match(topics, /enrichTopicsResponse/);
assert.match(topics, /TOPIC_SCOPE_INVALID/);
assert.match(topics, /topic_ids/);
assert.match(topics, /topic_slugs/);
assert.match(topics, /primary_topic_id/);
assert.match(topics, /tenant_id=\$1 AND platform_id=\$2/);

assert.match(core, /1\.23\.0-topics-security-control/);
assert.match(core, /\/admin\/me\/2fa\/verify/);
assert.match(core, /verifyOwn2fa/);
assert.match(core, /2fa_self_verified/);
assert.match(core, /code_consumed:true/);
assert.match(core, /next_code_in_seconds/);
assert.match(core, /pm\.permissions_json,pm\.require_2fa/);
assert.match(core, /membershipPermissions/);
assert.match(core, /twofa_setup_required/);
assert.match(core, /TWOFA_SETUP_REQUIRED/);
assert.match(core, /SELF_ROLE_CHANGE_DENIED/);
assert.match(core, /SELF_2FA_RESET_DENIED/);
assert.match(core, /guide_topics gt JOIN categories tc/);

assert.match(server, /multi-topic-content/);
assert.match(server, /membership-scoped-permissions/);
assert.match(server, /syncTopicsFromResponse/);
assert.match(server, /enrichTopicsResponse/);

assert.match(adminApi, /verifyOwn2FA/);
assert.match(adminApi, /forceLogoutPlatformAdmin/);
assert.match(adminApi, /resetPlatformAdmin2FA/);
assert.match(layout, /Security & Permissions/);
assert.match(layout, /SafetyCertificateOutlined/);
assert.match(layout, /v1\.23\.0/);
assert.match(account, /Test my 2FA code/);
assert.match(account, /api\.verifyOwn2FA/);
assert.match(account, /Code verified and consumed/);

assert.match(security, /membership-scoped access control/);
assert.match(security, /Require 2FA for this platform/);
assert.match(security, /Check all/);
assert.match(security, /Clear all/);
assert.match(security, /Sidebar preview/);
assert.match(security, /Full admin/);
assert.match(security, /Content manager/);
assert.match(security, /Support manager/);
assert.match(security, /Force logout/);
assert.match(security, /Reset 2FA/);
assert.match(security, /permission\.endsWith\("\.manage"\)/);

assert.match(guide, /name="topic_ids"/);
assert.match(guide, /name="primary_topic_id"/);
assert.match(guide, /mode="multiple"/);
assert.match(guide, /topic\.is_primary/);
assert.match(faq, /name="topic_ids"/);
assert.match(faq, /name="primary_topic_id"/);
assert.match(faq, /row\.topics/);

console.log('v1.23.0 multi-topic + security control regression checks passed');
