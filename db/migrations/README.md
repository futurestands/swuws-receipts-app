# Migrations

Run with the tracked migration runner, which records what's already been
applied and skips it on subsequent runs:

```bash
npm run db:migrate
# or directly:
DATABASE_URL="postgres://..." bash db/migrate.sh
```

This creates a `schema_migrations` ledger table on first run and applies
`db/migrations/*.sql` in filename order, skipping any file whose name is
already recorded. See `db/migrate.sh` for the (short, dependency-free)
implementation — it does not modify any of the migration files below.

If you applied `0001`/`0002` manually before this runner existed, that's
fine: rerunning them now is safe. Every file in this directory is written
idempotently (`create table if not exists`, `create or replace function`,
`drop trigger if exists` before `create trigger`, `on conflict do nothing`
for seed data), specifically so the tracked runner can safely "catch up" a
database that was migrated by hand in an earlier session, without
duplicating objects or losing data.

## Migration order

1. `0001_init.sql` — all tables, `receipt_seq`, indexes, seed payment methods.
2. `0002_immutability.sql` — receipt/receipt_attachment UPDATE/DELETE triggers.
3. `0003_audit_log_immutability.sql` — the same trigger pattern applied to
   `audit_log` (Certification Finding 8.1).
4. `0004_rate_limit.sql` — adds the `rate_limit` table used by
   `lib/rate-limit.ts` (Certification Finding 6.3).
5. `0005_customer_and_scheme_management.sql` — customer + water_scheme
   tables, agent-branch assignment, receipt.customerId link.
6. `0006_customer_search_indexes.sql` — trigram indexes so customer search
   actually uses an index instead of a full table scan (requires the
   pg_trgm extension; see the comment in that file if it fails to apply).
7. `0007_admin_plugin_columns.sql` — adds banned/banReason/banExpires
   (user) and impersonatedBy (session), required by Better Auth's admin
   plugin (lib/auth.ts). Without this, every auth.api.signUpEmail() call —
   including bootstrapAdmin() — fails. Verified directly against the
   installed package source; see the comment in that migration file.

## Why not `drizzle-kit push` / `drizzle-kit generate`?

`drizzle.config.ts` is included so `drizzle-kit generate` can be used later
for *ordinary* schema changes (new columns, new tables). But:

- `drizzle-kit push`/`migrate` has no concept of "add a trigger that rejects
  UPDATE/DELETE" or "REVOKE privileges" — those aren't expressible in the
  Drizzle schema DSL, so they must stay as hand-written SQL regardless of
  what generates the rest of the schema.
- **0002/0003 must be re-applied after any migration that touches
  `receipt`, `receipt_attachment`, or `audit_log`**, since some Postgres
  operations (e.g. certain `ALTER TABLE` forms) can be written in a way
  that drops existing triggers. Treat them as the last step of every
  deploy that changes those tables, not a one-time setup step. (The
  tracked runner won't re-apply them automatically once they're recorded —
  if you add a migration that touches these tables, add a new
  `000N_reapply_triggers.sql` that re-runs the relevant `create trigger`
  statements, rather than editing 0002/0003 in place.)
- Before running 0002/0003 in a real environment, replace `app_user` with
  your actual application database role (the role your `DATABASE_URL`
  connects as). On managed providers where the app only has an
  owner-level role, the `REVOKE` step is a no-op (owners bypass grants) —
  provision a separate, lower-privileged role for the app if you need that
  layer too. The trigger layer applies regardless of role and is the
  primary control.

## Verifying immutability after running 0002/0003

```sql
update "receipt" set "customerName" = 'test' where id = (select id from "receipt" limit 1);
-- should raise: "Receipts are immutable: UPDATE is not permitted on ..."

delete from "receipt" where id = (select id from "receipt" limit 1);
-- should raise: "Receipts are immutable: DELETE is not permitted on ..."

update "audit_log" set action = 'test' where id = (select id from "audit_log" limit 1);
-- should raise: "Audit log entries are immutable: UPDATE is not permitted on ..."

delete from "audit_log" where id = (select id from "audit_log" limit 1);
-- should raise: "Audit log entries are immutable: DELETE is not permitted on ..."
```

If any of these statements succeed, the corresponding migration was not
applied correctly — do not consider the system production-ready until all
four fail as shown above.

After `0054_receipt_recon_status_allowlist.sql`, a `reconciliationStatus`-only
update (matched / void) must succeed. Changing any other receipt column must
still raise.

## Phase 1 production migrations (0069–0070)

These migration files are implemented and tested locally; they have **not** been
applied to a production/business database. Deployment requires separate approval.

- `0069_production_integrity.sql` extends existing production/source tables with
  calendar dates, workflow/version/idempotency and verification fields, confirmation
  metadata, constraints, indexes and history-protection triggers. Existing rows stay
  at workflow version 0 and are not rewritten or automatically verified.
- `0070_production_permissions.sql` creates four permission definitions only. It
  assigns no role grants. Use existing IAM administration after reviewing the actual
  operator/verifier/source-manager role and scope matrix.

Before deployment, inspect a safely obtained, authorised disposable schema/data copy
for invalid numerics/states, source/scheme mismatches, missing ancestry, duplicate
active source/day and request keys, and foreign-key dependencies. The migration
validates its new constraints and fails transactionally rather than fixing historic
rows silently. Reconcile any failures explicitly before deployment. The previously
observed ledger-only `0011_receipt_billing_snapshots.sql` entry remains an operational
preflight item; no development connection to the business database was made to
investigate it.

Do not use `db/migrate.js` during development tests: it intentionally loads `.env`.
Production integration tests instead require `PRODUCTION_TEST_DATABASE_URL` with
loopback host, a database name ending `_production_test`, no query overrides, and
an identity different from `DATABASE_URL`. Set `SWUWS_PRODUCTION_INTEGRATION=1`, then
run `npx vitest run lib/production/integrity.integration.test.ts --no-cache`.
Missing/unsafe targets fail; tests never fall back to `.env`. The suite creates
and cleans a unique namespace containing synthetic fixtures inside that disposable
database. CI provisions PostgreSQL 17 and runs this suite separately from unit tests.

For rollback, stop application rollout and retain new fields, audit history and
measurements. Do not drop the added data or restore an older production writer that
ignores verification/version controls. Verify receipt, attachment, audit and Pegasus
protections on the actual deployment schema before enabling the release.

