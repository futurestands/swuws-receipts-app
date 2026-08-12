-- 0045_retroactive_recovery_fix.sql
-- Corrects the misallocated recovery data for August 2026.
-- Ensures money is assigned to Arrears first, then Current Bill.

BEGIN;

-- 1. Calculate and update Arrears Recovery
-- Arrears Recovery = LEAST(Arrears, (Arrears + Bill) - TotalDue)
UPDATE "billing_record"
SET "arrearsRecovery" = CASE
    WHEN ("arrears"::numeric + "billAmount"::numeric) > "totalDue"::numeric
    THEN LEAST("arrears"::numeric, ("arrears"::numeric + "billAmount"::numeric) - "totalDue"::numeric)
    ELSE 0
END
WHERE "arrears"::numeric > 0;

-- 2. Calculate and update Current Bill Recovery
-- Current Recovery = GREATEST(0, (Total Money Recovered - ArrearsRecovery))
-- Cap it at the Bill Amount.
UPDATE "billing_record"
SET "recoveryAmount" = LEAST("billAmount"::numeric, GREATEST(0, (("arrears"::numeric + "billAmount"::numeric) - "totalDue"::numeric) - "arrearsRecovery"::numeric));

COMMIT;
