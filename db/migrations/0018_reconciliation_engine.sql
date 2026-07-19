-- Reconciliation Engine (Phase 3A)

-- Add reconciliationStatus to receipt table
ALTER TABLE "receipt" ADD COLUMN "reconciliationStatus" text DEFAULT 'pending' NOT NULL;
CREATE INDEX "receipt_recon_status_idx" ON "receipt" ("reconciliationStatus");

-- Create reconciliation_match table
CREATE TABLE "reconciliation_match" (
	"id" text PRIMARY KEY NOT NULL,
	"receiptId" text NOT NULL,
	"dailyCollectionRecordId" text NOT NULL,
	"matchMethod" text NOT NULL,
	"confidenceScore" integer DEFAULT 0 NOT NULL,
	"matchedAt" timestamp DEFAULT now() NOT NULL,
	"matchedById" text,
	"status" text DEFAULT 'matched' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "reconciliation_match_receipt_idx" ON "reconciliation_match" ("receiptId");
CREATE UNIQUE INDEX "reconciliation_match_record_idx" ON "reconciliation_match" ("dailyCollectionRecordId");
CREATE INDEX "reconciliation_match_method_idx" ON "reconciliation_match" ("matchMethod");

ALTER TABLE "reconciliation_match" ADD CONSTRAINT "reconciliation_match_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "receipt"("id") ON DELETE CASCADE;
ALTER TABLE "reconciliation_match" ADD CONSTRAINT "reconciliation_match_dailyCollectionRecordId_fkey" FOREIGN KEY ("dailyCollectionRecordId") REFERENCES "daily_collection_record"("id") ON DELETE CASCADE;
ALTER TABLE "reconciliation_match" ADD CONSTRAINT "reconciliation_match_matchedById_fkey" FOREIGN KEY ("matchedById") REFERENCES "user"("id") ON DELETE SET NULL;
