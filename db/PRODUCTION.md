# Production Runbook

This document covers what the certification report flagged as missing:
backup strategy, restore procedure, disaster recovery, the migration
process, and a pre-launch deployment checklist. It's operational
documentation, not application code — nothing here requires a code change
to act on.

## 1. Backup strategy

This application has no built-in backup mechanism (that's normally
infrastructure/provider responsibility, not application code) — set one of
the following up before go-live:

- **Managed Postgres provider (recommended):** use the provider's native
  point-in-time recovery (PITR) — e.g. Neon, Supabase, RDS, and Cloud SQL
  all offer this. Enable it and confirm the retention window (7–30 days is
  typical) meets your requirements. This is the least operational work and
  the fastest to restore from.
- **Self-managed Postgres:** schedule `pg_dump` (logical backup) at minimum
  daily, plus continuous WAL archiving if you need point-in-time recovery
  rather than just daily snapshots:
  ```bash
  pg_dump "$DATABASE_URL" -Fc -f "backup-$(date +%Y%m%d-%H%M).dump"
  ```
  Store dumps somewhere other than the database host itself (object storage,
  a separate backup server) — a backup on the same disk as the database
  doesn't protect against host loss.
- **Retention:** for a financial-records system, keep daily backups for at
  least 90 days and at least one monthly backup for 7 years, consistent
  with typical public-sector financial record retention expectations —
  confirm the actual figure against SWUWS's own records-retention policy,
  this is not a legal determination.

Regardless of which option you choose: **test the restore, not just the
backup.** A backup that has never been restored is unverified.

## 2. Restore procedure

```bash
# Logical (pg_dump/pg_restore) backups:
pg_restore --clean --if-exists -d "$DATABASE_URL" backup-20260706-0200.dump

# Managed-provider PITR:
# follow the provider's console/CLI flow to restore to a point in time —
# this typically creates a new database instance rather than restoring
# in-place; update DATABASE_URL to point at it once verified.
```

After any restore:

1. Run the two verification blocks from `db/migrations/README.md` to
   confirm the immutability triggers on `receipt`, `receipt_attachment`,
   and `audit_log` are present and firing — a restore from an older backup
   could predate a migration.
2. Check `schema_migrations` against `db/migrations/` and run
   `npm run db:migrate` to apply anything missing.
3. Spot-check a handful of receipt numbers for gaps/duplicates
   (`select receiptNumber, seq from receipt order by seq`) — gaps are
   expected and fine (see `db/migrations/README.md`); duplicates are not
   and indicate a corrupted restore.

## 3. Disaster recovery

- **RPO/RTO targets:** define these with SWUWS stakeholders before
  go-live — this repository cannot set organizational policy. As a
  starting point for a payment-collection system: RPO of at most 1 hour
  (i.e. PITR or WAL archiving, not just daily dumps), RTO of at most a few
  hours (time to provision a new app instance + restore the database).
- **Application is stateless** apart from the database and Blob storage —
  redeploying the Next.js app itself (Vercel or otherwise) requires no data
  migration, only environment variables (`.env.example`) and a fresh
  `npm install && npm run build`.
- **Blob storage (attachments/logo):** back this up separately from
  Postgres — a database restore alone will not bring back uploaded files.
  If using Vercel Blob, there is currently no built-in bulk-export tooling;
  periodically enumerate and mirror objects to a separate bucket if
  DR requirements demand it.
- **Runbook drill:** actually run the restore procedure above against a
  non-production copy at least once before go-live, and periodically after
  (e.g. quarterly), not just when a real incident happens.

## 4. Migration process

Covered in detail in `db/migrations/README.md`. Summary for this runbook:

1. Write a new numbered `.sql` file in `db/migrations/`, idempotently
   (`if not exists` / `create or replace` / `on conflict do nothing`)
   wherever possible.
2. Run `npm run db:migrate` — it records what's applied in
   `schema_migrations` and skips anything already run.
3. If the migration touches `receipt`, `receipt_attachment`, or
   `audit_log`, add a follow-up migration that re-asserts the relevant
   `create trigger` statements from `0002`/`0003` rather than assuming they
   survived (some `ALTER TABLE` forms drop existing triggers).
4. Run the verification queries in `db/migrations/README.md` after
   deploying, every time.

## 5. Production deployment checklist

- [ ] Every variable in `.env.example` is set for real, especially
      `BETTER_AUTH_SECRET` (generate with `openssl rand -base64 32`) and
      `BLOB_READ_WRITE_TOKEN`.
- [ ] `BETTER_AUTH_TRUSTED_ORIGINS` is set to your real production domain(s)
      if not deploying on Vercel (see `lib/auth.ts` — it fails startup
      loudly if this is missing in production, by design).
- [ ] **If using Supabase specifically:** use the Session pooler or direct
      connection string for `DATABASE_URL`, not the Transaction pooler
      (port 6543) — see the comment in `.env.example` for why. Also note
      this app's `pool` (`lib/db/index.ts`) is sized for a small number of
      long-lived server instances (`max: 10` connections each); if
      deploying to a platform that spins up many separate serverless
      instances, each gets its own pool, and Supabase's free/lower tiers
      cap total concurrent connections — reduce `max` accordingly or use
      Supabase's pooler if you hit connection-limit errors under load.
- [ ] `npm run db:migrate` has been run against the production database and
      all six migrations show as applied in `schema_migrations`. `0006`
      requires the `pg_trgm` extension — most managed providers including
      Supabase support enabling it (Database → Extensions in the Supabase
      dashboard, or it may already be enabled); if that one migration
      fails, customer search still works correctly, just without an index
      until it's applied — nothing else depends on it.
- [ ] The four verification statements in `db/migrations/README.md` have
      been run against the production database and all four correctly
      raise an exception.
- [ ] The production database connection role is confirmed to NOT be a
      superuser or table owner (see the caveat in `db/migrations/0002` and
      `0003`) — if it is, provision a lower-privileged role so the REVOKE
      step is not a no-op.
- [ ] Backups are configured per Section 1 above and a test restore has
      been performed per Section 2.
- [ ] `npm run build` completes with no TypeScript errors (this is now
      enforced — `next.config.mjs` no longer sets `ignoreBuildErrors`).
- [ ] At least one admin account exists (via the first-run setup flow at
      `/login`) and its credentials are stored somewhere durable
      (password manager, not chat/email).
- [ ] Security headers are present on a real deployed response — check with
      `curl -I https://your-domain/login` for
      `Content-Security-Policy`, `X-Frame-Options`,
      `Strict-Transport-Security`, etc.
- [ ] Rate limiting has been smoke-tested: repeated failed sign-ins return
      HTTP 429 after the configured threshold (see `lib/rate-limit.ts` and
      `app/api/auth/[...all]/route.ts`).
