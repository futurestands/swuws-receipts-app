-- Phase 2: Database Integrity Hardening
-- Enforce financial invariants at the PostgreSQL level.

-- 1. Receipt Constraints: Money collected must always be positive.
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_amount_positive" CHECK (CAST("amount" AS NUMERIC) > 0);

-- 2. Billing Record Constraints: Monthly bills and current charges cannot be negative.
ALTER TABLE "billing_record" ADD CONSTRAINT "billing_record_bill_amount_non_negative" CHECK (CAST("billAmount" AS NUMERIC) >= 0);
ALTER TABLE "billing_record" ADD CONSTRAINT "billing_record_current_charges_non_negative" CHECK (CAST("currentCharges" AS NUMERIC) >= 0);

-- 3. Tariff Constraints: Unit prices and service fees cannot be negative.
ALTER TABLE "tariff_configuration" ADD CONSTRAINT "tariff_unit_price_non_negative" CHECK (CAST("unitPrice" AS NUMERIC) >= 0);
ALTER TABLE "tariff_configuration" ADD CONSTRAINT "tariff_service_fee_non_negative" CHECK (CAST("serviceFee" AS NUMERIC) >= 0);

-- 4. Meter Reading Constraints: Field readings must result in non-negative bills.
ALTER TABLE "meter_reading" ADD CONSTRAINT "meter_reading_billed_amount_non_negative" CHECK (CAST("billedAmount" AS NUMERIC) >= 0);
