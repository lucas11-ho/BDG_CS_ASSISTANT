-- v1.22.1 Stability & Performance
-- Additive hot-path indexes only. Connection pool sizing is intentionally unchanged.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_support_conversations_platform_recent
  ON support_conversations(platform_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_events_platform_locale_time
  ON traffic_events(platform_id, locale, created_at DESC) WHERE event_type='pageview';
CREATE INDEX IF NOT EXISTS idx_traffic_events_platform_device_time
  ON traffic_events(platform_id, device_type, created_at DESC) WHERE event_type='pageview';

INSERT INTO system_migrations(migration_key, notes)
VALUES(
  'v1.22.1_stability_performance',
  'Reduces overlapping background traffic and adds indexes for support recency and traffic analytics groupings without increasing database pool size.'
)
ON CONFLICT(migration_key) DO NOTHING;

COMMIT;
