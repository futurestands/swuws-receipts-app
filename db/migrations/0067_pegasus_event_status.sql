-- 0067_pegasus_event_status.sql
-- Add pegasusEventId traceability to reconciliation_exception and unique index for idempotent exception creation

ALTER TABLE "reconciliation_exception" ADD COLUMN IF NOT EXISTS "pegasusEventId" text REFERENCES "pegasus_event"("id") ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "recon_exception_pegasus_event_type_idx"
ON "reconciliation_exception" ("pegasusEventId", "exceptionType")
WHERE "pegasusEventId" IS NOT NULL;
