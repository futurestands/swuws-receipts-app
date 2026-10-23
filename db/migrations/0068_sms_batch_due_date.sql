-- Apply before deploying code that reads the new nullable batch field.
-- Existing batches retain their saved message text and have no entered deadline.
ALTER TABLE "crm_sms_batch" ADD COLUMN IF NOT EXISTS "dueDate" date;
