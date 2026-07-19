-- 0008_rbac_foundation.sql
--
-- Establishes the database foundation for the SWUWS organizational
-- hierarchy (Organization -> Cluster -> Area -> Scheme) and adds the
-- corresponding links to the user table.
--
-- Note: 'branch' is reused as the 'Area' level, and 'water_scheme'
-- as the 'Scheme' level.

begin;

-- 1. Create Organization table
create table if not exists "organization" (
  id text primary key,
  name text not null,
  code text not null unique,
  active boolean not null default true,
  "createdAt" timestamp not null default now()
);

-- 2. Create Cluster table
create table if not exists "cluster" (
  id text primary key,
  name text not null,
  code text not null unique,
  "organizationId" text references "organization"(id) on delete set null,
  active boolean not null default true,
  "createdAt" timestamp not null default now()
);

-- 3. Update branch (Area) to link to Cluster
alter table "branch" add column if not exists "clusterId" text references "cluster"(id) on delete set null;

-- 4. Update user to include full hierarchy links
-- Existing 'branchId' is retained for backward compatibility.
alter table "user" add column if not exists "organizationId" text references "organization"(id) on delete set null;
alter table "user" add column if not exists "clusterId" text references "cluster"(id) on delete set null;
alter table "user" add column if not exists "schemeId" text references "water_scheme"(id) on delete set null;

commit;
