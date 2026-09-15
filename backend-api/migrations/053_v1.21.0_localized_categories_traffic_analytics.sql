-- v1.21.0 — Localized Categories + First-Party Traffic Analytics
-- Additive, tenant/platform scoped, and privacy-preserving. No raw IP is stored.

CREATE TABLE IF NOT EXISTS category_translations (
  id BIGSERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  tenant_id INTEGER,
  platform_id INTEGER,
  locale VARCHAR(32) NOT NULL CHECK (locale = lower(locale)),
  name VARCHAR(120) NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(category_id, locale)
);
CREATE INDEX IF NOT EXISTS idx_category_translations_platform_locale
  ON category_translations(platform_id, locale, category_id);

-- Existing category name/description become the normalized default-locale translation.
INSERT INTO category_translations(category_id, tenant_id, platform_id, locale, name, description)
SELECT c.id, c.tenant_id, c.platform_id,
       lower(replace(COALESCE(NULLIF(p.default_locale, ''), 'en'), '_', '-')),
       c.name, COALESCE(c.description, '')
FROM categories c
LEFT JOIN saas_platforms p ON p.id=c.platform_id
WHERE c.deleted_at IS NULL
ON CONFLICT(category_id, locale) DO NOTHING;

CREATE TABLE IF NOT EXISTS traffic_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  platform_id INTEGER NOT NULL,
  visitor_id VARCHAR(80) NOT NULL,
  session_id VARCHAR(80) NOT NULL,
  event_type VARCHAR(24) NOT NULL DEFAULT 'pageview',
  path VARCHAR(500) NOT NULL DEFAULT '/',
  locale VARCHAR(32) NOT NULL DEFAULT 'en',
  referrer VARCHAR(500) NOT NULL DEFAULT '',
  device_type VARCHAR(24) NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_traffic_events_platform_time
  ON traffic_events(platform_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_events_platform_visitor_time
  ON traffic_events(platform_id, visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_events_platform_path_time
  ON traffic_events(platform_id, path, created_at DESC);

CREATE TABLE IF NOT EXISTS traffic_presence (
  tenant_id INTEGER NOT NULL,
  platform_id INTEGER NOT NULL,
  visitor_id VARCHAR(80) NOT NULL,
  session_id VARCHAR(80) NOT NULL,
  last_path VARCHAR(500) NOT NULL DEFAULT '/',
  locale VARCHAR(32) NOT NULL DEFAULT 'en',
  device_type VARCHAR(24) NOT NULL DEFAULT 'unknown',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(platform_id, visitor_id)
);
CREATE INDEX IF NOT EXISTS idx_traffic_presence_platform_seen
  ON traffic_presence(platform_id, last_seen_at DESC);

INSERT INTO system_migrations(migration_key, notes)
VALUES(
  'v1.21.0_localized_categories_traffic_analytics',
  'Localized category translations plus anonymous first-party visitor/page-view analytics without raw IP storage'
)
ON CONFLICT(migration_key) DO NOTHING;
