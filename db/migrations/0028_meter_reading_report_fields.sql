-- Add account and phone snapshots to meter_reading for standardized reporting
ALTER TABLE "meter_reading" ADD COLUMN "customerAccountSnapshot" text;
ALTER TABLE "meter_reading" ADD COLUMN "phoneSnapshot" text;

-- Backfill from customer table
UPDATE "meter_reading" mr
SET "customerAccountSnapshot" = c."customerAccount",
    "phoneSnapshot" = c."phone"
FROM "customer" c
WHERE mr."customerId" = c.id;
