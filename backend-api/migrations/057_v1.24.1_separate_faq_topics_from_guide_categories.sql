-- v1.24.1 — Separate FAQ Topics from Guide Topics/Categories
-- FAQ keeps its existing localized text topic. Guide continues to use
-- categories/guide_topics for its independent multi-topic taxonomy.

BEGIN;

-- v1.24.0 temporarily linked FAQ topics to Guide categories. Preserve the
-- localized faqs.topic text and remove only that accidental relationship.
UPDATE faqs
SET topic_id = NULL,
    topic = COALESCE(NULLIF(BTRIM(topic), ''), 'General'),
    updated_at = NOW()
WHERE topic_id IS NOT NULL
   OR COALESCE(BTRIM(topic), '') = '';

-- The v1.23/v1.24 FAQ join table represented Guide categories, so it must not
-- remain authoritative once FAQ Topic is independent again.
DELETE FROM faq_topics;

DROP INDEX IF EXISTS uq_faq_topics_one_topic;
DROP INDEX IF EXISTS idx_faqs_platform_topic;

CREATE INDEX IF NOT EXISTS idx_faqs_scope_locale_topic_status
  ON faqs(tenant_id, platform_id, locale, topic, status)
  WHERE deleted_at IS NULL;

INSERT INTO system_migrations(migration_key, notes)
VALUES(
  'v1.24.1_separate_faq_topics_from_guide_categories',
  'FAQ localized text topics are independent from Guide categories/topics; legacy FAQ-category links cleared'
)
ON CONFLICT(migration_key) DO NOTHING;

COMMIT;
