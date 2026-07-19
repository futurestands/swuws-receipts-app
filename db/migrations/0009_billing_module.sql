-- 0009_billing_module.sql
--
-- Implements the database foundation for the Scheme Billing Upload Module.
-- Includes tables for billing periods, runs, individual records, and file uploads.
-- Links receipts to billing records for future reconciliation.


-- 1. Create billing_period table
create table if not exists "billing_period" (
  "id" text primary key,
  "month" integer not null check ("month" between 1 and 12),
  "year" integer not null,
  "periodName" text not null,
  "startDate" timestamp not null,
  "endDate" timestamp not null,
  "isOpen" boolean not null default true,
  "isLocked" boolean not null default false,
  "createdAt" timestamp not null default now(),
  "updatedAt" timestamp not null default now()
);

-- 2. Create billing_run table
-- Tracks one upload session for a specific scheme and period.
create table if not exists "billing_run" (
  "id" text primary key,
  "schemeId" text not null references "water_scheme"(id) on delete restrict,
  "billingPeriodId" text not null references "billing_period"(id) on delete restrict,
  "uploadedById" text not null references "user"(id) on delete restrict,
  "uploadedAt" timestamp not null default now(),
  "sourceFile" text,
  "status" text not null default 'pending',
  "totalCustomers" integer not null default 0,
  "totalAmount" bigint not null default 0,
  "remarks" text,
  "createdAt" timestamp not null default now(),
  "updatedAt" timestamp not null default now(),
  constraint "billing_run_scheme_period_unq" unique("schemeId", "billingPeriodId")
);

-- 3. Create billing_record table
-- Individual bill for a customer in a specific period.
create table if not exists "billing_record" (
  "id" text primary key,
  "billingRunId" text not null references "billing_run"(id) on delete cascade,
  -- Denormalized for efficient unique constraint (customer_id, billing_period_id)
  "billingPeriodId" text not null references "billing_period"(id) on delete restrict,
  "customerId" text not null references "customer"(id) on delete restrict,
  "accountNumber" text not null,
  "billAmount" bigint not null default 0 check ("billAmount" >= 0),
  "arrears" bigint not null default 0, -- can be negative if credit
  "currentCharges" bigint not null default 0 check ("currentCharges" >= 0),
  "totalDue" bigint not null default 0,
  "dueDate" timestamp not null,
  "status" text not null default 'pending',
  "createdAt" timestamp not null default now(),
  "updatedAt" timestamp not null default now(),
  constraint "billing_record_customer_period_unq" unique("customerId", "billingPeriodId"),
  constraint "billing_record_status_check" check ("status" in ('pending', 'partially_paid', 'paid', 'cancelled', 'written_off'))
);

-- 4. Create billing_upload table
-- Log of uploaded billing files and their processing status.
create table if not exists "billing_upload" (
  "id" text primary key,
  "billingRunId" text not null references "billing_run"(id) on delete cascade,
  "filename" text not null,
  "storagePath" text not null,
  "fileHash" text,
  "uploadedById" text not null references "user"(id) on delete restrict,
  "uploadedAt" timestamp not null default now(),
  "importedRecords" integer not null default 0,
  "failedRecords" integer not null default 0,
  "createdAt" timestamp not null default now()
);

-- 5. Integrate with receipt table
-- Add nullable link for future reconciliation.
alter table "receipt" add column if not exists "billingRecordId" text references "billing_record"(id) on delete set null;

-- 6. Indexes for optimized reporting and lookups
create index if not exists "billing_period_month_year_idx" on "billing_period" ("month", "year");
create index if not exists "billing_run_scheme_idx" on "billing_run" ("schemeId");
create index if not exists "billing_run_period_idx" on "billing_run" ("billingPeriodId");
create index if not exists "billing_run_uploaded_by_idx" on "billing_run" ("uploadedById");
create index if not exists "billing_record_run_idx" on "billing_record" ("billingRunId");
create index if not exists "billing_record_period_idx" on "billing_record" ("billingPeriodId");
create index if not exists "billing_record_customer_idx" on "billing_record" ("customerId");
create index if not exists "billing_record_account_idx" on "billing_record" ("accountNumber");
create index if not exists "billing_record_due_date_idx" on "billing_record" ("dueDate");
create index if not exists "billing_record_status_idx" on "billing_record" ("status");
create index if not exists "billing_upload_run_idx" on "billing_upload" ("billingRunId");
create index if not exists "billing_upload_uploaded_by_idx" on "billing_upload" ("uploadedById");
create index if not exists "receipt_billing_record_idx" on "receipt" ("billingRecordId");
