-- Add schemeId to receipt table
ALTER TABLE "receipt" ADD COLUMN "schemeId" text REFERENCES "water_scheme"("id") ON DELETE RESTRICT;
CREATE INDEX "receipt_scheme_idx" ON "receipt" ("schemeId");

-- Backfill schemeId from customer data if possible
-- This joins receipt with customer and water_scheme to find the correct scheme
UPDATE "receipt"
SET "schemeId" = customer."waterSchemeId"
FROM "customer"
WHERE "receipt"."customerId" = customer.id
AND "receipt"."schemeId" IS NULL;
