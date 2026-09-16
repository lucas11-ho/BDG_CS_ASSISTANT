# v1.22.0 — Secure Platform Transfer Center

## Professional platform copy workflow
- A source platform owner selects the data groups to copy and confirms the export with a fresh authenticator code.
- The generated `LTX1` transfer key is shown once, expires after 30 minutes, and can be claimed only once.
- A destination platform owner pastes the key, reviews create/skip/replace counts, types the destination platform name, and confirms the import with a fresh authenticator code.
- Guides, FAQ entries, and AI knowledge arrive as drafts for destination review. Existing natural keys are skipped; approved singleton settings are replaced only after preview.

## Included data
- Platform locales and customer-language order
- Categories, Guides, Guide translations, and platform-owned Guide media
- Localized FAQ content and topics
- Platform logos, icons, text, colors, Guide theme, and Chat theme
- Assistant prompt sections and safe reliability/source-routing policy
- Site content, navigation, home sections, popular-help cards, and Chat quick replies
- AI knowledge and Menu & Images content

## Security and recovery
- Platform and tenant owners receive dedicated generate, import, and rollback permissions; platform and tenant administrators do not.
- Transfer manifests are immutable, size-limited, AES-GCM encrypted, checksum verified, and never stored with a readable secret.
- Failed-key attempts are counted and temporarily locked. Source and destination platform identity are validated for every operation.
- Platform-owned R2 media is copied into destination-owned keys with file-count and total-size limits.
- Imported rich HTML is sanitized, external navigation targets require review, and stable credentials or operational data are excluded.
- Completed imports have a seven-day rollback window. Snapshot ciphertext is purged after completion, failure, revocation, or expiry.

## Never transferred
- Administrators, passwords, 2FA secrets, sessions, customers, conversations, staff, audit logs, analytics, domains, DNS/SSL state, platform route keys, API/provider secrets, connector secrets, or webhooks.
