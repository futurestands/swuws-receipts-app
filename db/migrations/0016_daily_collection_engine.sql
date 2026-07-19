-- Daily Collection Import Engine (Phase 2B)

ALTER TABLE "daily_collection_import" ADD COLUMN "successfulRecords" integer DEFAULT 0 NOT NULL;
ALTER TABLE "daily_collection_import" ADD COLUMN "failedRecords" integer DEFAULT 0 NOT NULL;
ALTER TABLE "daily_collection_import" ADD COLUMN "fileHash" text;
ALTER TABLE "daily_collection_import" ADD COLUMN "processingDuration" integer;

CREATE UNIQUE INDEX IF NOT EXISTS "daily_collection_import_hash_idx" ON "daily_collection_import" ("fileHash");
