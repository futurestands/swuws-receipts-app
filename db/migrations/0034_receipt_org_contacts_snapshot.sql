-- 0034_receipt_org_contacts_snapshot.sql
-- Snapshots organization contact info at the moment of receipt issuance.

begin;

alter table "receipt" add column if not exists "orgAddressSnapshot" text;
alter table "receipt" add column if not exists "orgPhoneSnapshot" text;

commit;
