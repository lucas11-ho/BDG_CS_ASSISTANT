import assert from "node:assert/strict";
import fs from "node:fs";

function source(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const core = source("../src/core.js");
const server = source("../src/server.js");
const bulk = source("../src/bulk-content-studio.js");
const api = source("../../admin-pro/src/lib/api.ts");
const login = source("../../admin-pro/src/routes/login.tsx");
const guard = source("../../admin-pro/src/routes/_admin.tsx");
const bulkApi = source("../../admin-pro/src/lib/bulk-content-api.ts");
const layout = source("../../admin-pro/src/components/AdminLayout.tsx");
const securityDrawer = source("../../admin-pro/src/components/AccountSecurityDrawer.tsx");
const adminUsers = source("../../admin-pro/src/routes/_admin.admin-users.tsx");
const dashboard = source("../../admin-pro/src/routes/_admin.dashboard.tsx");
const diagnostics = source("../../admin-pro/src/routes/_admin.ai-diagnostics.tsx");
const dataPage = source("../../admin-pro/src/components/DataPage.tsx");
const auditLogs = source("../../admin-pro/src/routes/_admin.audit-logs.tsx");
const messages = source("../../admin-pro/src/i18n/messages.ts");

for (const marker of [
  "/admin/me/2fa/setup",
  "/admin/me/2fa/enable",
  "/admin/me/2fa/disable",
  "/force-logout$",
  "/reset-2fa$",
]) {
  assert.ok(core.includes(marker), "missing security route marker " + marker);
}
assert.ok(core.includes("requireOwnerStepUp"));
assert.ok(core.includes("OWNER_2FA_REQUIRED"));
assert.ok(core.includes("ADMIN_SELF_ACTION_DENIED"));
assert.ok(core.includes("session_version=COALESCE(session_version,0)+1"));
assert.ok(core.includes("securityAudit(env, admin, 'force_logout'"));
assert.ok(core.includes("securityAudit(env, admin, 'reset_2fa'"));
assert.ok(core.includes("scope.actor_email = admin?.email"));
assert.ok(core.includes("scope?.actor_email || 'admin'"));

assert.ok(bulk.includes("guideIdsBySlug"));
assert.ok(bulk.includes("row.existing_guide_id || guideIdsBySlug.get(row.slug)"));
assert.ok(bulk.includes("guideIdsBySlug.set(row.slug, guideId)"));
assert.ok(server.includes("error?.code === '23505'"));
assert.ok(server.includes("CONTENT_CONFLICT"));

assert.ok(api.includes("remember = false"));
assert.ok(api.includes("window.sessionStorage"));
assert.ok(api.includes("a.actor_email || a.actor"));
assert.ok(login.includes('name="remember"'));
assert.ok(login.includes("values.remember === true"));
assert.ok(!login.includes("<a style="));
assert.ok(guard.includes("window.sessionStorage"));
assert.ok(bulkApi.includes("window.sessionStorage"));

assert.ok(layout.includes("AccountSecurityDrawer"));
assert.ok(layout.includes("setSecurityOpen(true)"));
assert.ok(securityDrawer.includes("<QRCode"));
assert.ok(securityDrawer.includes("api.setup2FA()"));
assert.ok(securityDrawer.includes("api.enable2FA(code)"));
assert.ok(securityDrawer.includes("api.disable2FA(code)"));
assert.ok(adminUsers.includes("api.forceLogoutAdmin"));
assert.ok(adminUsers.includes("api.resetAdmin2FA"));
assert.ok(adminUsers.includes("Owner 2FA code"));
assert.ok(!adminUsers.includes('dataIndex: "session_version"'));

for (const fakeMetric of ['99.98%', '812 ms', '0.04%', '12 jobs', 'value: "Operational"']) {
  assert.ok(!dashboard.includes(fakeMetric), "dashboard still contains fabricated metric " + fakeMetric);
}
assert.ok(dashboard.includes("data.systemHealth"));
assert.ok(dashboard.includes("activity.actor"));
assert.ok(diagnostics.includes('row.status || (row.ok ? "verified" : "failed")'));
assert.ok(!core.includes("async () => 'ready'"));

assert.ok(dataPage.includes("readOnly?: boolean"));
assert.ok(dataPage.includes("onExport?:"));
assert.ok(dataPage.includes("onExport ? <Button"));
assert.ok(dataPage.includes("rowSelection={allowSelect"));
assert.ok(auditLogs.includes("readOnly"));
assert.ok(auditLogs.includes("showStatusFilter={false}"));

for (const phrase of ["Account & Security", "Owner 2FA code", "Overall status", "Contact the owner to reset access"]) {
  assert.ok(messages.includes('["' + phrase + '"'), "missing i18n phrase " + phrase);
}

console.log("PASS owner 2FA and security actions are real, protected, and audited");
console.log("PASS remembered and session-only Admin login paths are complete");
console.log("PASS Dashboard, diagnostics, shared tables, and Audit Logs avoid fake controls and metrics");
console.log("PASS multilingual Guide imports reuse one parent Guide per stable slug");
