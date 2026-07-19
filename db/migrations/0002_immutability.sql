-- 0002_immutability.sql
--
-- Enforces the single most important business requirement: issued receipts
-- can never be deleted, updated, replaced, or overwritten — at the database
-- level, independent of application code. This closes the Critical finding
-- from the forensic audit: a comment in the old schema claimed triggers did
-- this, but no such trigger actually existed anywhere in the repository.
--
-- Two independent layers are used deliberately, not just one:
--   1. A trigger that unconditionally rejects UPDATE/DELETE, so even a
--      superuser session that forgot to check privileges gets a clear error.
--   2. REVOKEd table privileges for the application's runtime role, so even
--      if the trigger were ever dropped by mistake, the app's own DB
--      credentials still cannot modify or remove a row.
--
-- Run this after 0001_init.sql:
--   psql "$DATABASE_URL" -f db/migrations/0002_immutability.sql
--
-- Replace app_user below with your actual application database role name
-- (the role in DATABASE_URL) before running this in a real environment.

begin;

-- ---------------------------------------------------------------------------
-- 1. Trigger-level enforcement
-- ---------------------------------------------------------------------------
create or replace function reject_receipt_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Receipts are immutable: % is not permitted on "receipt" (id=%). Create a correction record instead of modifying the original.',
    tg_op, coalesce(old.id, 'unknown')
    using errcode = '0LTIN';
end;
$$;

drop trigger if exists receipt_no_update on "receipt";
create trigger receipt_no_update
  before update on "receipt"
  for each row
  execute function reject_receipt_mutation();

drop trigger if exists receipt_no_delete on "receipt";
create trigger receipt_no_delete
  before delete on "receipt"
  for each row
  execute function reject_receipt_mutation();

-- Attachments are append-only: once uploaded and linked to a receipt, an
-- attachment record cannot be edited or removed either.
create or replace function reject_attachment_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Receipt attachments are append-only: % is not permitted on "receipt_attachment" (id=%).',
    tg_op, coalesce(old.id, 'unknown')
    using errcode = '0LTIN';
end;
$$;

drop trigger if exists receipt_attachment_no_update on "receipt_attachment";
create trigger receipt_attachment_no_update
  before update on "receipt_attachment"
  for each row
  execute function reject_attachment_mutation();

drop trigger if exists receipt_attachment_no_delete on "receipt_attachment";
create trigger receipt_attachment_no_delete
  before delete on "receipt_attachment"
  for each row
  execute function reject_attachment_mutation();

-- ---------------------------------------------------------------------------
-- 2. Privilege-level enforcement (defense in depth)
--
-- IMPORTANT: substitute the real role your DATABASE_URL connects as for
-- app_user. If you are on a managed Postgres provider that only gives you a
-- single owner role, you cannot fully apply this section (an owner role
-- bypasses REVOKE); in that case the trigger above is your primary control,
-- and you should provision a separate, lower-privileged application role.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    revoke update, delete on "receipt" from app_user;
    revoke update, delete on "receipt_attachment" from app_user;
    grant select, insert on "receipt" to app_user;
    grant select, insert on "receipt_attachment" to app_user;
  end if;
end $$;

commit;
