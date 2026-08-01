-- Add latest app version to organization settings
ALTER TABLE "org_settings" ADD COLUMN "latestAppVersion" TEXT DEFAULT '1.0.0' NOT NULL;

-- Add preferences to user table
ALTER TABLE "user" ADD COLUMN "preferences" JSONB DEFAULT '{"vibrationEnabled": true}'::jsonb NOT NULL;
