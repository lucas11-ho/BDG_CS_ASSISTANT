from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')

def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'v1.23 builder: missing anchor for {label}')
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# Backend core: membership permissions, per-platform 2FA requirement, self 2FA
# verification, and multi-topic category filtering.
# ---------------------------------------------------------------------------
path = 'backend-api/src/core.js'
s = read(path)
s = replace_once(s, "const VERSION = '1.22.1-stability-performance';", "const VERSION = '1.23.0-topics-security-control';", 'core version')

anchor = "  if (method === 'POST' && path === '/admin/me/2fa/disable') return json(await disableOwn2fa(env, admin, await readJson(request)), 200, env);"
s = replace_once(s, anchor, anchor + "\n  if (method === 'POST' && path === '/admin/me/2fa/verify') return json(await verifyOwn2fa(env, admin, await readJson(request)), 200, env);", 'self 2fa route')

anchor = "async function changeOwnPassword(env, admin, p = {}) {"
verify_fn = """async function verifyOwn2fa(env, admin, p = {}) {
  const row = (await q(env, 'SELECT id,email,twofa_enabled,twofa_secret,twofa_last_counter,twofa_failed_attempts,twofa_locked_until FROM admin_users WHERE lower(email)=lower($1) LIMIT 1', [admin.email])).rows[0];
  if (!row) bad('Admin not found', 404, 'ADMIN_NOT_FOUND');
  if (row.twofa_enabled !== true || !row.twofa_secret) bad('Enable two-factor authentication before testing a code', 409, 'TWOFA_NOT_ENABLED');
  const code = String(p.code || p.twofa_code || p.otp || '').trim();
  if (!/^\\d{6}$/.test(code)) bad('Enter a valid 6-digit code', 400, 'TWOFA_CODE_INVALID');
  await verifyAndConsumeAdminTotp(env, row, code, { invalidStatus:400 });
  const nowSeconds = Math.floor(Date.now() / 1000);
  const nextCodeInSeconds = Math.max(1, 30 - (nowSeconds % 30));
  await securityAudit(env, admin, '2fa_self_verified', row.id, 'Administrator verified their current 2FA code');
  return { ok:true, verified:true, code_consumed:true, verified_at:new Date().toISOString(), next_code_in_seconds:nextCodeInSeconds };
}
"""
s = replace_once(s, anchor, verify_fn + anchor, 'self 2fa function')

old = "function platformMemberOut(row) {\n  return { id: Number(row.id), platform_id: Number(row.platform_id), admin_user_id: Number(row.admin_user_id), name: row.name || '', email: row.email || '', role: row.role || 'viewer', is_active: row.is_active !== false, created_at: row.created_at ? String(row.created_at) : '' };\n}"
new = """function platformMemberOut(row) {
  const role = row.role || 'viewer';
  const owner = role === 'platform_owner';
  const explicit = parseAdminPermissions(row.permissions_json);
  const permissions = owner ? [...ADMIN_PERMISSION_CATALOG] : (explicit || permissionsForMembershipRole(role));
  return {
    id:Number(row.id), platform_id:Number(row.platform_id), admin_user_id:Number(row.admin_user_id),
    name:row.name || '', email:row.email || '', role, is_active:row.is_active !== false,
    twofa_enabled:row.twofa_enabled === true,
    require_2fa:row.require_2fa === true,
    twofa_required:row.require_2fa === true || row.twofa_required === true,
    permissions, permission_catalog:[...ADMIN_PERMISSION_CATALOG], permissions_configured:owner || row.permissions_json != null,
    created_at:row.created_at ? String(row.created_at) : '',
  };
}"""
s = replace_once(s, old, new, 'platform member output')

s = s.replace("SELECT pm.*,u.name,u.email,u.is_active FROM saas_platform_memberships pm JOIN admin_users u ON u.id=pm.admin_user_id WHERE pm.platform_id=$1", "SELECT pm.*,u.name,u.email,u.is_active,u.twofa_enabled,u.twofa_required FROM saas_platform_memberships pm JOIN admin_users u ON u.id=pm.admin_user_id WHERE pm.platform_id=$1")
s = s.replace("SELECT pm.*,u.name,u.email,u.is_active FROM saas_platform_memberships pm JOIN admin_users u ON u.id=pm.admin_user_id WHERE pm.id=$1 AND pm.platform_id=$2", "SELECT pm.*,u.name,u.email,u.is_active,u.twofa_enabled,u.twofa_required FROM saas_platform_memberships pm JOIN admin_users u ON u.id=pm.admin_user_id WHERE pm.id=$1 AND pm.platform_id=$2")

old = "  const user = (await q(env, `UPDATE admin_users SET name=$1,is_active=$2,updated_at=NOW() WHERE id=$3 RETURNING *`, [String(payload.name || current.name || current.email).slice(0,160), payload.status ? payload.status !== 'inactive' : payload.is_active !== false, current.admin_user_id])).rows[0];\n  const member = (await q(env, `UPDATE saas_platform_memberships SET role=$1,updated_at=NOW() WHERE id=$2 AND platform_id=$3 RETURNING *`, [role,membershipId,scope.platform_id])).rows[0];"
new = """  if (String(current.email || '').toLowerCase() === String(admin.email || '').toLowerCase() && role !== current.role) bad('You cannot change your own platform role', 409, 'SELF_ROLE_CHANGE_DENIED');
  const user = (await q(env, `UPDATE admin_users SET name=$1,is_active=$2,updated_at=NOW() WHERE id=$3 RETURNING *`, [String(payload.name || current.name || current.email).slice(0,160), payload.status ? payload.status !== 'inactive' : payload.is_active !== false, current.admin_user_id])).rows[0];
  const requestedPermissions = role === 'platform_owner' ? null : (Object.prototype.hasOwnProperty.call(payload, 'permissions') ? validatedAdminPermissions(payload.permissions) : parseAdminPermissions(current.permissions_json));
  const require2fa = Object.prototype.hasOwnProperty.call(payload, 'require_2fa') ? payload.require_2fa === true : current.require_2fa === true;
  const member = (await q(env, `UPDATE saas_platform_memberships SET role=$1,permissions_json=$2,require_2fa=$3,updated_at=NOW() WHERE id=$4 AND platform_id=$5 RETURNING *`, [role,requestedPermissions == null ? null : JSON.stringify(requestedPermissions),require2fa,membershipId,scope.platform_id])).rows[0];"""
s = replace_once(s, old, new, 'membership policy update')

# New platform-member force logout and reset 2FA routes.
anchor = "  if (method === 'POST' && /^\\/admin\\/platform-admin-users\\/\\d+\\/password$/.test(path)) return json(await changeCurrentPlatformAdminPassword(env, admin, idFromParts(path, 3), await readJson(request), scope), 200, env);"
extra = anchor + "\n  if (method === 'POST' && /^\\/admin\\/platform-admin-users\\/\\d+\\/force-logout$/.test(path)) return json(await forceLogoutCurrentPlatformAdmin(env, admin, idFromParts(path, 3), scope), 200, env);\n  if (method === 'POST' && /^\\/admin\\/platform-admin-users\\/\\d+\\/reset-2fa$/.test(path)) return json(await resetCurrentPlatformAdmin2fa(env, admin, idFromParts(path, 3), scope), 200, env);"
s = replace_once(s, anchor, extra, 'platform security actions routes')

anchor = "async function changeCurrentPlatformAdminPassword(env, admin, membershipId, payload, scope) {"
helpers = """async function platformMembershipTarget(env, membershipId, scope) {
  const row = (await q(env, `SELECT pm.*,u.email,u.role AS global_role FROM saas_platform_memberships pm JOIN admin_users u ON u.id=pm.admin_user_id WHERE pm.id=$1 AND pm.platform_id=$2 LIMIT 1`, [membershipId,scope.platform_id])).rows[0];
  if (!row) bad('Platform administrator not found', 404, 'PLATFORM_ADMIN_NOT_FOUND');
  return row;
}
async function forceLogoutCurrentPlatformAdmin(env, admin, membershipId, scope) {
  if (!scope?.can_manage_platform) bad('Platform owner permission required', 403, 'PLATFORM_ADMIN_REQUIRED');
  const target = await platformMembershipTarget(env, membershipId, scope);
  await q(env, 'UPDATE admin_users SET session_version=COALESCE(session_version,0)+1,updated_at=NOW() WHERE id=$1', [target.admin_user_id]);
  await audit(env, 'security', 'platform_admin_user', membershipId, `All Admin sessions revoked for ${target.email}`, scope);
  return { ok:true, membership_id:Number(membershipId) };
}
async function resetCurrentPlatformAdmin2fa(env, admin, membershipId, scope) {
  if (!scope?.can_manage_platform) bad('Platform owner permission required', 403, 'PLATFORM_ADMIN_REQUIRED');
  const target = await platformMembershipTarget(env, membershipId, scope);
  if (String(target.email || '').toLowerCase() === String(admin.email || '').toLowerCase()) bad('Use Account & Security to change your own 2FA', 409, 'SELF_2FA_RESET_DENIED');
  await q(env, `UPDATE admin_users SET twofa_enabled=FALSE,twofa_secret=NULL,twofa_last_counter=NULL,twofa_failed_attempts=0,twofa_locked_until=NULL,session_version=COALESCE(session_version,0)+1,updated_at=NOW() WHERE id=$1`, [target.admin_user_id]);
  await audit(env, 'security', 'platform_admin_user', membershipId, `2FA reset for ${target.email}`, scope);
  return { ok:true, membership_id:Number(membershipId), twofa_enabled:false };
}
"""
s = replace_once(s, anchor, helpers + anchor, 'platform security actions functions')

# Membership-scoped permission resolution and membership 2FA policy.
s = replace_once(s,
"SELECT pm.role AS membership_role FROM saas_platform_memberships pm\n    JOIN admin_users u ON u.id=pm.admin_user_id",
"SELECT pm.role AS membership_role,pm.permissions_json,pm.require_2fa FROM saas_platform_memberships pm\n    JOIN admin_users u ON u.id=pm.admin_user_id",
'platform membership policy select')
old = "  const explicitPermissions = admin.permissions == null ? null : new Set(admin.permissions);\n  let permissions = explicitPermissions == null\n    ? rolePermissions\n    : rolePermissions.filter(permission => explicitPermissions.has(permission));"
new = """  const membershipPermissions = parseAdminPermissions(platformMembership?.permissions_json);
  const legacyGlobalPermissions = admin.permissions == null ? null : new Set(admin.permissions);
  const explicitPermissions = membershipPermissions == null ? legacyGlobalPermissions : new Set(membershipPermissions);
  let permissions = ['tenant_owner','platform_owner'].includes(accessRole)
    ? rolePermissions
    : (explicitPermissions == null ? rolePermissions : rolePermissions.filter(permission => explicitPermissions.has(permission)));"""
s = replace_once(s, old, new, 'membership permission resolution')
old = "  return { ...scope, tenant_role:tenantRole, platform_role:platformRole, access_role:accessRole, permissions, can_write:canWrite, can_manage_platform:canManagePlatform, can_upload_guides:canUploadGuides, can_publish_guides:canUploadGuides, operator:false };"
new = "  const membershipTwofaRequired = platformMembership?.require_2fa === true || admin.twofa_required === true;\n  return { ...scope, tenant_role:tenantRole, platform_role:platformRole, access_role:accessRole, permissions, can_write:canWrite, can_manage_platform:canManagePlatform, can_upload_guides:canUploadGuides, can_publish_guides:canUploadGuides, twofa_required:membershipTwofaRequired, twofa_setup_required:membershipTwofaRequired && admin.twofa_enabled !== true, operator:false };"
s = replace_once(s, old, new, 'membership 2fa resolution')
old = "  return { ok:true, version:VERSION, platform:scope, platform_resolution:platformResolutionDiagnostics(scope, scope.platform_context), access: { role:scope.access_role, permissions:scope.permissions, can_write:scope.can_write, can_manage_platform:scope.can_manage_platform, can_upload_guides:scope.can_upload_guides, can_publish_guides:scope.can_publish_guides } };"
new = "  return { ok:true, version:VERSION, platform:scope, platform_resolution:platformResolutionDiagnostics(scope, scope.platform_context), access: { role:scope.access_role, permissions:scope.permissions, can_write:scope.can_write, can_manage_platform:scope.can_manage_platform, can_upload_guides:scope.can_upload_guides, can_publish_guides:scope.can_publish_guides, twofa_required:scope.twofa_required === true, twofa_setup_required:scope.twofa_setup_required === true } };"
s = replace_once(s, old, new, 'platform context security output')
old = "  if (scope) scope.actor_email = admin?.email || '';\n  if (scope) requirePlatformRoutePermission(scope, method, path);"
new = "  if (scope) scope.actor_email = admin?.email || '';\n  if (scope?.twofa_setup_required) bad('Two-factor authentication setup is required for this platform', 403, 'TWOFA_SETUP_REQUIRED');\n  if (scope) requirePlatformRoutePermission(scope, method, path);"
s = replace_once(s, old, new, 'platform 2fa enforcement')

# Public Guide category filter now matches any assigned topic, with legacy fallback.
old = "  if (category) { vals.push(category); sql += ` AND c.slug=$${vals.length}`; }"
new = "  if (category) { vals.push(category); sql += ` AND (c.slug=$${vals.length} OR EXISTS (SELECT 1 FROM guide_topics gt JOIN categories tc ON tc.id=gt.category_id WHERE gt.guide_id=g.id AND gt.tenant_id=g.tenant_id AND gt.platform_id=g.platform_id AND tc.slug=$${vals.length}))`; }"
s = replace_once(s, old, new, 'guide any-topic filter')
write(path, s)

# ---------------------------------------------------------------------------
# Server wrapper: v1.23 feature flags and response-level topic synchronization.
# ---------------------------------------------------------------------------
path = 'backend-api/src/server.js'
s = read(path)
s = replace_once(s, "const API_VERSION = '1.22.1-stability-performance';", "const API_VERSION = '1.23.0-topics-security-control';", 'server version')
import_anchor = "} from './faq-topics.js';"
import_extra = import_anchor + "\nimport { closeMultiTopicPools, enrichTopicsResponse, syncTopicsFromResponse } from './multi-topics.js';"
s = replace_once(s, import_anchor, import_extra, 'multi topic import')
s = replace_once(s, "  'secure-platform-transfer',", "  'multi-topic-content',\n  'membership-scoped-permissions',\n  'platform-twofa-policy',\n  'self-twofa-verification',\n  'security-permissions-control-center',\n  'secure-platform-transfer',", 'server features')
old = """    const isFaqWrite = response.ok && ((method === 'POST' && path === '/admin/faqs') || (method === 'PUT' && /^\\/admin\\/faqs\\/\\d+$/.test(path)));
    const isFaqRead = response.ok && method === 'GET' && (path === '/admin/faqs' || path === '/faqs' || path === '/public/faqs');
    if (isFaqWrite) {
      await persistFaqTopicFromResponse(response, env, faqTopicFromJsonBody(body));
      response = await enrichFaqTopicResponse(response, env);
    } else if (isFaqRead) {
      response = await enrichFaqTopicResponse(response, env);
    }"""
new = """    const isFaqWrite = response.ok && ((method === 'POST' && path === '/admin/faqs') || (method === 'PUT' && /^\\/admin\\/faqs\\/\\d+$/.test(path)));
    const isFaqRead = response.ok && method === 'GET' && (path === '/admin/faqs' || path === '/faqs' || path === '/public/faqs');
    const isGuideWrite = response.ok && ((method === 'POST' && path === '/admin/guides') || (method === 'PUT' && /^\\/admin\\/guides\\/\\d+$/.test(path)));
    const isGuideRead = response.ok && method === 'GET' && (path === '/admin/guides' || path === '/guides' || path === '/public/guides' || /^\\/guides\\/[^/]+$/.test(path));
    if (isFaqWrite) {
      await persistFaqTopicFromResponse(response, env, faqTopicFromJsonBody(body));
      response = await syncTopicsFromResponse(response, env, 'faq', body || {});
      response = await enrichFaqTopicResponse(response, env);
      response = await enrichTopicsResponse(response, env, 'faq');
    } else if (isFaqRead) {
      response = await enrichFaqTopicResponse(response, env);
      response = await enrichTopicsResponse(response, env, 'faq');
    }
    if (isGuideWrite) {
      response = await syncTopicsFromResponse(response, env, 'guide', body || {});
      response = await enrichTopicsResponse(response, env, 'guide');
    } else if (isGuideRead) {
      response = await enrichTopicsResponse(response, env, 'guide');
    }"""
s = replace_once(s, old, new, 'topic response hooks')
s = replace_once(s, "    await closeFaqTopicPools().catch(() => undefined);", "    await closeFaqTopicPools().catch(() => undefined);\n    await closeMultiTopicPools().catch(() => undefined);", 'topic pool shutdown')
write(path, s)

# ---------------------------------------------------------------------------
# Admin API client.
# ---------------------------------------------------------------------------
path = 'admin-pro/src/lib/api.ts'
s = read(path)
anchor = "  setup2FA: async () => {"
methods = """  verifyOwn2FA: async (code: string) => {
    if (MOCK_MODE) return delay({ ok:true,verified:true,code_consumed:true,verified_at:new Date().toISOString(),next_code_in_seconds:18 });
    return request('/admin/me/2fa/verify', { method:'POST', body:JSON.stringify({ code }) });
  },
  forceLogoutPlatformAdmin: async (membershipId: string | number) => {
    if (MOCK_MODE) return delay({ ok:true });
    return request(`/admin/platform-admin-users/${membershipId}/force-logout`, { method:'POST', body:JSON.stringify({}) });
  },
  resetPlatformAdmin2FA: async (membershipId: string | number) => {
    if (MOCK_MODE) return delay({ ok:true,twofa_enabled:false });
    return request(`/admin/platform-admin-users/${membershipId}/reset-2fa`, { method:'POST', body:JSON.stringify({}) });
  },

"""
s = replace_once(s, anchor, methods + anchor, 'admin security API methods')
# Preserve topic relationship fields in normalized writes.
s = s.replace("      category_id: data.category_id || null,\n      category_slug:", "      category_id: data.category_id || data.primary_topic_id || null,\n      primary_topic_id: data.primary_topic_id || data.category_id || null,\n      topic_ids: Array.isArray(data.topic_ids) ? data.topic_ids : [],\n      topic_slugs: Array.isArray(data.topic_slugs) ? data.topic_slugs : [],\n      category_slug:")
# Platform-admin update normalization: include membership policy fields.
needle = "      twofa_required: data.twofa_required === true,"
if needle in s:
    s = s.replace(needle, needle + "\n      require_2fa: data.require_2fa === true,\n      permissions: Array.isArray(data.permissions) ? data.permissions : undefined,", 1)
write(path, s)

# ---------------------------------------------------------------------------
# Account security drawer: test/consume own TOTP code without exposing secret.
# ---------------------------------------------------------------------------
path = 'admin-pro/src/components/AccountSecurityDrawer.tsx'
s = read(path)
s = replace_once(s, "  const [code, setCode] = useState(\"\");", "  const [code, setCode] = useState(\"\");\n  const [testCode, setTestCode] = useState(\"\");\n  const [testResult, setTestResult] = useState<any>(null);", '2fa test state')
s = replace_once(s, "    setCode(\"\");\n    load().catch", "    setCode(\"\");\n    setTestCode(\"\");\n    setTestResult(null);\n    load().catch", '2fa test reset')
anchor = "  const disable = async () => {"
fn = """  const test2fa = async () => {
    if (!/^\\d{6}$/.test(testCode)) { message.warning(t('Enter a valid 6-digit code')); return; }
    setBusy(true);
    try {
      const result: any = await api.verifyOwn2FA(testCode);
      setTestResult(result);
      setTestCode('');
      message.success(t('2FA code verified successfully'));
    } catch (error: unknown) {
      message.error(errorMessage(error, t('2FA verification failed')));
    } finally { setBusy(false); }
  };

"""
s = replace_once(s, anchor, fn + anchor, '2fa test function')
marker = "                {profile.twofa_required ? ("
block = """                <Divider />
                <Typography.Title level={5} style={{ marginBottom: 6 }}>{t('Test my 2FA code')}</Typography.Title>
                <Typography.Paragraph type="secondary">
                  {t('Verify your authenticator is working. A successful test consumes this 30-second code, so wait for the next code before using 2FA again.')}
                </Typography.Paragraph>
                <Space.Compact style={{ width: '100%' }}>
                  <Input value={testCode} onChange={(event) => setTestCode(event.target.value.replace(/\\D/g, '').slice(0, 6))} placeholder={t('Current 6-digit code')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
                  <Button onClick={() => void test2fa()} loading={busy}>{t('Test code')}</Button>
                </Space.Compact>
                {testResult?.verified ? <Alert type="success" showIcon style={{ marginTop: 10 }} message={t('Code verified and consumed')} description={`${t('Use a new authenticator code after approximately')} ${testResult.next_code_in_seconds || 30}s.`} /> : null}
"""
s = replace_once(s, marker, block + marker, '2fa test UI')
write(path, s)

# ---------------------------------------------------------------------------
# Admin navigation + platform 2FA setup prompt.
# ---------------------------------------------------------------------------
path = 'admin-pro/src/components/AdminLayout.tsx'
s = read(path)
s = replace_once(s, "  BarChartOutlined,\n} from \"@ant-design/icons\";", "  BarChartOutlined,\n  SafetyCertificateOutlined,\n} from \"@ant-design/icons\";", 'security icon')
s = replace_once(s, 'const ADMIN_VERSION = "v1.22.1";', 'const ADMIN_VERSION = "v1.23.0";', 'admin version')
anchor = "  {\n    key: \"/admin-users\",\n    to: \"/admin-users\",\n    label: \"Admin Users\",\n    icon: <TeamOutlined />,\n    group: \"SETTINGS\",\n  },"
entry = anchor + "\n  { key: \"/security-permissions\", to: \"/security-permissions\", label: \"Security & Permissions\", icon: <SafetyCertificateOutlined />, group: \"SETTINGS\" },"
s = replace_once(s, anchor, entry, 'security nav')
s = replace_once(s, '  if (item.key === "/admin-users") return "platform.manage";', '  if (item.key === "/admin-users" || item.key === "/security-permissions") return "platform.manage";', 'security nav permission')
s = replace_once(s, '    if (item.key === "/admin-users" && userRole !== "owner" && !(getActiveAdminPlatformRoute() && canManagePlatform)) continue;', '    if ((item.key === "/admin-users" || item.key === "/security-permissions") && userRole !== "owner" && !(getActiveAdminPlatformRoute() && canManagePlatform)) continue;', 'security nav visibility')
old = "api.getPlatformContext().then((value) => { if (alive) setPlatformContext(value); }).catch(() => { if (alive) setPlatformContext(null); });"
new = "api.getPlatformContext().then((value: any) => { if (alive) { setPlatformContext(value); if (value?.access?.twofa_setup_required === true) setSecurityOpen(true); } }).catch(() => { if (alive) setPlatformContext(null); });"
s = replace_once(s, old, new, 'membership 2fa drawer trigger')
# Lightweight translation entries.
s = s.replace('  "Admin Users": "管理员账号",', '  "Admin Users": "管理员账号",\n  "Security & Permissions": "安全与权限",')
s = s.replace('"Admin Users": "စီမံသူများ",', '"Admin Users": "စီမံသူများ", "Security & Permissions": "လုံခြုံရေးနှင့် ခွင့်ပြုချက်များ",')
write(path, s)

# ---------------------------------------------------------------------------
# Guide admin: primary topic + searchable many-topic selection and badges.
# ---------------------------------------------------------------------------
path = 'admin-pro/src/routes/_admin.guide-images.tsx'
s = read(path)
# Initialize topic IDs on open and saves.
s = s.replace("form.setFieldsValue(row || { title: \"\", slug: \"\", status: \"draft\", priority: 100, button_ids: [] });", "form.setFieldsValue(row ? { ...row, primary_topic_id: row.primary_topic_id || row.category_id, topic_ids: row.topic_ids || (row.category_id ? [row.category_id] : []) } : { title: \"\", slug: \"\", status: \"draft\", priority: 100, button_ids: [], topic_ids: [] });")
s = s.replace("          category_id: form.getFieldValue(\"category_id\"),", "          category_id: form.getFieldValue(\"primary_topic_id\") || form.getFieldValue(\"category_id\"),\n          primary_topic_id: form.getFieldValue(\"primary_topic_id\") || form.getFieldValue(\"category_id\"),\n          topic_ids: form.getFieldValue(\"topic_ids\") || [],")
# Update branch has same category line; replace remaining occurrences.
s = s.replace("          category_id: form.getFieldValue(\"category_id\"),", "          category_id: form.getFieldValue(\"primary_topic_id\") || form.getFieldValue(\"category_id\"),\n          primary_topic_id: form.getFieldValue(\"primary_topic_id\") || form.getFieldValue(\"category_id\"),\n          topic_ids: form.getFieldValue(\"topic_ids\") || [],")
old = '<Col xs={24} md={8}><Form.Item name="category_id" label="Category"><Select allowClear options={categories.map((category) => ({ value: category.id, label: category.name }))} /></Form.Item></Col>'
new = '<Col xs={24} md={8}><Form.Item name="primary_topic_id" label="Primary topic"><Select allowClear showSearch optionFilterProp="label" onChange={(value) => { const current = form.getFieldValue("topic_ids") || []; form.setFieldValue("topic_ids", value ? [...new Set([value, ...current])] : current); }} options={categories.map((category) => ({ value: category.id, label: category.name }))} /></Form.Item></Col>'
s = replace_once(s, old, new, 'guide primary topic field')
anchor = "        </Row>\n        <Row gutter={12}>\n          <Col xs={24} md={12}><Form.Item name=\"title\""
insert = "        </Row>\n        <Form.Item name=\"topic_ids\" label=\"Topics\" extra=\"Assign one or more searchable topics. The primary topic is always kept in the selection.\"><Select mode=\"multiple\" allowClear showSearch optionFilterProp=\"label\" options={categories.map((category) => ({ value: category.id, label: category.name }))} /></Form.Item>\n        <Row gutter={12}>\n          <Col xs={24} md={12}><Form.Item name=\"title\""
s = replace_once(s, anchor, insert, 'guide topics selector')
old = '{ title: "Category", dataIndex: "category_name", width: 150 },'
new = '{ title: "Topics", width: 260, render: (_: any, row: any) => <Space wrap>{(row.topics?.length ? row.topics : [{ name: row.category_name || "—", is_primary: true }]).map((topic: any) => <Tag key={`${row.id}-${topic.id || topic.name}`} color={topic.is_primary ? "blue" : "default"}>{topic.name || topic.slug}{topic.is_primary ? " · primary" : ""}</Tag>)}</Space> },'
s = replace_once(s, old, new, 'guide topics badges')
write(path, s)

# ---------------------------------------------------------------------------
# FAQ admin: load category registry, multi-topic selector/filter/badges.
# ---------------------------------------------------------------------------
path = 'admin-pro/src/routes/_admin.faq.tsx'
s = read(path)
s = replace_once(s, "  const [rows, setRows] = useState<any[]>([]);", "  const [rows, setRows] = useState<any[]>([]);\n  const [categories, setCategories] = useState<any[]>([]);", 'faq categories state')
old = """      const [faqRows, registry] = await Promise.all([
        api.list("faq") as Promise<any[]>,
        api.getLocaleRegistry(),
      ]);
      setRows(faqRows || []);"""
new = """      const [faqRows, registry, categoryRows] = await Promise.all([
        api.list("faq") as Promise<any[]>,
        api.getLocaleRegistry(),
        api.list("categories") as Promise<any[]>,
      ]);
      setRows(faqRows || []);
      setCategories(categoryRows || []);"""
s = replace_once(s, old, new, 'faq category load')
# Bulk payload preserves relationships.
s = replace_once(s, "    topic: String(row.topic || row.category || \"General\").trim() || \"General\",", "    topic: String(row.topic || row.category || \"General\").trim() || \"General\",\n    primary_topic_id: row.primary_topic_id || row.category_id || null,\n    topic_ids: Array.isArray(row.topic_ids) ? row.topic_ids : [],", 'faq bulk topic payload')
old = "    const current = item || { question: \"\", topic: \"General\", locale: defaultLocale || localeOptions[0]?.value || \"en\", status: \"published\", priority: 100, keywords: \"\" };"
new = "    const current = item || { question: \"\", topic: \"General\", topic_ids: [], primary_topic_id: null, locale: defaultLocale || localeOptions[0]?.value || \"en\", status: \"published\", priority: 100, keywords: \"\" };"
s = replace_once(s, old, new, 'faq default topics')
s = replace_once(s, "    form.setFieldsValue({ ...current, topic: current.topic || current.category || \"General\" });", "    form.setFieldsValue({ ...current, topic: current.topic || current.category || \"General\", primary_topic_id: current.primary_topic_id || current.category_id || null, topic_ids: current.topic_ids || (current.category_id ? [current.category_id] : []) });", 'faq edit topics')
old = "      const payload = { ...values, topic: String(values.topic || \"General\").trim() || \"General\", answer: answerHtml.replace(/<[^>]*>/g, \" \").replace(/\\s+/g, \" \").trim(), answer_html: answerHtml, answer_json: answerJson, image_urls: imageUrls };"
new = "      const payload = { ...values, topic: String(values.topic || \"General\").trim() || \"General\", primary_topic_id: values.primary_topic_id || null, topic_ids: values.topic_ids || [], answer: answerHtml.replace(/<[^>]*>/g, \" \").replace(/\\s+/g, \" \").trim(), answer_html: answerHtml, answer_json: answerJson, image_urls: imageUrls };"
s = replace_once(s, old, new, 'faq save topics')
old = '{ title: "Topic", dataIndex: "topic", width: 160, render: (value: string) => <Tag color="blue">{value || "General"}</Tag> },'
new = '{ title: "Topics", width: 260, render: (_: any, row: any) => <Space wrap>{(row.topics?.length ? row.topics : [{ name: row.topic || row.category || "General", is_primary: true }]).map((topic: any) => <Tag key={`${row.id}-${topic.id || topic.name}`} color={topic.is_primary ? "blue" : "default"}>{topic.name || topic.slug}{topic.is_primary ? " · primary" : ""}</Tag>)}</Space> },'
s = replace_once(s, old, new, 'faq topics badges')
old = '<Form.Item name="topic" label="Topic (localized)" rules={[{ required: true, message: "Topic is required" }]} style={{ width: 260 }} extra="Use the same language as this FAQ locale."><Input maxLength={160} placeholder="General / Deposit / Withdrawal / Bank" /></Form.Item>'
new = '<Form.Item name="primary_topic_id" label="Primary topic" style={{ width: 260 }}><Select allowClear showSearch optionFilterProp="label" onChange={(value) => { const current = form.getFieldValue("topic_ids") || []; form.setFieldValue("topic_ids", value ? [...new Set([value, ...current])] : current); const category = categories.find((item) => Number(item.id) === Number(value)); if (category?.name) form.setFieldValue("topic", category.name); }} options={categories.map((category) => ({ value: category.id, label: category.name }))} /></Form.Item>'
s = replace_once(s, old, new, 'faq primary topic field')
anchor = "        </Space>\n        <Form.Item name=\"keywords\""
insert = "        </Space>\n        <Form.Item name=\"topic_ids\" label=\"Topics\" extra=\"Choose every topic this FAQ belongs to. The primary topic is used as the compatibility label.\"><Select mode=\"multiple\" allowClear showSearch optionFilterProp=\"label\" options={categories.map((category) => ({ value: category.id, label: category.name }))} /></Form.Item>\n        <Form.Item name=\"topic\" hidden><Input /></Form.Item>\n        <Form.Item name=\"keywords\""
s = replace_once(s, anchor, insert, 'faq topics selector')
# Search/filter any topic, while keeping legacy string fallback.
s = s.replace("[row.question, row.answer, row.keywords, row.topic, row.category]", "[row.question, row.answer, row.keywords, row.topic, row.category, ...(row.topics || []).flatMap((topic: any) => [topic.name, topic.slug])]")
s = s.replace("      const topic = String(row.topic || row.category || \"General\").trim() || \"General\";\n      const matchesTopic = !topicFilter || topic === topicFilter;", "      const topic = String(row.topic || row.category || \"General\").trim() || \"General\";\n      const rowTopicLabels = (row.topics || []).flatMap((item: any) => [String(item.name || ''), String(item.slug || '')]);\n      const matchesTopic = !topicFilter || topic === topicFilter || rowTopicLabels.includes(topicFilter);")
write(path, s)

# ---------------------------------------------------------------------------
# Backend package check + v1.23 regression command.
# ---------------------------------------------------------------------------
path = 'backend-api/package.json'
pkg = json.loads(read(path))
pkg['scripts']['check'] = pkg['scripts']['check'].replace('node --check src/faq-topics.js', 'node --check src/faq-topics.js && node --check src/multi-topics.js')
pkg['scripts']['test:v1230-topics-security'] = 'node scripts/v1.23.0-topics-security-regression-test.js'
write(path, json.dumps(pkg, ensure_ascii=False, indent=2) + '\n')

print('v1.23.0 builder applied successfully')
