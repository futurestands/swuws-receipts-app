-- 0054_receipt_recon_status_allowlist.sql
--
-- 0002/0036 reject EVERY update on "receipt" unless the operational-wipe
-- session flag is set. Application code must still write
-- reconciliationStatus (matched on bank recon, void on authorized void).
-- Those are operational flags, not financial-field edits — amount, customer,
-- dates, snapshots stay immutable.
--
-- This replaces reject_receipt_mutation() in place (CREATE OR REPLACE) so
-- the existing triggers keep firing. Do not edit 0002/0036.

begin;

create or replace function reject_receipt_mutation()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.allow_operational_wipe', true) = 'true' then
    return old;
  end if;

  if tg_op = 'UPDATE' then
    -- Only reconciliationStatus may change. Every other column must match.
    if
      new.id is not distinct from old.id
      and new.seq is not distinct from old.seq
      and new."receiptNumber" is not distinct from old."receiptNumber"
      and new."paymentReference" is not distinct from old."paymentReference"
      and new."customerId" is not distinct from old."customerId"
      and new."customerName" is not distinct from old."customerName"
      and new."customerAccount" is not distinct from old."customerAccount"
      and new."customerPhone" is not distinct from old."customerPhone"
      and new."customerAddress" is not distinct from old."customerAddress"
      and new.amount is not distinct from old.amount
      and new."outstandingBalance" is not distinct from old."outstandingBalance"
      and new.currency is not distinct from old.currency
      and new."paymentMethod" is not distinct from old."paymentMethod"
      and new.notes is not distinct from old.notes
      and new."paymentDate" is not distinct from old."paymentDate"
      and new."branchId" is not distinct from old."branchId"
      and new."branchName" is not distinct from old."branchName"
      and new."schemeId" is not distinct from old."schemeId"
      and new."agentId" is not distinct from old."agentId"
      and new."agentName" is not distinct from old."agentName"
      and new."agentEmail" is not distinct from old."agentEmail"
      and new."billingRecordId" is not distinct from old."billingRecordId"
      and new."billingPeriodId" is not distinct from old."billingPeriodId"
      and new."previousAccountBalanceSnapshot" is not distinct from old."previousAccountBalanceSnapshot"
      and new."newAccountBalanceSnapshot" is not distinct from old."newAccountBalanceSnapshot"
      and new."billingPeriodSnapshot" is not distinct from old."billingPeriodSnapshot"
      and new."amountDueSnapshot" is not distinct from old."amountDueSnapshot"
      and new."schemeNameSnapshot" is not distinct from old."schemeNameSnapshot"
      and new."orgNameSnapshot" is not distinct from old."orgNameSnapshot"
      and new."orgAddressSnapshot" is not distinct from old."orgAddressSnapshot"
      and new."orgPhoneSnapshot" is not distinct from old."orgPhoneSnapshot"
      and new."disclaimerSnapshot" is not distinct from old."disclaimerSnapshot"
      and new."footerSnapshot" is not distinct from old."footerSnapshot"
      and new."logoUrlSnapshot" is not distinct from old."logoUrlSnapshot"
      and new."idempotencyKey" is not distinct from old."idempotencyKey"
      and new."printCount" is not distinct from old."printCount"
      and new."firstPrintedAt" is not distinct from old."firstPrintedAt"
      and new."lastPrintedAt" is not distinct from old."lastPrintedAt"
      and new."lastPrintedBy" is not distinct from old."lastPrintedBy"
      and new."createdAt" is not distinct from old."createdAt"
      and new."reconciliationStatus" in ('pending', 'matched', 'exception', 'manual', 'void')
    then
      return new;
    end if;
  end if;

  raise exception
    'Receipts are immutable: % is not permitted on "receipt" (id=%). Create a correction record instead of modifying the original.',
    tg_op, coalesce(old.id, 'unknown')
    using errcode = '0LTIN';
end;
$$;

-- Re-assert triggers in case an ALTER TABLE dropped them (same rule as 0002).
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

-- 0002 revoked all UPDATE on receipt for app_user. Column-level grant
-- restores only the operational flag the trigger now allow-lists. Owner
-- roles bypass REVOKE/GRANT; the trigger remains the primary control.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    grant update ("reconciliationStatus") on "receipt" to app_user;
  end if;
end $$;

commit;
