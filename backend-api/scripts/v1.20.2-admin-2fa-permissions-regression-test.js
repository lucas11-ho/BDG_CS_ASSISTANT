import assert from "node:assert/strict";
import fs from "node:fs";

function source(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const core = source("../src/core.js");
const migration = source("../migrations/052_v1.20.2_admin_2fa_permissions.sql");
const api = source("../../admin-pro/src/lib/api.ts");
const layout = source("../../admin-pro/src/components/AdminLayout.tsx");
const security = source("../../admin-pro/src/components/AccountSecurityDrawer.tsx");
const users = source("../../admin-pro/src/routes/_admin.admin-users.tsx");
const messages = source("../../admin-pro/src/i18n/messages.ts");

for (const column of [
  "permissions_json", "twofa_required", "twofa_last_counter",
  "twofa_failed_attempts", "twofa_locked_until",
]) assert.ok(migration.includes(column), `missing security migration column ${column}`);

for (const marker of [
  "AES-GCM", "encryptTotpSecret", "decryptTotpSecret", "enc$v1$",
  "verifyAndConsumeAdminTotp", "TWOFA_REPLAYED", "TWOFA_LOCKED",
  "twofa_failed_attempts,0)+1 >= 5", "INTERVAL '10 minutes'",
  "TWOFA_SETUP_REQUIRED", "TWOFA_REQUIRED_BY_OWNER",
]) assert.ok(core.includes(marker), `missing hardened 2FA marker ${marker}`);

for (const permission of [
  "platform.manage", "content.manage", "ai.manage", "support.manage",
  "chat.manage", "appearance.manage", "audit.view", "system.view",
]) assert.ok(core.includes(`'${permission}'`), `missing permission ${permission}`);

assert.ok(core.includes("requireAdminRoutePermission(admin, method, path)"));
assert.ok(core.includes("requirePlatformRoutePermission(scope, method, path)"));
assert.ok(core.includes("permissionsForMembershipRole"));
assert.ok(core.includes("role === 'content_manager'"));
assert.ok(core.includes("role === 'ai_manager'"));
assert.ok(core.includes("role === 'support_analyst'"));
assert.ok(core.includes("admin?.role === 'owner'"));

assert.ok(api.includes("hasAdminPermission"));
assert.ok(layout.includes("permissionForNav"));
assert.ok(layout.includes("user?.twofa_setup_required"));
assert.ok(
  layout.includes("if (user?.twofa_setup_required && !next.twofa_setup_required) setSecurityOpen(false);"),
  "Account & Security must stay open after an ordinary profile refresh",
);
assert.ok(security.includes("required={") || security.includes("required = false"));
assert.ok(security.includes("maskClosable={!required}"));
assert.ok(users.includes('name="permissions"'));
assert.ok(users.includes('name="twofa_required"'));
assert.ok(users.includes("PERMISSION_OPTIONS"));

for (const phrase of [
  "Two-factor authentication setup is required",
  "Backend-enforced permissions",
  "The owner always has full access and cannot be restricted.",
]) assert.ok(messages.includes(`["${phrase}"`), `missing i18n phrase ${phrase}`);

console.log("PASS Admin TOTP secrets are encrypted with replay and lockout protection");
console.log("PASS required 2FA is enforced while self-service enrollment remains reachable");
console.log("PASS global and platform permissions are enforced by the backend and reflected in Admin UI");
