ALTER TABLE "system_error" ADD COLUMN IF NOT EXISTS "userEmail" text;
ALTER TABLE "system_error" ADD COLUMN IF NOT EXISTS "seenBy" jsonb;
