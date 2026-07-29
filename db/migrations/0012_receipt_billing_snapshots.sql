-- 0011_receipt_billing_snapshots.sql
-- Adds missing snapshot columns to the receipt table and phone to the user table.

BEGIN;

-- 1. Add snapshot columns to receipt table
-- These capture point-in-time data for the bill being paid, ensuring
-- receipt consistency even if the original billing record or period is
-- later modified or archived.
ALTER TABLE "receipt" ADD COLUMN IF NOT EXISTS "billingPeriodSnapshot" text;
ALTER TABLE "receipt" ADD COLUMN IF NOT EXISTS "amountDueSnapshot" bigint;
ALTER TABLE "receipt" ADD COLUMN IF NOT EXISTS "schemeNameSnapshot" text;

-- 2. Add phone column to user table
-- Captures the contact number for Agents/COs/Admins.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "phone" text;

COMMIT;
