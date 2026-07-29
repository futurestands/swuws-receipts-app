-- Daily Collection Record Repository (Phase 2C)

CREATE TABLE "daily_collection_record" (
	"id" text PRIMARY KEY NOT NULL,
	"batchId" text NOT NULL,
	"accountNumber" text NOT NULL,
	"customerName" text NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"paymentDate" timestamp NOT NULL,
	"externalReference" text NOT NULL,
	"paymentChannel" text NOT NULL,
	"schemeName" text,
	"branchName" text,
	"currency" text DEFAULT 'UGX' NOT NULL,
	"remarks" text,
	"importStatus" text DEFAULT 'imported' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "daily_collection_record_batch_idx" ON "daily_collection_record" ("batchId");
CREATE INDEX "daily_collection_record_account_idx" ON "daily_collection_record" ("accountNumber");
CREATE INDEX "daily_collection_record_ref_idx" ON "daily_collection_record" ("externalReference");
CREATE INDEX "daily_collection_record_date_idx" ON "daily_collection_record" ("paymentDate");
CREATE INDEX "daily_collection_record_status_idx" ON "daily_collection_record" ("importStatus");
CREATE UNIQUE INDEX "daily_collection_record_batch_ref_unq" ON "daily_collection_record" ("batchId", "externalReference");

ALTER TABLE "daily_collection_record" ADD CONSTRAINT "daily_collection_record_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "daily_collection_import"("id") ON DELETE CASCADE;
