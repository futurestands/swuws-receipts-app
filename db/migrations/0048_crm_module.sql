-- 0048_crm_module.sql
-- Implements the Customer Relationship Management (CRM) module tables.
-- Also completes the customer profile with serial numbers, readings, and arrears.

BEGIN;

-- 1. Complete Customer Profile
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "serialNo" text;
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "lastReading" bigint NOT NULL DEFAULT 0;
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "lastReadingDate" timestamp;
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "openingArrears" integer NOT NULL DEFAULT 0;
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "category" text NOT NULL DEFAULT 'domestic';
-- Note: updatedAt might already exist from 0005, but we ensure it's there.
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp NOT NULL DEFAULT now();

-- 2. CRM Departments
CREATE TABLE IF NOT EXISTS "crm_department" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "description" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

-- 3. CRM Complaint Categories
CREATE TABLE IF NOT EXISTS "crm_complaint_category" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "description" text,
  "defaultHandlerDepartmentId" text REFERENCES "crm_department"("id") ON DELETE SET NULL,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

-- 4. CRM Complaints
CREATE TABLE IF NOT EXISTS "crm_complaint" (
  "id" text PRIMARY KEY,
  "complaintNumber" text NOT NULL UNIQUE,
  "customerId" text REFERENCES "customer"("id") ON DELETE SET NULL,
  "complainantName" text NOT NULL,
  "complainantPhone" text NOT NULL,
  "complainantEmail" text,
  "complainantAddress" text,
  "area" text,
  "categoryId" text REFERENCES "crm_complaint_category"("id") ON DELETE SET NULL,
  "details" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "priority" text NOT NULL DEFAULT 'medium',
  "assignedToId" text REFERENCES "user"("id") ON DELETE SET NULL,
  "assignedDepartmentId" text REFERENCES "crm_department"("id") ON DELETE SET NULL,
  "resolutionNotes" text,
  "resolvedAt" timestamp,
  "resolvedById" text REFERENCES "user"("id") ON DELETE SET NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "complaint_number_idx" ON "crm_complaint" ("complaintNumber");
CREATE INDEX IF NOT EXISTS "complaint_status_idx" ON "crm_complaint" ("status");
CREATE INDEX IF NOT EXISTS "complaint_priority_idx" ON "crm_complaint" ("priority");

-- 5. Bulk SMS Batches
CREATE TABLE IF NOT EXISTS "crm_sms_batch" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "templateId" text REFERENCES "managed_template"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "totalMessages" integer NOT NULL DEFAULT 0,
  "sentMessages" integer NOT NULL DEFAULT 0,
  "failedMessages" integer NOT NULL DEFAULT 0,
  "createdById" text REFERENCES "user"("id") ON DELETE SET NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

-- 6. Individual SMS Records
CREATE TABLE IF NOT EXISTS "crm_sms_record" (
  "id" text PRIMARY KEY,
  "batchId" text REFERENCES "crm_sms_batch"("id") ON DELETE CASCADE,
  "customerId" text REFERENCES "customer"("id") ON DELETE SET NULL,
  "phoneNumber" text NOT NULL,
  "message" text NOT NULL,
  "status" text NOT NULL DEFAULT 'queued',
  "externalRef" text,
  "error" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sms_record_batch_idx" ON "crm_sms_record" ("batchId");
CREATE INDEX IF NOT EXISTS "sms_record_status_idx" ON "crm_sms_record" ("status");

COMMIT;
