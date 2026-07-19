-- 0003_audit_log_immutability.sql
--
-- Closes Certification Report Finding 8.1: audit_log had no database-level
-- immutability control, unlike receipt/receipt_attachment (0002). Since the
-- rest of this system's certification depends on the audit trail being
-- trustworthy, it needs the same guarantee, not a weaker one.
--
-- This mirrors 0002_immutability.sql's pattern exactly (same trigger
-- structure, same defense-in-depth REVOKE step) rather than introducing a
-- new approach. INSERT is untouched — only UPDATE/DELETE are blocked, so
-- writeAudit() (lib/audit.ts) requires no changes at all.
--
-- Run after 0001_init.sql and 0002_immutability.sql:
--   psql "$DATABASE_URL" -f db/migrations/0003_audit_log_immutability.sql
--
-- As with 0002, replace app_user with your actual application database role.

begin;

create or replace function reject_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Audit log entries are immutable: % is not permitted on "audit_log" (id=%).',
    tg_op, coalesce(old.id, 'unknown')
    using errcode = '0LTIN';
end;
$$;

drop trigger if exists audit_log_no_update on "audit_log";
create trigger audit_log_no_update
  before update on "audit_log"
  for each row
  execute function reject_audit_log_mutation();

drop trigger if exists audit_log_no_delete on "audit_log";
create trigger audit_log_no_delete
  before delete on "audit_log"
  for each row
  execute function reject_audit_log_mutation();

-- Privilege-level enforcement (defense in depth), same caveat as 0002: a
-- no-op if your app connects as a superuser/table-owner role.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    revoke update, delete on "audit_log" from app_user;
    grant select, insert on "audit_log" to app_user;
  end if;
end $$;

commit;
