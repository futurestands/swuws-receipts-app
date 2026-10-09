-- 0064_ebs_gateway_config.sql
-- Create ebs_gateway_config table for Pegasus integration foundation

CREATE TABLE IF NOT EXISTS "ebs_gateway_config" (
    "id" integer PRIMARY KEY DEFAULT 1,
    "providerName" text NOT NULL DEFAULT 'pegasus',
    "active" boolean NOT NULL DEFAULT false,
    "baseUrl" text,
    "encryptedApiKey" text,
    "encryptedApiSecret" text,
    "encryptedWebhookSecret" text,
    "syncCustomers" boolean NOT NULL DEFAULT false,
    "syncBills" boolean NOT NULL DEFAULT false,
    "pushMeterReadings" boolean NOT NULL DEFAULT false,
    "liveBalanceCheck" boolean NOT NULL DEFAULT false,
    "updatedById" text REFERENCES "user"("id") ON DELETE SET NULL,
    "updatedAt" timestamp NOT NULL DEFAULT NOW()
);
