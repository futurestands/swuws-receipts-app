-- 0033_org_settings_generalization.sql
-- Moves hardcoded business rules and localization into org_settings.

begin;

alter table "org_settings" add column if not exists "billingGraceDays" integer not null default 14;
alter table "org_settings" add column if not exists "currencyCode" text not null default 'UGX';
alter table "org_settings" add column if not exists "receiptPrefix" text not null default 'SWUWS';

commit;
