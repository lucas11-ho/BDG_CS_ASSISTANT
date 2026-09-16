-- v1.23.0 — Multiple Topics + Security & Permissions Control Center
-- Additive only: legacy primary guide category and FAQ topic fields remain
-- authoritative fallbacks while the join tables provide many-to-many topics.

ALTER TABLE saas_platform_memberships
  ADD COLUMN IF NOT EXISTS permissions_json TEXT;
ALTER TABLE saas_platform_memberships
  ADD COLUMN IF NOT EXISTS require_2fa BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS guide_topics (
  tenant_id INTEGER NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  platform_id INTEGER NOT NULL REFERENCES saas_platforms(id) ON DELETE CASCADE,
  guide_id INTEGER NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guide_id, category_id)
);

CREATE TABLE IF NOT EXISTS faq_topics (
  tenant_id INTEGER NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  platform_id INTEGER NOT NULL REFERENCES saas_platforms(id) ON DELETE CASCADE,
  faq_id INTEGER NOT NULL REFERENCES faqs(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (faq_id, category_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_guide_topics_primary
  ON guide_topics(guide_id) WHERE is_primary=TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_faq_topics_primary
  ON faq_topics(faq_id) WHERE is_primary=TRUE;
CREATE INDEX IF NOT EXISTS idx_guide_topics_platform_category
  ON guide_topics(tenant_id, platform_id, category_id, guide_id);
CREATE INDEX IF NOT EXISTS idx_faq_topics_platform_category
  ON faq_topics(tenant_id, platform_id, category_id, faq_id);
CREATE INDEX IF NOT EXISTS idx_platform_memberships_permissions
  ON saas_platform_memberships(platform_id, admin_user_id)
  INCLUDE (role, require_2fa);

-- Existing Guide category assignments become primary topic assignments.
INSERT INTO guide_topics(tenant_id,platform_id,guide_id,category_id,is_primary,sort_order)
SELECT g.tenant_id,g.platform_id,g.id,g.category_id,TRUE,0
FROM guides g
JOIN categories c ON c.id=g.category_id
WHERE g.category_id IS NOT NULL
  AND g.tenant_id IS NOT NULL
  AND g.platform_id IS NOT NULL
  AND c.tenant_id=g.tenant_id
  AND c.platform_id=g.platform_id
ON CONFLICT(guide_id,category_id) DO UPDATE
SET is_primary=TRUE,sort_order=0,updated_at=NOW();

-- Best-effort FAQ backfill when the legacy localized topic matches a scoped
-- category slug or category name. Unmatched FAQ topic text is intentionally
-- retained as the compatibility fallback.
INSERT INTO faq_topics(tenant_id,platform_id,faq_id,category_id,is_primary,sort_order)
SELECT f.tenant_id,f.platform_id,f.id,c.id,TRUE,0
FROM faqs f
JOIN LATERAL (
  SELECT c.id
  FROM categories c
  WHERE c.tenant_id=f.tenant_id
    AND c.platform_id=f.platform_id
    AND (
      lower(c.slug)=lower(trim(COALESCE(f.topic,'')))
      OR lower(c.name)=lower(trim(COALESCE(f.topic,'')))
    )
  ORDER BY CASE WHEN lower(c.slug)=lower(trim(COALESCE(f.topic,''))) THEN 0 ELSE 1 END,c.id
  LIMIT 1
) c ON TRUE
WHERE f.tenant_id IS NOT NULL
  AND f.platform_id IS NOT NULL
  AND COALESCE(trim(f.topic),'')<>''
ON CONFLICT(faq_id,category_id) DO UPDATE
SET is_primary=TRUE,sort_order=0,updated_at=NOW();

INSERT INTO system_migrations(migration_key, notes)
VALUES(
  'v1.23.0_topics_security_control',
  'Many-to-many Guide/FAQ topics plus platform-membership permission and 2FA policy controls'
)
ON CONFLICT(migration_key) DO NOTHING;
