-- 0001_init.sql
-- Initial schema for the SWUWS Receipt and Payment Tracking System.
-- Run against an empty PostgreSQL database, in order, with:
--   psql "$DATABASE_URL" -f db/migrations/0001_init.sql
--   psql "$DATABASE_URL" -f db/migrations/0002_immutability.sql
--
-- This file intentionally uses plain SQL (not drizzle-kit generated
-- migrations) so every constraint, trigger, and privilege change is
-- auditable in plain text and reviewable in a pull request.

begin;

-- ---------------------------------------------------------------------------
-- Sequence backing sequential, collision-proof receipt numbers.
-- Values are never reused, even if a transaction that consumed one rolls
-- back, which is the correct, standard behavior for audit-safe numbering
-- (a gap is acceptable; a duplicate or reused number is not).
-- ---------------------------------------------------------------------------
create sequence if not exists receipt_seq start 1 increment 1;

-- ---------------------------------------------------------------------------
-- Better Auth tables
-- ---------------------------------------------------------------------------
create table if not exists "user" (
  id text primary key,
  name text not null,
  email text not null unique,
  "emailVerified" boolean not null default false,
  image text,
  role text not null default 'agent',
  active boolean not null default true,
  "createdAt" timestamp not null default now(),
  "updatedAt" timestamp not null default now()
);

create table if not exists "session" (
  id text primary key,
  "expiresAt" timestamp not null,
  token text not null unique,
  "createdAt" timestamp not null default now(),
  "updatedAt" timestamp not null default now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user"(id) on delete cascade
);

create table if not exists "account" (
  id text primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user"(id) on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamp,
  "refreshTokenExpiresAt" timestamp,
  scope text,
  password text,
  "createdAt" timestamp not null default now(),
  "updatedAt" timestamp not null default now()
);

create table if not exists "verification" (
  id text primary key,
  identifier text not null,
  value text not null,
  "expiresAt" timestamp not null,
  "createdAt" timestamp not null default now(),
  "updatedAt" timestamp not null default now()
);

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
create table if not exists "branch" (
  id text primary key,
  name text not null,
  code text not null unique,
  active boolean not null default true,
  "createdAt" timestamp not null default now()
);

create table if not exists "payment_method" (
  id text primary key,
  name text not null,
  code text not null unique,
  active boolean not null default true,
  "createdAt" timestamp not null default now()
);

-- ---------------------------------------------------------------------------
-- Receipts (immutable — see 0002_immutability.sql for the enforced trigger)
-- ---------------------------------------------------------------------------
create table if not exists "receipt" (
  id text primary key,
  seq bigint not null default nextval('receipt_seq'),
  "receiptNumber" text not null unique
    default (('SWUWS-' || to_char(now(), 'YYYY') || '-' || lpad(currval('receipt_seq')::text, 6, '0'))),
  "paymentReference" text not null,
  "customerName" text not null,
  "customerAccount" text,
  "customerPhone" text,
  "customerAddress" text,
  amount bigint not null,
  "outstandingBalance" bigint,
  currency text not null default 'UGX',
  "paymentMethod" text not null default 'cash',
  notes text,
  "paymentDate" timestamp not null,
  "branchId" text references "branch"(id) on delete restrict,
  "branchName" text,
  "agentId" text not null references "user"(id) on delete restrict,
  "agentName" text not null,
  "agentEmail" text not null,
  "orgNameSnapshot" text not null,
  "disclaimerSnapshot" text not null,
  "footerSnapshot" text not null,
  "logoUrlSnapshot" text,
  "createdAt" timestamp not null default now(),
  constraint receipt_amount_positive check (amount > 0)
);

create index if not exists receipt_agent_idx on "receipt" ("agentId");
create index if not exists receipt_created_at_idx on "receipt" ("createdAt");
create index if not exists receipt_branch_idx on "receipt" ("branchId");

-- Append-only attachments: insert-only from the application (no update/delete
-- code path exists in app/actions, and privileges are further restricted in
-- 0002_immutability.sql).
create table if not exists "receipt_attachment" (
  id text primary key,
  "receiptId" text not null references "receipt"(id) on delete restrict,
  url text not null,
  "fileName" text not null,
  "fileSize" integer not null,
  "uploadedById" text not null,
  "uploadedByName" text not null,
  "createdAt" timestamp not null default now()
);

create index if not exists receipt_attachment_receipt_idx on "receipt_attachment" ("receiptId");

-- ---------------------------------------------------------------------------
-- Org settings (single row, id fixed to 1)
-- ---------------------------------------------------------------------------
create table if not exists "org_settings" (
  id integer primary key default 1,
  "orgName" text not null default 'South Western Umbrella of Water and Sanitation',
  "logoUrl" text,
  disclaimer text not null default 'This is an official, non-transferable receipt issued by SWUWS. It cannot be reissued or altered. Report any discrepancy to your area office within 30 days.',
  "footerText" text not null default 'Thank you for your payment.',
  address text,
  phone text,
  "editableFields" jsonb not null,
  "updatedAt" timestamp not null default now(),
  constraint org_settings_single_row check (id = 1)
);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table if not exists "audit_log" (
  id text primary key,
  "userId" text,
  "userName" text,
  "userEmail" text,
  action text not null,
  "entityType" text,
  "entityId" text,
  details jsonb,
  "ipAddress" text,
  "userAgent" text,
  "createdAt" timestamp not null default now()
);

create index if not exists audit_log_created_at_idx on "audit_log" ("createdAt");

-- ---------------------------------------------------------------------------
-- Seed reference data
-- ---------------------------------------------------------------------------
insert into "payment_method" (id, name, code, active)
values
  ('pm_cash', 'Cash', 'cash', true),
  ('pm_mobile_money', 'Mobile Money', 'mobile_money', true),
  ('pm_bank_transfer', 'Bank Transfer', 'bank_transfer', true),
  ('pm_cheque', 'Cheque', 'cheque', true)
on conflict (code) do nothing;

commit;
