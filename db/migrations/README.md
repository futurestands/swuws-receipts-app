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

