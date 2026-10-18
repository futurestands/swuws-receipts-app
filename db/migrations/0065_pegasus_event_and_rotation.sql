-- 0065_pegasus_event_and_rotation.sql
-- Create append-only pegasus_event inbox table and add secret rotation timestamp to ebs_gateway_config

-- 1. Add secret rotation timestamp to ebs_gateway_config
ALTER TABLE "ebs_gateway_config" ADD COLUMN IF NOT EXISTS "webhookSecretRotatedAt" timestamp;

-- 2. Create pegasus_event inbox table
CREATE TABLE IF NOT EXISTS "pegasus_event" (
    "id" text PRIMARY KEY,
    "providerEventId" text NOT NULL UNIQUE,
    "receivedAt" timestamp NOT NULL DEFAULT NOW(),
    "signatureVerified" boolean NOT NULL DEFAULT false,
    "status" text NOT NULL DEFAULT 'received', -- 'received' | 'processed' | 'ignored' | 'failed' | 'needs_review'
    "accountNumber" text,
    "amount" bigint CHECK ("amount" > 0),
    "paidAt" timestamp,
    "rawPayload" jsonb NOT NULL,
    "errorMessage" text,
    "processedAt" timestamp,
    "reconciliationBatchId" text
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "pegasus_event_status_idx" ON "pegasus_event" ("status");
CREATE INDEX IF NOT EXISTS "pegasus_event_account_idx" ON "pegasus_event" ("accountNumber");
CREATE INDEX IF NOT EXISTS "pegasus_event_paid_at_idx" ON "pegasus_event" ("paidAt");

-- 3. Append-only trigger guard (allow only status, errorMessage, processedAt, reconciliationBatchId, signatureVerified to change)
CREATE OR REPLACE FUNCTION check_pegasus_event_immutability()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow updates only to processing state fields
    IF OLD."providerEventId" IS DISTINCT FROM NEW."providerEventId" OR
       OLD."receivedAt" IS DISTINCT FROM NEW."receivedAt" OR
       OLD."accountNumber" IS DISTINCT FROM NEW."accountNumber" OR
       OLD."amount" IS DISTINCT FROM NEW."amount" OR
       OLD."paidAt" IS DISTINCT FROM NEW."paidAt" OR
       OLD."rawPayload" IS DISTINCT FROM NEW."rawPayload" THEN
        RAISE EXCEPTION 'Pegasus event payload and identity are immutable once recorded.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pegasus_event_immutability_trg ON "pegasus_event";
CREATE TRIGGER pegasus_event_immutability_trg
    BEFORE UPDATE ON "pegasus_event"
    FOR EACH ROW
    EXECUTE FUNCTION check_pegasus_event_immutability();
