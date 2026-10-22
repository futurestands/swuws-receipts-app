-- Preserve the source values reviewed when an SMS list is created.
-- These are communication snapshots, not updates to customer balances or bills.
ALTER TABLE "crm_sms_record" ADD COLUMN IF NOT EXISTS "recipientName" text;
ALTER TABLE "crm_sms_record" ADD COLUMN IF NOT EXISTS "customerReference" text;
ALTER TABLE "crm_sms_record" ADD COLUMN IF NOT EXISTS "billNumber" text;
ALTER TABLE "crm_sms_record" ADD COLUMN IF NOT EXISTS "billingPeriod" text;
ALTER TABLE "crm_sms_record" ADD COLUMN IF NOT EXISTS "accountBalance" numeric(12, 2);
