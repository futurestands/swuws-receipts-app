-- Migration 0040: Unify Dashboard Stats & Discrepancies
ALTER TABLE "receipt" ADD COLUMN "billingPeriodId" TEXT REFERENCES "billing_period"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "receipt_billing_period_idx" ON "receipt" ("billingPeriodId");

CREATE TABLE IF NOT EXISTS "billing_discrepancy" (
    "id" TEXT PRIMARY KEY,
    "customerId" TEXT NOT NULL REFERENCES "customer"("id") ON DELETE CASCADE,
    "billingPeriodId" TEXT NOT NULL REFERENCES "billing_period"("id") ON DELETE CASCADE,
    "sourceType" TEXT NOT NULL,
    "reportedById" TEXT REFERENCES "user"("id"),
    "existingValue" BIGINT NOT NULL,
    "attemptedValue" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolutionNotes" TEXT,
    "resolvedById" TEXT REFERENCES "user"("id"),
    "resolvedAt" TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "billing_discrepancy_cust_per_idx" ON "billing_discrepancy" ("customerId", "billingPeriodId");
CREATE INDEX IF NOT EXISTS "billing_discrepancy_status_idx" ON "billing_discrepancy" ("status");
