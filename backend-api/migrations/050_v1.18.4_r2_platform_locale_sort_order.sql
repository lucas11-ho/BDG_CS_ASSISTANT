-- v1.18.4-r2: align the platform locale registry with the bulk FAQ/Guide locale-policy query.
-- Existing locale rows keep their prior behavior because every row defaults to sort order 100.

ALTER TABLE platform_locales
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 100;

CREATE INDEX IF NOT EXISTS idx_platform_locales_enabled_order
  ON platform_locales (tenant_id, platform_id, is_enabled, is_default DESC, sort_order ASC, id ASC);
