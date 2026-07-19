-- 0005_customer_and_scheme_management.sql
--
-- Modules 1 & 2 (Customer Management, Branch & Scheme Management).
-- Purely additive: two new tables, two new nullable columns on existing
-- tables. Does NOT touch receipt_seq, the receipt/audit_log triggers, any
-- existing column, or any existing row's data. Safe to run against a
-- database that already has 0001-0004 applied and live data in it.
--
-- Note on receipt immutability: ALTER TABLE ... ADD COLUMN (with no
-- explicit rewrite-triggering change) does not fire row-level UPDATE
-- triggers in PostgreSQL — it is a metadata/DDL operation, not a DML
-- UPDATE statement against existing rows. The receipt_no_update trigger
-- from 0002_immutability.sql is therefore unaffected and continues to
-- block any actual UPDATE statement exactly as before.

begin;

-- ---------------------------------------------------------------------------
-- Module 2: agent -> branch assignment
-- ---------------------------------------------------------------------------
alter table "user" add column if not exists "branchId" text
  references "branch"(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Module 2: water schemes
-- ---------------------------------------------------------------------------
create table if not exists "water_scheme" (
  id text primary key,
  name text not null,
  code text not null unique,
  "branchId" text references "branch"(id) on delete set null,
  "serviceArea" text,
  active boolean not null default true,
  "createdAt" timestamp not null default now()
);

create index if not exists water_scheme_branch_idx on "water_scheme" ("branchId");

-- ---------------------------------------------------------------------------
-- Module 1: customers
-- ---------------------------------------------------------------------------
create table if not exists "customer" (
  id text primary key,
  "customerAccount" text unique,
  name text not null,
  phone text,
  address text,
  "waterSchemeId" text references "water_scheme"(id) on delete set null,
  notes text,
  "createdById" text references "user"(id) on delete set null,
  "createdAt" timestamp not null default now(),
  "updatedAt" timestamp not null default now()
);

create index if not exists customer_name_idx on "customer" (name);
create index if not exists customer_scheme_idx on "customer" ("waterSchemeId");

-- ---------------------------------------------------------------------------
-- Module 1: link receipts to a customer profile (nullable — every existing
-- receipt row keeps working exactly as before, with customerId left null)
-- ---------------------------------------------------------------------------
alter table "receipt" add column if not exists "customerId" text
  references "customer"(id) on delete set null;

create index if not exists receipt_customer_idx on "receipt" ("customerId");

commit;
