-- Daily Collection Module Foundation (Phase 2A)

CREATE TABLE "daily_collection_import" (
	"id" text PRIMARY KEY NOT NULL,
	"businessDate" timestamp NOT NULL,
	"filename" text NOT NULL,
	"uploadedById" text NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"totalRecords" integer DEFAULT 0 NOT NULL,
	"totalAmount" bigint DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "daily_collection_import_date_idx" ON "daily_collection_import" ("businessDate");
CREATE INDEX "daily_collection_import_uploader_idx" ON "daily_collection_import" ("uploadedById");

ALTER TABLE "daily_collection_import" ADD CONSTRAINT "daily_collection_import_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE RESTRICT;
