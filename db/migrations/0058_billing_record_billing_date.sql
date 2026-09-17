-- Pegasus cutoff: each bill has the day it was taken.
-- Payments before that day stay on the previous bill.
ALTER TABLE "billing_record" ADD COLUMN IF NOT EXISTS "billingDate" timestamp;

-- Existing bills: scheme import day is the best taken date we have.
UPDATE "billing_record" rec
SET "billingDate" = r."uploadedAt"
FROM "billing_run" r
WHERE rec."billingRunId" = r.id
  AND rec."billingDate" IS NULL;

CREATE INDEX IF NOT EXISTS billing_record_billing_date_idx
  ON "billing_record" ("billingDate");
