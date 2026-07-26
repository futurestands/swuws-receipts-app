-- 0032_customer_active_status.sql
-- Supports 'customers.delete' permission by providing a logical deactivation flag.
-- Financial history remains intact while customer is hidden from operational pickers.

begin;

alter table "customer" add column if not exists "active" boolean not null default true;

create index if not exists "customer_active_idx" on "customer" ("active");

commit;
