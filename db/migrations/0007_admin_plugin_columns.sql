-- 0007_admin_plugin_columns.sql
--
-- Root-cause fix for: bootstrapAdmin() / any auth.api.signUpEmail() call
-- failing with "Failed to create admin" / "Failed to create user".
--
-- lib/auth.ts registers Better Auth's admin plugin (adminPlugin()). That
-- plugin unconditionally extends the schema with fields on BOTH the user
-- and session tables, regardless of what options the plugin is called
-- with. This was verified directly against the installed package, not
-- from documentation memory:
--
--   $ cat node_modules/better-auth/dist/plugins/admin/schema.mjs
--   schema = {
--     user: { fields: { role, banned, banReason, banExpires } },
--     session: { fields: { impersonatedBy } }
--   }
--
-- Better Auth was configured with `database: pool` (a raw node-postgres
-- Pool, not our Drizzle instance — see lib/auth.ts) — its own internal
-- adapter generates SQL against these fields directly on the physical
-- tables. Their absence causes every signUpEmail() call (and, per the
-- plugin's session-creation hook which reads user.banned on every
-- session, potentially other auth flows too) to fail.
--
-- This does not change how this application's own code queries these
-- tables — nothing in app/ reads or writes any of these four columns.

begin;

alter table "user" add column if not exists banned boolean default false;
alter table "user" add column if not exists "banReason" text;
alter table "user" add column if not exists "banExpires" timestamp;

alter table "session" add column if not exists "impersonatedBy" text;

commit;
