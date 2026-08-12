-- 0044_arrears_recovery_split.sql
-- Separates recovery tracking into two distinct fields: Arrears and Current Bill.

BEGIN;

-- 1. Add arrearsRecovery to billing_record
ALTER TABLE "billing_record" ADD COLUMN "arrearsRecovery" numeric(12, 2) NOT NULL DEFAULT '0';

-- 2. Add arrearsRecovered to billing_run
ALTER TABLE "billing_run" ADD COLUMN "arrearsRecovered" numeric(12, 2) NOT NULL DEFAULT '0';

COMMIT;
