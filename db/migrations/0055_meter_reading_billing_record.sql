-- 0055_meter_reading_billing_record.sql
-- Links a field meter reading to the billing_record it creates so cancel
-- can remove that bill without touching customer.accountBalance (EBS-only).

begin;

alter table "meter_reading"
  add column if not exists "billingRecordId" text references "billing_record"(id) on delete set null;

create index if not exists "meter_reading_billing_record_idx"
  on "meter_reading" ("billingRecordId");

commit;
