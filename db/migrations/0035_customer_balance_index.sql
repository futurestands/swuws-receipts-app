-- 0035_customer_balance_index.sql
-- Optimizes Top Debtor reporting by indexing the account balance column.

begin;

create index if not exists "customer_balance_idx" on "customer" ("accountBalance");

commit;
