-- 0004_rate_limit.sql
--
-- Adds the table backing lib/rate-limit.ts (Certification Finding 6.3 —
-- no rate limiting existed anywhere). Purely additive: no existing table is
-- touched, so this is safe to run against a database that already has
-- 0001-0003 applied and has live data in it.

begin;

create table if not exists "rate_limit" (
  key text primary key,
  "windowStart" timestamp not null default now(),
  count integer not null default 0
);

commit;
