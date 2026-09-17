-- Operator crash log. One row per fingerprint; repeats increment occurrenceCount.
CREATE TABLE IF NOT EXISTS "system_error" (
  "id" text PRIMARY KEY NOT NULL,
  "fingerprint" text NOT NULL,
  "message" text NOT NULL,
  "digest" text,
  "stack" text,
  "path" text,
  "source" text DEFAULT 'client' NOT NULL,
  "userId" text,
  "userName" text,
  "occurrenceCount" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "firstSeenAt" timestamp DEFAULT now() NOT NULL,
  "lastSeenAt" timestamp DEFAULT now() NOT NULL,
  "resolvedAt" timestamp,
  "resolvedById" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "system_error_fingerprint_idx"
  ON "system_error" ("fingerprint");

CREATE INDEX IF NOT EXISTS "system_error_status_seen_idx"
  ON "system_error" ("status", "lastSeenAt");

ALTER TABLE "system_error"
  DROP CONSTRAINT IF EXISTS "system_error_resolvedById_fkey";
ALTER TABLE "system_error"
  ADD CONSTRAINT "system_error_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "user"("id") ON DELETE SET NULL;
