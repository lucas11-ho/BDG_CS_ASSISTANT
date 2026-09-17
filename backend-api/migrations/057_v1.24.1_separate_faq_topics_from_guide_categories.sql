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

-- Protect the separation from older clients that still send topic_id,
-- primary_topic_id or category_id. Runtime compatibility code may attempt to
-- write a category-backed FAQ topic; this trigger keeps topic_id NULL and, on
-- updates, preserves the FAQ's own localized Topic text instead.
CREATE OR REPLACE FUNCTION keep_faq_topic_independent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.topic_id IS NOT NULL THEN
    NEW.topic_id := NULL;
    IF TG_OP = 'UPDATE' THEN
      NEW.topic := COALESCE(NULLIF(BTRIM(OLD.topic), ''), 'General');
    ELSE
      NEW.topic := COALESCE(NULLIF(BTRIM(NEW.topic), ''), 'General');
    END IF;
  ELSE
    NEW.topic := COALESCE(NULLIF(BTRIM(NEW.topic), ''), 'General');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_faq_topic_independent ON faqs;
CREATE TRIGGER trg_faq_topic_independent
BEFORE INSERT OR UPDATE OF topic_id, topic ON faqs
FOR EACH ROW EXECUTE FUNCTION keep_faq_topic_independent();

ALTER TABLE faqs DROP CONSTRAINT IF EXISTS chk_faq_topic_independent;
ALTER TABLE faqs
  ADD CONSTRAINT chk_faq_topic_independent CHECK (topic_id IS NULL);

INSERT INTO system_migrations(migration_key, notes)
VALUES(
  'v1.24.1_separate_faq_topics_from_guide_categories',
  'FAQ localized text topics are independent from Guide categories/topics; legacy FAQ-category links cleared and blocked'
)
ON CONFLICT(migration_key) DO NOTHING;

COMMIT;
