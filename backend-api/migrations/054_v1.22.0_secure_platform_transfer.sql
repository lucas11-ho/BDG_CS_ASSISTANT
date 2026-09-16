-- v1.22.0 Secure Platform Transfer Center
-- Immutable migration. Transfer secrets are never stored; manifests are encrypted.

BEGIN;

CREATE TABLE IF NOT EXISTS platform_transfer_grants (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL UNIQUE,
  source_tenant_id BIGINT NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  source_platform_id BIGINT NOT NULL REFERENCES saas_platforms(id) ON DELETE CASCADE,
  target_tenant_id BIGINT REFERENCES saas_tenants(id) ON DELETE SET NULL,
  target_platform_id BIGINT REFERENCES saas_platforms(id) ON DELETE SET NULL,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  token_hint VARCHAR(20) NOT NULL,
  manifest_version INTEGER NOT NULL DEFAULT 1,
  manifest_ciphertext TEXT NOT NULL,
  manifest_checksum VARCHAR(128) NOT NULL,
  modules_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  counts_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(24) NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','claimed','completed','revoked','expired')),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_by VARCHAR(255) NOT NULL,
  claimed_by VARCHAR(255),
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  manifest_purged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_transfer_jobs (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL UNIQUE,
  grant_id BIGINT NOT NULL REFERENCES platform_transfer_grants(id) ON DELETE RESTRICT,
  source_tenant_id BIGINT NOT NULL REFERENCES saas_tenants(id) ON DELETE RESTRICT,
  source_platform_id BIGINT NOT NULL REFERENCES saas_platforms(id) ON DELETE RESTRICT,
  target_tenant_id BIGINT NOT NULL REFERENCES saas_tenants(id) ON DELETE RESTRICT,
  target_platform_id BIGINT NOT NULL REFERENCES saas_platforms(id) ON DELETE RESTRICT,
  status VARCHAR(24) NOT NULL DEFAULT 'preview'
    CHECK (status IN ('preview','running','completed','failed','rolled_back')),
  conflict_policy VARCHAR(24) NOT NULL DEFAULT 'skip_existing'
    CHECK (conflict_policy IN ('skip_existing')),
  preview_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  rollback_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by VARCHAR(255) NOT NULL,
  applied_by VARCHAR(255),
  rolled_back_by VARCHAR(255),
  error_code VARCHAR(100),
  error_message TEXT,
  rollback_expires_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(grant_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_transfer_grants_source
  ON platform_transfer_grants(source_platform_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_transfer_grants_expiry
  ON platform_transfer_grants(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_platform_transfer_jobs_target
  ON platform_transfer_jobs(target_platform_id, created_at DESC);

INSERT INTO system_migrations(migration_key, notes)
VALUES(
  'v1.22.0_secure_platform_transfer',
  'Owner-only, two-sided 2FA platform copy grants with one-time secrets, encrypted immutable snapshots, conflict preview, draft imports, audit trail, and seven-day rollback.'
)
ON CONFLICT(migration_key) DO NOTHING;

COMMIT;
