-- Phase 2: Database Integrity Hardening
-- Enforce financial invariants at the PostgreSQL level.
-- Idempotent: these CHECKs may already exist on databases that applied
-- them outside this file, which previously aborted the runner and blocked
-- later CRM seed migrations.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipt_amount_positive') THEN
    ALTER TABLE "receipt" ADD CONSTRAINT "receipt_amount_positive" CHECK (CAST("amount" AS NUMERIC) > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_record_bill_amount_non_negative') THEN
    ALTER TABLE "billing_record" ADD CONSTRAINT "billing_record_bill_amount_non_negative" CHECK (CAST("billAmount" AS NUMERIC) >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_record_current_charges_non_negative') THEN
    ALTER TABLE "billing_record" ADD CONSTRAINT "billing_record_current_charges_non_negative" CHECK (CAST("currentCharges" AS NUMERIC) >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tariff_unit_price_non_negative') THEN
    ALTER TABLE "tariff_configuration" ADD CONSTRAINT "tariff_unit_price_non_negative" CHECK (CAST("unitPrice" AS NUMERIC) >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tariff_service_fee_non_negative') THEN
    ALTER TABLE "tariff_configuration" ADD CONSTRAINT "tariff_service_fee_non_negative" CHECK (CAST("serviceFee" AS NUMERIC) >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meter_reading_billed_amount_non_negative') THEN
    ALTER TABLE "meter_reading" ADD CONSTRAINT "meter_reading_billed_amount_non_negative" CHECK (CAST("billedAmount" AS NUMERIC) >= 0);
  END IF;
END $$;
