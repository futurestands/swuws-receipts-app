-- 1. Add idempotencyKey to receipt
ALTER TABLE "receipt" ADD COLUMN IF NOT EXISTS "idempotencyKey" text;
CREATE UNIQUE INDEX IF NOT EXISTS "receipt_idempotency_key_idx" ON "receipt" ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;

-- 2. Add idempotencyKey to meter_reading
ALTER TABLE "meter_reading" ADD COLUMN IF NOT EXISTS "idempotencyKey" text;
CREATE UNIQUE INDEX IF NOT EXISTS "meter_reading_idempotency_key_idx" ON "meter_reading" ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
