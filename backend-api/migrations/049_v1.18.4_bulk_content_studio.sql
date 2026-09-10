-- v1.18.4 Guide & FAQ Bulk Content Studio
-- Records completed spreadsheet imports without changing Guide/FAQ ownership rules.

BEGIN;

CREATE TABLE IF NOT EXISTS bulk_content_import_batches (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  platform_id INTEGER NOT NULL REFERENCES saas_platforms(id) ON DELETE CASCADE,
  content_kind VARCHAR(20) NOT NULL CHECK (content_kind IN ('faq','guide')),
  filename VARCHAR(255) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'complete',
  total_rows INTEGER NOT NULL DEFAULT 0,
  created_rows INTEGER NOT NULL DEFAULT 0,
  updated_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  warning_rows INTEGER NOT NULL DEFAULT 0,
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_content_import_platform_created
  ON bulk_content_import_batches(tenant_id, platform_id, content_kind, created_at DESC);

INSERT INTO system_migrations(migration_key, notes)
VALUES (
  'v1.18.4_bulk_content_studio',
  'FAQ and Guide Excel template/export/import history foundation with safe preview-first bulk editing.'
)
ON CONFLICT(migration_key) DO NOTHING;

COMMIT;
