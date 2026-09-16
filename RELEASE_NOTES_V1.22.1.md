# v1.22.1 — Stability & Performance

## Background traffic and freeze prevention
- Customer Service uses single-flight, visibility-aware fallback refreshes instead of overlapping nine-request 10-second polling.
- Heavy Customer Service datasets load only when their tab is opened.
- Traffic Analytics refreshes every 30 seconds while visible and backs off after failures.
- Dashboard traffic refreshes every 60 seconds while visible.
- Analytics summaries are coalesced and cached briefly to reduce repeated PostgreSQL work.

## Guide runtime performance
- Public category icons use a bounded Lucide icon map rather than the full icon namespace.
- Guide runtime queries use practical cache lifetimes and avoid forced refetching.
- Language changes invalidate Guide data without a full-page reload.
- Platform Guide experience requests are coalesced through a short-lived runtime cache.

## Backend and database
- Analytics summary computation is reduced from nine queries to five.
- Slow localized-content and analytics queries emit duration tracing.
- Migration 055 adds support-recency and analytics grouping indexes.
- PostgreSQL pool sizing is intentionally unchanged pending production evidence.

## Verification
- Full backend regression suite passes, including the v1.22.1 stability guard.
- Guide, Chat, Admin, and Staff production builds pass in CI.
