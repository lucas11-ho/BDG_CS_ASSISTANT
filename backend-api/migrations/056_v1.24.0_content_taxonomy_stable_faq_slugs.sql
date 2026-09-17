-- v1.24.0 — Content Taxonomy & Stable FAQ Slugs
-- Guide keeps many-to-many Topics. FAQ returns to exactly one Topic.
-- Tags are a separate platform-managed taxonomy shared by Guide and FAQ.

BEGIN;

ALTER TABLE faqs
  ADD COLUMN IF NOT EXISTS slug VARCHAR(180);
ALTER TABLE faqs
  ADD COLUMN IF NOT EXISTS topic_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;

-- Preserve the v1.23 primary FAQ topic when one exists.
UPDATE faqs f
SET topic_id = (
  SELECT ft.category_id
  FROM faq_topics ft
  JOIN categories c ON c.id=ft.category_id
    AND c.tenant_id=ft.tenant_id
    AND c.platform_id=ft.platform_id
  WHERE ft.faq_id=f.id
    AND ft.tenant_id=f.tenant_id
    AND ft.platform_id=f.platform_id
    AND c.deleted_at IS NULL
  ORDER BY ft.is_primary DESC,ft.sort_order ASC,ft.category_id ASC
  LIMIT 1
)
WHERE f.topic_id IS NULL
  AND EXISTS (SELECT 1 FROM faq_topics ft WHERE ft.faq_id=f.id);

-- If v1.23 had no relationship, resolve the existing localized topic text
-- against the category slug or name without creating or merging categories.
UPDATE faqs f
SET topic_id = (
  SELECT c.id
  FROM categories c
  WHERE c.tenant_id=f.tenant_id
    AND c.platform_id=f.platform_id
    AND c.deleted_at IS NULL
    AND (
      lower(c.slug)=lower(trim(COALESCE(f.topic,'')))
      OR lower(c.name)=lower(trim(COALESCE(f.topic,'')))
    )
  ORDER BY CASE WHEN lower(c.slug)=lower(trim(COALESCE(f.topic,''))) THEN 0 ELSE 1 END,c.id
  LIMIT 1
)
WHERE f.topic_id IS NULL
  AND COALESCE(trim(f.topic),'')<>''
  AND EXISTS (
    SELECT 1 FROM categories c
    WHERE c.tenant_id=f.tenant_id
      AND c.platform_id=f.platform_id
      AND c.deleted_at IS NULL
      AND (lower(c.slug)=lower(trim(f.topic)) OR lower(c.name)=lower(trim(f.topic)))
  );

-- faq_topics remains only as a backwards-compatible one-row mirror.
DELETE FROM faq_topics ft
USING faqs f
WHERE ft.faq_id=f.id
  AND (f.topic_id IS NULL OR ft.category_id<>f.topic_id);

UPDATE faq_topics ft
SET is_primary=TRUE,sort_order=0,updated_at=NOW()
FROM faqs f
WHERE ft.faq_id=f.id
  AND f.topic_id=ft.category_id;

INSERT INTO faq_topics(tenant_id,platform_id,faq_id,category_id,is_primary,sort_order)
SELECT f.tenant_id,f.platform_id,f.id,f.topic_id,TRUE,0
FROM faqs f
WHERE f.topic_id IS NOT NULL
  AND f.tenant_id IS NOT NULL
  AND f.platform_id IS NOT NULL
ON CONFLICT(faq_id,category_id) DO UPDATE
SET is_primary=TRUE,sort_order=0,updated_at=NOW();

-- Enforce exactly one FAQ Topic even for older compatibility writers.
CREATE UNIQUE INDEX IF NOT EXISTS uq_faq_topics_one_topic
  ON faq_topics(faq_id);

-- Generate stable slugs for every old FAQ that does not have one. English-like
-- questions use a readable slug; other scripts safely fall back to faq-{id}.
WITH base AS (
  SELECT id,
         tenant_id,
         platform_id,
         trim(both '-' from regexp_replace(lower(COALESCE(question,'')), '[^a-z0-9]+', '-', 'g')) AS base_slug
  FROM faqs
  WHERE slug IS NULL OR btrim(slug)=''
), ranked AS (
  SELECT b.*,
         COUNT(*) OVER (PARTITION BY tenant_id,platform_id,base_slug) AS duplicate_count
  FROM base b
)
UPDATE faqs f
SET slug = CASE
  WHEN r.base_slug='' THEN 'faq-' || f.id::text
  WHEN r.duplicate_count>1 THEN left(r.base_slug, 160) || '-' || f.id::text
  ELSE left(r.base_slug, 170)
END
FROM ranked r
WHERE f.id=r.id;

-- Every future FAQ insertion path (Admin, Excel import, bulk tools) receives a
-- stable slug. Updating the question never regenerates an existing slug.
CREATE OR REPLACE FUNCTION ensure_faq_stable_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
BEGIN
  IF TG_OP='UPDATE' AND COALESCE(btrim(OLD.slug),'')<>'' AND COALESCE(btrim(NEW.slug),'')='' THEN
    NEW.slug := OLD.slug;
    RETURN NEW;
  END IF;

  IF COALESCE(btrim(NEW.slug),'')='' THEN
    base_slug := trim(both '-' from regexp_replace(lower(COALESCE(NEW.question,'')), '[^a-z0-9]+', '-', 'g'));
    IF base_slug='' THEN
      base_slug := 'faq-' || COALESCE(NEW.id::text, substr(md5(random()::text),1,10));
    END IF;
    candidate := left(base_slug, 170);
    IF EXISTS (
      SELECT 1 FROM faqs f
      WHERE f.tenant_id=NEW.tenant_id
        AND f.platform_id=NEW.platform_id
        AND f.slug=candidate
        AND f.deleted_at IS NULL
        AND (NEW.id IS NULL OR f.id<>NEW.id)
    ) THEN
      candidate := left(base_slug, 155) || '-' || COALESCE(NEW.id::text, substr(md5(random()::text),1,10));
    END IF;
    NEW.slug := candidate;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_faq_stable_slug ON faqs;
CREATE TRIGGER trg_faq_stable_slug
BEFORE INSERT OR UPDATE OF question,slug ON faqs
FOR EACH ROW EXECUTE FUNCTION ensure_faq_stable_slug();

CREATE UNIQUE INDEX IF NOT EXISTS uq_faqs_platform_stable_slug
  ON faqs(tenant_id,platform_id,slug)
  WHERE deleted_at IS NULL AND slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_faqs_platform_topic
  ON faqs(tenant_id,platform_id,topic_id,status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS content_tags (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  platform_id INTEGER NOT NULL REFERENCES saas_platforms(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(160) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#1677ff',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  sort_order INTEGER NOT NULL DEFAULT 100,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_content_tags_platform_slug
  ON content_tags(tenant_id,platform_id,slug)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_content_tags_platform_list
  ON content_tags(tenant_id,platform_id,status,sort_order,id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS guide_tags (
  tenant_id INTEGER NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  platform_id INTEGER NOT NULL REFERENCES saas_platforms(id) ON DELETE CASCADE,
  guide_id INTEGER NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES content_tags(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(guide_id,tag_id)
);

CREATE TABLE IF NOT EXISTS faq_tags (
  tenant_id INTEGER NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  platform_id INTEGER NOT NULL REFERENCES saas_platforms(id) ON DELETE CASCADE,
  faq_id INTEGER NOT NULL REFERENCES faqs(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES content_tags(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(faq_id,tag_id)
);

CREATE INDEX IF NOT EXISTS idx_guide_tags_platform_tag
  ON guide_tags(tenant_id,platform_id,tag_id,guide_id);
CREATE INDEX IF NOT EXISTS idx_faq_tags_platform_tag
  ON faq_tags(tenant_id,platform_id,tag_id,faq_id);

INSERT INTO system_migrations(migration_key, notes)
VALUES(
  'v1.24.0_content_taxonomy_stable_faq_slugs',
  'Stable FAQ slugs, one FAQ topic, Guide-only multiple topics, and platform-managed Guide/FAQ tags'
)
ON CONFLICT(migration_key) DO NOTHING;

COMMIT;
