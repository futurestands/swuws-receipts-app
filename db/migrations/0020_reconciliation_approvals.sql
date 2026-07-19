-- Reconciliation Approvals (Phase 4B)

CREATE TABLE "reconciliation_approval" (
	"id" text PRIMARY KEY NOT NULL,
	"batchId" text NOT NULL,
	"approvalStage" text DEFAULT 'draft' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"approvedById" text,
	"approvedAt" timestamp,
	"comments" text,
	"reopenedById" text,
	"reopenedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "reconciliation_approval_batch_idx" ON "reconciliation_approval" ("batchId");
CREATE INDEX "reconciliation_approval_stage_idx" ON "reconciliation_approval" ("approvalStage");

ALTER TABLE "reconciliation_approval" ADD CONSTRAINT "reconciliation_approval_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "daily_collection_import"("id") ON DELETE CASCADE;
ALTER TABLE "reconciliation_approval" ADD CONSTRAINT "reconciliation_approval_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL;
ALTER TABLE "reconciliation_approval" ADD CONSTRAINT "reconciliation_approval_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "user"("id") ON DELETE SET NULL;
