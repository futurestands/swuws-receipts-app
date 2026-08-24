-- 0051_sms_gateway_config.sql
-- Admin-configurable SMS gateway credentials, separate from org_settings
-- so an API key never rides along on the broadly-cached general settings
-- object read across the rest of the app.

BEGIN;

CREATE TABLE IF NOT EXISTS "sms_gateway_config" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "provider" text,
  "apiKey" text,
  "username" text,
  "senderId" text,
  "active" boolean NOT NULL DEFAULT false,
  "updatedById" text REFERENCES "user"("id") ON DELETE SET NULL,
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

COMMIT;
