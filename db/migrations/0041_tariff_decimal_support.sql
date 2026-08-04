-- 0041_tariff_decimal_support.sql
-- Changes tariff prices from bigint to numeric to support decimals (e.g. 2118.6).

BEGIN;

-- 1. Change columns to numeric with 2 decimal places of precision.
-- Using numeric(12, 2) allows for up to 9,999,999,999.99 which is plenty for UGX tariffs.
ALTER TABLE "tariff_configuration"
  ALTER COLUMN "unitPrice" TYPE numeric(12, 2),
  ALTER COLUMN "serviceFee" TYPE numeric(12, 2);

COMMIT;
