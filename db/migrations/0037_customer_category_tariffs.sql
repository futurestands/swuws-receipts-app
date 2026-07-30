-- 0037_customer_category_tariffs.sql
-- Adds customer categories to customers and allows multi-category tariffs per area.

BEGIN;

-- 1. Add category to customer table
ALTER TABLE "customer" ADD COLUMN "category" text NOT NULL DEFAULT 'domestic';

-- 2. Add customerCategory to tariff_configuration
ALTER TABLE "tariff_configuration" ADD COLUMN "customerCategory" text NOT NULL DEFAULT 'domestic';

-- 3. Update unique constraint on tariff_configuration
-- First drop the old one
DROP INDEX IF EXISTS "tariff_target_idx";
-- Create the new composite unique index
CREATE UNIQUE INDEX "tariff_target_idx" ON "tariff_configuration" ("targetType", "targetId", "customerCategory");

COMMIT;
