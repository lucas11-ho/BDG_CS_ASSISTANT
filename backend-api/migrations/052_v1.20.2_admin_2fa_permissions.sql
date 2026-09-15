ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS permissions_json TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS twofa_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS twofa_last_counter BIGINT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS twofa_failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS twofa_locked_until TIMESTAMPTZ;

INSERT INTO system_migrations(migration_key, notes)
VALUES(
  'v1.20.2_admin_2fa_permissions',
  'Encrypted administrator TOTP secrets, replay and lockout protection, required 2FA policy, and explicit Admin permissions'
)
ON CONFLICT(migration_key) DO NOTHING;
