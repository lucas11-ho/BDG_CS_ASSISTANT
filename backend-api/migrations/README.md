# Migration runner

`npm run migrate` calls `runMigrations()` from `src/core.js`.

The runner:

1. validates production configuration;
2. connects with Render's direct `MIGRATION_DATABASE_URL`;
3. takes PostgreSQL advisory lock `701070`;
4. completes the existing idempotent schema/bootstrap repair for older installs;
5. discovers every `NNN_*.sql` file in this directory and sorts it numerically;
6. calculates a SHA-256 checksum and compares it with
   `schema_migration_files`;
7. applies each new file in its own transaction and records the checksum;
8. refuses a checksum mismatch because released migration files are immutable;
9. releases the lock and closes the migration connection.

Migration `033_v1.15.1_stabilization_security_repair.sql` completes the quality
center indexes and records the v1.15.1 stabilization marker. Migration `030`
owns the AI quality tables.

Migration `034_v1.15.2_ai_response_reliability_repair.sql` upgrades the locale
router default, removes the known legacy network-blaming fallback, and adds
durable AI response-path diagnostics. It is protected by the immutable checksum
registry.

The migration command runs during Render pre-deploy. Customer requests never
run the file migration sequence.

Migration `035_v1.15.3_prompt_first_ai_repair.sql` switches the default live
chat workflow to one prompt-first provider call, permits general answers under
the configured Prompt Manager rules, and upgrades legacy DeepSeek model names
to `deepseek-v4-flash`.

Migration `036_v1.15.4_prompt_runtime_versioning_repair.sql` adds immutable
compiled Prompt Manager runtime versions, an atomic active-runtime pointer,
prompt-aware session memory fields, and exact prompt version/hash diagnostics.
Published migration `036` is immutable and must never be edited after deployment.

Migration `037_v1.15.5_simplified_ai_production_runtime.sql` retires the
legacy AI Q&A, Knowledge Import, configurable Source Router, AI Response
Quality, Locale Studio, and advanced two-stage decision paths from live
production. It fixes the runtime to the compiled Assistant Setup prompt plus
approved `prompt_image` Menu & Images records, archives existing Q&A rows, and
keeps historical tables inert for rollback/audit. Published migration `037` is
immutable. The next database change must use migration `038`.

- `045_v1.17.2_luke_shared_hosting_platform_route.sql` — Luke Shared Hosting mode and immutable route resolution.

Migration `046_v1.17.3_support_workspace_ux_admin_access_tenant_isolation.sql`
adds the customer-service workspace UX identity fields and tenant-isolated Admin
access foundation. Published migration `046` is immutable.

Migration `047_v1.17.4_cs_identity_domain_promotion_menu_upgrade.sql` adds the
separate Staff profile picture, Staff self-profile/public-identity policies,
managed customer Chat Menu configuration, and rich promotional slideshow
content. Published migration `047` is immutable. The next database change must
use migration `048`.

Migration `048_v1.18.0_luke_shop_commerce_connector_v2.sql` adds the
platform-scoped Luke Shop Commerce Connector configuration and redacted audit
log required for read-only Shop facts in Luke AI. Long-lived Shop credentials
remain encrypted in Luke CS, while AI tool execution uses signed customer
context and short-lived Shop service tokens. Published migration `048` is
immutable. The next database change must use migration `049`.


Migration `058_v1.27.0_resumable_platform_transfer_media.sql` adds a durable
per-file media queue for Platform Transfer. Large Guide libraries import their
database records first, then copy owned R2 media in verified resumable batches.
Each file has independent retry state, completed work survives browser refreshes,
and completed or media-failed imports remain eligible for the existing rollback
window. Published migration `058` is immutable after deployment.
