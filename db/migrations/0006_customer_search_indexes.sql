-- 0006_customer_search_indexes.sql
--
-- Stability/performance fix: searchCustomers()/quickSearchCustomers()
-- (app/actions/customers.ts) use ilike(column, '%query%') — a leading
-- wildcard. Plain B-tree indexes (customer_name_idx, from 0005) cannot be
-- used for that pattern at all, so every search does a full table scan.
-- This is invisible with a handful of test customers and becomes a real
-- production slow-query problem as the table grows.
--
-- pg_trgm's GIN indexes DO support leading-wildcard ILIKE and are the
-- standard PostgreSQL answer to this exact problem.
--
-- REQUIRES: the connecting database role must have privilege to create
-- extensions (CREATE EXTENSION), which some managed Postgres providers
-- restrict. If this migration fails on the CREATE EXTENSION line, ask
-- your provider to enable pg_trgm for your database (most managed
-- providers — Neon, Supabase, RDS, Cloud SQL — support it and just need it
-- enabled once), then re-run this file. Nothing else in the application
-- depends on this migration succeeding; search will simply stay slower
-- (correct, just unindexed) until it's applied.

begin;

create extension if not exists pg_trgm;

create index if not exists customer_name_trgm_idx on "customer" using gin (name gin_trgm_ops);
create index if not exists customer_account_trgm_idx on "customer" using gin ("customerAccount" gin_trgm_ops);
create index if not exists customer_phone_trgm_idx on "customer" using gin (phone gin_trgm_ops);

commit;
