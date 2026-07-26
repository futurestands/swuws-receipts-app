CREATE TABLE IF NOT EXISTS "tariff_configuration" (
	"id" text PRIMARY KEY NOT NULL,
	"targetType" text NOT NULL, -- 'branch' or 'scheme'
	"targetId" text NOT NULL,
	"unitPrice" bigint DEFAULT 0 NOT NULL,
	"serviceFee" bigint DEFAULT 0 NOT NULL,
	"vatPercentage" integer DEFAULT 18 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "meter_reading" (
	"id" text PRIMARY KEY NOT NULL,
	"customerId" text NOT NULL REFERENCES "customer"("id") ON DELETE restrict,
	"billingPeriodId" text NOT NULL REFERENCES "billing_period"("id") ON DELETE restrict,
	"previousReading" bigint DEFAULT 0 NOT NULL,
	"currentReading" bigint DEFAULT 0 NOT NULL,
	"consumption" bigint DEFAULT 0 NOT NULL,
	"billedAmount" bigint DEFAULT 0 NOT NULL,
	"recordedById" text NOT NULL REFERENCES "user"("id") ON DELETE restrict,
	"isNotified" boolean DEFAULT false NOT NULL,
	"notifiedAt" timestamp,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "meterRef" text UNIQUE;
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "serialNo" text;
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "lastReading" bigint DEFAULT 0 NOT NULL;
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "lastReadingDate" timestamp;

CREATE UNIQUE INDEX IF NOT EXISTS "tariff_target_idx" ON "tariff_configuration" ("targetType", "targetId");
CREATE UNIQUE INDEX IF NOT EXISTS "meter_reading_customer_period_unq" ON "meter_reading" ("customerId", "billingPeriodId");
CREATE INDEX IF NOT EXISTS "meter_reading_customer_idx" ON "meter_reading" ("customerId");
CREATE INDEX IF NOT EXISTS "meter_reading_period_idx" ON "meter_reading" ("billingPeriodId");
