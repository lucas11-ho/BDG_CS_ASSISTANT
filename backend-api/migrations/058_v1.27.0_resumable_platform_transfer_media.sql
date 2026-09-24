-- v1.27.0 Resumable Platform Transfer Media Queue
-- Adds durable, retryable media-copy progress without changing the one-time grant model.

BEGIN;

ALTER TABLE platform_transfer_jobs
  ADD COLUMN IF NOT EXISTS data_imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS media_total_files INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS media_completed_files INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS media_failed_files INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS media_total_bytes BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS media_completed_bytes BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS media_batch_size INTEGER NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS media_last_progress_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS platform_transfer_media_items (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES platform_transfer_jobs(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  target_key TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','copying','completed','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  content_type VARCHAR(255),
  size_bytes BIGINT NOT NULL DEFAULT 0,
  last_error TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id, source_key),
  UNIQUE(job_id, target_key)
);

CREATE INDEX IF NOT EXISTS idx_platform_transfer_media_work
  ON platform_transfer_media_items(job_id, status, attempts, id);

CREATE INDEX IF NOT EXISTS idx_platform_transfer_media_target
  ON platform_transfer_media_items(job_id, target_key);

INSERT INTO system_migrations(migration_key, notes)
VALUES(
  'v1.27.0_resumable_platform_transfer_media',
  'Durable per-file platform-transfer media queue with resumable batches, progress accounting, verification, retry, and large Guide-library support.'
)
ON CONFLICT(migration_key) DO NOTHING;

COMMIT;
