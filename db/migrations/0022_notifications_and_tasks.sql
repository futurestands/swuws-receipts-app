-- Operational Notifications & Task Management (Phase 5B)

-- 1. Enhance Exceptions for Task Management
ALTER TABLE "reconciliation_exception" ADD COLUMN "dueDate" timestamp;

-- 2. Enhance Approvals for Task Management
ALTER TABLE "reconciliation_approval" ADD COLUMN "assignedToId" text;
ALTER TABLE "reconciliation_approval" ADD COLUMN "dueDate" timestamp;
ALTER TABLE "reconciliation_approval" ADD CONSTRAINT "reconciliation_approval_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "user"("id") ON DELETE SET NULL;

-- 3. Create Notifications Table
CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"relatedEntityType" text,
	"relatedEntityId" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'unread' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"readAt" timestamp,
	"expiresAt" timestamp
);

CREATE INDEX "notification_user_status_idx" ON "notification" ("userId", "status");
CREATE INDEX "notification_type_idx" ON "notification" ("type");
CREATE INDEX "notification_created_idx" ON "notification" ("createdAt");

ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;
