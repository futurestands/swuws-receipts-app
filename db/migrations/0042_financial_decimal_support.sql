-- 0042_financial_decimal_support.sql
-- Migrates all financial columns from bigint to numeric to support decimal tariffs and precise balances.

BEGIN;

-- 1. Migrate customer balances
ALTER TABLE "customer" ALTER COLUMN "accountBalance" TYPE numeric(12, 2);

-- 2. Migrate meter reading snapshots
ALTER TABLE "meter_reading"
  ALTER COLUMN "billedAmount" TYPE numeric(12, 2),
  ALTER COLUMN "previousBalanceSnapshot" TYPE numeric(12, 2),
  ALTER COLUMN "totalDueSnapshot" TYPE numeric(12, 2);

-- 3. Migrate billing records
ALTER TABLE "billing_record"
  ALTER COLUMN "billAmount" TYPE numeric(12, 2),
  ALTER COLUMN "arrears" TYPE numeric(12, 2),
  ALTER COLUMN "currentCharges" TYPE numeric(12, 2),
  ALTER COLUMN "totalDue" TYPE numeric(12, 2);

-- 4. Migrate receipts (snapshots and payment amount)
-- Note: amount is check(amount > 0). Altering type preserves constraints in Postgres.
ALTER TABLE "receipt"
  ALTER COLUMN "amount" TYPE numeric(12, 2),
  ALTER COLUMN "outstandingBalance" TYPE numeric(12, 2),
  ALTER COLUMN "previousAccountBalanceSnapshot" TYPE numeric(12, 2),
  ALTER COLUMN "newAccountBalanceSnapshot" TYPE numeric(12, 2);

COMMIT;
