-- Reconciliation Exceptions (Phase 3B)

CREATE TABLE "reconciliation_exception" (
	"id" text PRIMARY KEY NOT NULL,
	"receiptId" text,
	"dailyCollectionRecordId" text,
	"exceptionType" text NOT NULL,
	"reason" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assignedToId" text,
	"reviewNotes" text,
	"resolution" text,
	"resolvedAt" timestamp,
	"resolvedById" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "reconciliation_exception_receipt_idx" ON "reconciliation_exception" ("receiptId");
CREATE INDEX "reconciliation_exception_record_idx" ON "reconciliation_exception" ("dailyCollectionRecordId");
CREATE INDEX "reconciliation_exception_status_idx" ON "reconciliation_exception" ("status");
CREATE INDEX "reconciliation_exception_type_idx" ON "reconciliation_exception" ("exceptionType");
CREATE INDEX "reconciliation_exception_assigned_idx" ON "reconciliation_exception" ("assignedToId");

ALTER TABLE "reconciliation_exception" ADD CONSTRAINT "reconciliation_exception_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "receipt"("id") ON DELETE CASCADE;
ALTER TABLE "reconciliation_exception" ADD CONSTRAINT "reconciliation_exception_dailyCollectionRecordId_fkey" FOREIGN KEY ("dailyCollectionRecordId") REFERENCES "daily_collection_record"("id") ON DELETE CASCADE;
ALTER TABLE "reconciliation_exception" ADD CONSTRAINT "reconciliation_exception_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "user"("id") ON DELETE SET NULL;
ALTER TABLE "reconciliation_exception" ADD CONSTRAINT "reconciliation_exception_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "user"("id") ON DELETE SET NULL;
