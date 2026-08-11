-- 0043_billing_recovery_tracking.sql
-- Adds columns to track debt recovery and credit consumption during billing imports.

BEGIN;

-- 1. Add recoveryAmount to billing_record to track per-customer collection
ALTER TABLE "billing_record" ADD COLUMN "recoveryAmount" numeric(12, 2) NOT NULL DEFAULT '0';

-- 2. Add totalRecovered to billing_run for quick dashboard aggregation
ALTER TABLE "billing_run" ADD COLUMN "totalRecovered" numeric(12, 2) NOT NULL DEFAULT '0';

-- 3. Retroactive Calculation for existing records:
-- We assume recovery is (Bill - TotalDue) for bills covered by upfront credit.
UPDATE "billing_record"
SET "recoveryAmount" = CASE
    WHEN "billAmount" > "totalDue" THEN "billAmount" - "totalDue"
    ELSE 0
END;

COMMIT;
