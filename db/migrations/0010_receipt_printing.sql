-- Add print tracking columns to receipt table
ALTER TABLE "receipt" ADD COLUMN "printCount" integer DEFAULT 0 NOT NULL;
ALTER TABLE "receipt" ADD COLUMN "firstPrintedAt" timestamp;
ALTER TABLE "receipt" ADD COLUMN "lastPrintedAt" timestamp;
ALTER TABLE "receipt" ADD COLUMN "lastPrintedBy" text;

-- Create receipt_print_history table
CREATE TABLE IF NOT EXISTS "receipt_print_history" (
	"id" text PRIMARY KEY NOT NULL,
	"receiptId" text NOT NULL,
	"printedById" text NOT NULL,
	"printedByName" text NOT NULL,
	"printNumber" integer NOT NULL,
	"isReprint" boolean NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"device" text,
	"browser" text,
	"printedAt" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraints
DO $$ BEGIN
 ALTER TABLE "receipt_print_history" ADD CONSTRAINT "receipt_print_history_receiptId_receipt_id_fk" FOREIGN KEY ("receiptId") REFERENCES "receipt"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "receipt_print_history" ADD CONSTRAINT "receipt_print_history_printedById_user_id_fk" FOREIGN KEY ("printedById") REFERENCES "user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Add indexes
CREATE INDEX IF NOT EXISTS "receipt_print_history_receipt_idx" ON "receipt_print_history" ("receiptId");
CREATE INDEX IF NOT EXISTS "receipt_print_history_printed_by_idx" ON "receipt_print_history" ("printedById");
