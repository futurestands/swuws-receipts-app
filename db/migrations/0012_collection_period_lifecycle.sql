-- Add status and lifecycle columns to billing_period
ALTER TABLE "billing_period" ADD COLUMN "description" text;
ALTER TABLE "billing_period" ADD COLUMN "status" text NOT NULL DEFAULT 'draft';
ALTER TABLE "billing_period" ADD COLUMN "validatedAt" timestamp;
ALTER TABLE "billing_period" ADD COLUMN "validatedById" text REFERENCES "user"("id");
ALTER TABLE "billing_period" ADD COLUMN "activatedAt" timestamp;
ALTER TABLE "billing_period" ADD COLUMN "activatedById" text REFERENCES "user"("id");
ALTER TABLE "billing_period" ADD COLUMN "closedAt" timestamp;
ALTER TABLE "billing_period" ADD COLUMN "closedById" text REFERENCES "user"("id");
ALTER TABLE "billing_period" ADD COLUMN "archivedAt" timestamp;
ALTER TABLE "billing_period" ADD COLUMN "archivedById" text REFERENCES "user"("id");

-- Create index for performance
CREATE INDEX "billing_period_status_idx" ON "billing_period" ("status");

-- Data migration: Sync status with isOpen
-- If multiple are open, only the most recent one becomes 'active', others 'closed'
UPDATE "billing_period"
SET "status" = 'active'
WHERE "id" = (
    SELECT "id" FROM "billing_period"
    WHERE "isOpen" = true
    ORDER BY "year" DESC, "month" DESC
    LIMIT 1
);

UPDATE "billing_period"
SET "status" = 'closed'
WHERE "status" = 'draft' AND "isOpen" = false;

UPDATE "billing_period"
SET "status" = 'closed'
WHERE "isOpen" = true AND "status" != 'active';
