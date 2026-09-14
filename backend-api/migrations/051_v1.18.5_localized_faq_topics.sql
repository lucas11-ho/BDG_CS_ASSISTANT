-- v1.18.5: locale-specific FAQ topic labels.
-- Each FAQ row already belongs to one locale, so its topic label is stored in the same locale.
-- Existing content remains grouped under General until an admin or Excel import changes it.

ALTER TABLE faqs
  ADD COLUMN IF NOT EXISTS topic VARCHAR(160);

UPDATE faqs
SET topic = 'General'
WHERE topic IS NULL OR BTRIM(topic) = '';

ALTER TABLE faqs
  ALTER COLUMN topic SET DEFAULT 'General';

ALTER TABLE faqs
  ALTER COLUMN topic SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_faqs_scope_locale_topic_status
  ON faqs (tenant_id, platform_id, locale, topic, status, priority, id);
