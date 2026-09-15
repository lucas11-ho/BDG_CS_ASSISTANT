# v1.21.0 — Localized Categories & Traffic Analytics

## Localized Categories
- One stable category keeps its slug, icon, and sort order across languages.
- Category name and description are now stored per enabled platform locale.
- Admin Categories has a new Locale column with translation coverage chips.
- The category editor switches between enabled platform languages and falls back to the platform default locale when a translation is missing.
- Public Guide category responses use the requested Guide language automatically.

## First-Party Traffic Analytics
- Adds anonymous page-view and active-presence tracking to the public Guide Center.
- Admin Dashboard shows Active now, Visitors today, Page views today, and 7-day visitors.
- New Traffic Analytics page provides a live 30-minute chart, top pages, language breakdown, device breakdown, and 24-hour / 7-day / 30-day ranges.
- Active now means an anonymous visitor heartbeat was seen within the last two minutes.
- Public tracking is best-effort and never blocks the Guide Center.
- Analytics tables do not store raw visitor IP addresses.

## Storage
- Adds `category_translations`, `traffic_events`, and `traffic_presence` through migration 053.
- All new data is tenant/platform scoped.
