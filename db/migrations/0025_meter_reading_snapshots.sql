-- Add financial and metadata snapshots to meter_reading for traceability and reprint stability
ALTER TABLE "meter_reading" ADD COLUMN "previousBalanceSnapshot" bigint NOT NULL DEFAULT 0;
ALTER TABLE "meter_reading" ADD COLUMN "totalDueSnapshot" bigint NOT NULL DEFAULT 0;
ALTER TABLE "meter_reading" ADD COLUMN "customerNameSnapshot" text;
ALTER TABLE "meter_reading" ADD COLUMN "meterRefSnapshot" text;

-- Update existing records with current data where possible (optional but good for consistency)
UPDATE "meter_reading" mr
SET "customerNameSnapshot" = c.name,
    "meterRefSnapshot" = c."meterRef",
    "previousBalanceSnapshot" = 0, -- We can't know for sure past balances
    "totalDueSnapshot" = mr."billedAmount"
FROM "customer" c
WHERE mr."customerId" = c.id;
