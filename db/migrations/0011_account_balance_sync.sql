-- 0011_account_balance_sync.sql
--
-- Implements the Account Balance Synchronization Engine database changes.
-- Adds temporary account balance to customers and immutable snapshots to receipts.

BEGIN;

-- 1. Add accountBalance to customer table
ALTER TABLE "customer" ADD COLUMN "accountBalance" bigint NOT NULL DEFAULT 0;

-- 2. Add balance snapshots to receipt table
ALTER TABLE "receipt" ADD COLUMN "previousAccountBalanceSnapshot" bigint NOT NULL DEFAULT 0;
ALTER TABLE "receipt" ADD COLUMN "newAccountBalanceSnapshot" bigint NOT NULL DEFAULT 0;

-- Note: No changes needed to 0002_immutability.sql triggers as they block
-- ALL updates/deletes on the receipt table regardless of columns.

COMMIT;
