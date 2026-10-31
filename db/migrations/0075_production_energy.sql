-- Migration 0075: Water Production Energy, Fuel and Multi-Day Interval Logging
-- Adds tracking for shared energy assets, electricity, fuel, and multi-day interval water readings.
-- Deliberately omits hardcoded "public." schema qualifiers so search_path isolation works in disposable test schemas.

BEGIN;

-- Preflight safety: fail closed if an earlier unverified draft created energy_asset_assignment without schemeId
-- or any 0075 measurement table without version/updatedAt.
DO $$ BEGIN
  IF to_regclass('energy_asset_assignment') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'energy_asset_assignment' AND column_name = 'schemeId'
  ) THEN
    RAISE EXCEPTION 'Preflight failed: legacy draft energy_asset_assignment exists without schemeId; inspect and reconcile before applying 0075';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "water_scheme_energy_asset" (
  "id" text PRIMARY KEY NOT NULL,
  "schemeId" text NOT NULL,
  "assetType" text NOT NULL,
  "assetRef" text NOT NULL,
  "fuelType" text,
  "active" boolean DEFAULT true NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "energy_asset_values" CHECK (
    "assetType" IN ('electricity_meter', 'generator')
    AND btrim("assetRef") <> ''
    AND (
      ("assetType" = 'generator' AND ("fuelType" IS NULL OR "fuelType" IN ('diesel', 'petrol')))
      OR ("assetType" = 'electricity_meter' AND "fuelType" IS NULL)
    )
  )
);

CREATE TABLE IF NOT EXISTS "energy_asset_assignment" (
  "id" text PRIMARY KEY NOT NULL,
  "schemeId" text NOT NULL,
  "assetId" text NOT NULL,
  "sourceId" text NOT NULL,
  "assignedAt" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "water_production_interval" (
  "id" text PRIMARY KEY NOT NULL,
  "schemeId" text NOT NULL,
  "sourceId" text NOT NULL,
  "meterRef" text NOT NULL,
  "openingReading" numeric(12, 2) NOT NULL,
  "openingTimestamp" timestamp NOT NULL,
  "closingReading" numeric(12, 2) NOT NULL,
  "closingTimestamp" timestamp NOT NULL,
  "meterUnit" text DEFAULT 'm3' NOT NULL,
  "multiplier" numeric(6, 2) DEFAULT '1.00' NOT NULL,
  "rolloverValue" numeric(12, 2),
  "isReset" boolean DEFAULT false NOT NULL,
  "calculatedVolumeM3" numeric(12, 2) NOT NULL,
  "coverageHours" numeric(8, 2) NOT NULL,
  "coverageStartDate" date NOT NULL,
  "coverageEndDate" date NOT NULL,
  "isCrossMonth" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'entered' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "recordedById" text NOT NULL,
  "verifiedById" text,
  "verifiedAt" timestamp,
  "requestKey" text NOT NULL,
  "requestFingerprint" text NOT NULL,
  "notes" text,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "water_prod_int_dates" CHECK (
    "closingTimestamp" > "openingTimestamp"
    AND "coverageEndDate" >= "coverageStartDate"
    AND "coverageStartDate" = (("openingTimestamp" + interval '3 hours')::date)
    AND "coverageEndDate" = GREATEST(
      (("openingTimestamp" + interval '3 hours')::date),
      ((("closingTimestamp" - interval '1 millisecond') + interval '3 hours')::date)
    )
    AND "isCrossMonth" = (to_char("coverageStartDate", 'YYYY-MM') <> to_char("coverageEndDate", 'YYYY-MM'))
  ),
  CONSTRAINT "water_prod_int_vol" CHECK (
    "calculatedVolumeM3" >= 0
    AND "calculatedVolumeM3"::text NOT IN ('NaN', 'Infinity', '-Infinity')
  ),
  CONSTRAINT "water_prod_int_reconciliation" CHECK (
    (
      (("isReset" OR "closingReading" < "openingReading") AND "rolloverValue" IS NOT NULL AND "rolloverValue" >= "openingReading")
      OR (NOT "isReset" AND "closingReading" >= "openingReading" AND "rolloverValue" IS NULL)
    )
    AND "calculatedVolumeM3" = round(
      (
        CASE
          WHEN "isReset" OR "closingReading" < "openingReading"
            THEN ("rolloverValue" - "openingReading") + "closingReading"
          ELSE "closingReading" - "openingReading"
        END
      ) * "multiplier" * (
        CASE "meterUnit"
          WHEN 'm3' THEN 1::numeric
          WHEN 'litres' THEN 0.001::numeric
          WHEN 'gallons' THEN 0.00378541::numeric
        END
      ),
      2
    )
    AND "coverageHours" > 0
    AND abs("coverageHours" - (extract(epoch from ("closingTimestamp" - "openingTimestamp")) / 3600.0)::numeric) <= 0.01
  ),
  CONSTRAINT "water_prod_int_status" CHECK (
    "status" IN ('entered', 'flagged', 'verified', 'void')
    AND (
      ("status" = 'verified' AND "verifiedById" IS NOT NULL AND "verifiedAt" IS NOT NULL AND "verifiedById" <> "recordedById")
      OR ("status" <> 'verified' AND "verifiedById" IS NULL AND "verifiedAt" IS NULL)
    )
  ),
  CONSTRAINT "water_prod_int_values" CHECK (
    "version" > 0
    AND btrim("meterRef") <> ''
    AND "meterUnit" IN ('m3', 'litres', 'gallons')
    AND "openingReading" >= 0 AND "openingReading"::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND "closingReading" >= 0 AND "closingReading"::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND "multiplier" > 0 AND "multiplier"::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND ("rolloverValue" IS NULL OR ("rolloverValue" >= 0 AND "rolloverValue"::text NOT IN ('NaN', 'Infinity', '-Infinity')))
    AND "coverageHours"::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND "requestKey" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND "requestFingerprint" ~ '^[0-9a-f]{64}$'
  )
);

CREATE TABLE IF NOT EXISTS "water_production_electricity" (
  "id" text PRIMARY KEY NOT NULL,
  "schemeId" text NOT NULL,
  "assetId" text NOT NULL,
  "openingReadingKwh" numeric(12, 2) NOT NULL,
  "openingTimestamp" timestamp NOT NULL,
  "closingReadingKwh" numeric(12, 2) NOT NULL,
  "closingTimestamp" timestamp NOT NULL,
  "multiplier" numeric(6, 2) DEFAULT '1.00' NOT NULL,
  "rolloverValueKwh" numeric(12, 2),
  "isReset" boolean DEFAULT false NOT NULL,
  "calculatedConsumedKwh" numeric(12, 2) NOT NULL,
  "pumpOperatingHours" numeric(8, 2),
  "electricityCostUgx" numeric(12, 2),
  "coverageStartDate" date NOT NULL,
  "coverageEndDate" date NOT NULL,
  "isCrossMonth" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'entered' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "recordedById" text NOT NULL,
  "verifiedById" text,
  "verifiedAt" timestamp,
  "requestKey" text NOT NULL,
  "requestFingerprint" text NOT NULL,
  "notes" text,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "water_prod_elec_cons" CHECK (
    "calculatedConsumedKwh" >= 0
    AND "calculatedConsumedKwh"::text NOT IN ('NaN', 'Infinity', '-Infinity')
  ),
  CONSTRAINT "water_prod_elec_dates" CHECK (
    "closingTimestamp" > "openingTimestamp"
    AND "coverageEndDate" >= "coverageStartDate"
    AND "coverageStartDate" = (("openingTimestamp" + interval '3 hours')::date)
    AND "coverageEndDate" = GREATEST(
      (("openingTimestamp" + interval '3 hours')::date),
      ((("closingTimestamp" - interval '1 millisecond') + interval '3 hours')::date)
    )
    AND "isCrossMonth" = (to_char("coverageStartDate", 'YYYY-MM') <> to_char("coverageEndDate", 'YYYY-MM'))
  ),
  CONSTRAINT "water_prod_elec_reconciliation" CHECK (
    (
      (("isReset" OR "closingReadingKwh" < "openingReadingKwh") AND "rolloverValueKwh" IS NOT NULL AND "rolloverValueKwh" >= "openingReadingKwh")
      OR (NOT "isReset" AND "closingReadingKwh" >= "openingReadingKwh" AND "rolloverValueKwh" IS NULL)
    )
    AND "calculatedConsumedKwh" = round(
      (
        CASE
          WHEN "isReset" OR "closingReadingKwh" < "openingReadingKwh"
            THEN ("rolloverValueKwh" - "openingReadingKwh") + "closingReadingKwh"
          ELSE "closingReadingKwh" - "openingReadingKwh"
        END
      ) * "multiplier",
      2
    )
  ),
  CONSTRAINT "water_prod_elec_status" CHECK (
    "status" IN ('entered', 'flagged', 'verified', 'void')
    AND (
      ("status" = 'verified' AND "verifiedById" IS NOT NULL AND "verifiedAt" IS NOT NULL AND "verifiedById" <> "recordedById")
      OR ("status" <> 'verified' AND "verifiedById" IS NULL AND "verifiedAt" IS NULL)
    )
  ),
  CONSTRAINT "water_prod_elec_values" CHECK (
    "version" > 0
    AND "openingReadingKwh" >= 0 AND "openingReadingKwh"::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND "closingReadingKwh" >= 0 AND "closingReadingKwh"::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND "multiplier" > 0 AND "multiplier"::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND ("rolloverValueKwh" IS NULL OR ("rolloverValueKwh" >= 0 AND "rolloverValueKwh"::text NOT IN ('NaN', 'Infinity', '-Infinity')))
    AND ("pumpOperatingHours" IS NULL OR ("pumpOperatingHours" >= 0 AND "pumpOperatingHours"::text NOT IN ('NaN', 'Infinity', '-Infinity')))
    AND ("electricityCostUgx" IS NULL OR ("electricityCostUgx" >= 0 AND "electricityCostUgx"::text NOT IN ('NaN', 'Infinity', '-Infinity')))
    AND "requestKey" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND "requestFingerprint" ~ '^[0-9a-f]{64}$'
  )
);

CREATE TABLE IF NOT EXISTS "water_production_fuel" (
  "id" text PRIMARY KEY NOT NULL,
  "schemeId" text NOT NULL,
  "assetId" text NOT NULL,
  "fuelType" text DEFAULT 'diesel' NOT NULL,
  "openingStockLitres" numeric(10, 2),
  "fuelPurchasedLitres" numeric(10, 2) DEFAULT '0' NOT NULL,
  "fuelTransfersInLitres" numeric(10, 2) DEFAULT '0' NOT NULL,
  "fuelTransfersOutLitres" numeric(10, 2) DEFAULT '0' NOT NULL,
  "fuelAdjustmentsLitres" numeric(10, 2) DEFAULT '0' NOT NULL,
  "closingStockLitres" numeric(10, 2),
  "calculatedConsumedLitres" numeric(10, 2),
  "generatorOperatingHours" numeric(8, 2),
  "fuelExpenditureUgx" numeric(12, 2),
  "coverageStartDate" date NOT NULL,
  "coverageEndDate" date NOT NULL,
  "isCrossMonth" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'entered' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "recordedById" text NOT NULL,
  "verifiedById" text,
  "verifiedAt" timestamp,
  "requestKey" text NOT NULL,
  "requestFingerprint" text NOT NULL,
  "notes" text,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "water_prod_fuel_cons" CHECK (
    "calculatedConsumedLitres" IS NULL
    OR ("calculatedConsumedLitres" >= 0 AND "calculatedConsumedLitres"::text NOT IN ('NaN', 'Infinity', '-Infinity'))
  ),
  CONSTRAINT "water_prod_fuel_dates" CHECK (
    "coverageEndDate" >= "coverageStartDate"
    AND "isCrossMonth" = (to_char("coverageStartDate", 'YYYY-MM') <> to_char("coverageEndDate", 'YYYY-MM'))
  ),
  CONSTRAINT "water_prod_fuel_reconciliation" CHECK (
    (("openingStockLitres" IS NULL) = ("closingStockLitres" IS NULL))
    AND (
      ("openingStockLitres" IS NULL AND "closingStockLitres" IS NULL AND "calculatedConsumedLitres" IS NULL)
      OR (
        "openingStockLitres" IS NOT NULL
        AND "closingStockLitres" IS NOT NULL
        AND "calculatedConsumedLitres" IS NOT NULL
        AND "calculatedConsumedLitres" = round(
          "openingStockLitres"
          + "fuelPurchasedLitres"
          + "fuelTransfersInLitres"
          - "fuelTransfersOutLitres"
          + "fuelAdjustmentsLitres"
          - "closingStockLitres",
          2
        )
      )
    )
  ),
  CONSTRAINT "water_prod_fuel_status" CHECK (
    "status" IN ('entered', 'flagged', 'verified', 'void')
    AND (
      ("status" = 'verified' AND "verifiedById" IS NOT NULL AND "verifiedAt" IS NOT NULL AND "verifiedById" <> "recordedById")
      OR ("status" <> 'verified' AND "verifiedById" IS NULL AND "verifiedAt" IS NULL)
    )
  ),
  CONSTRAINT "water_prod_fuel_values" CHECK (
    "version" > 0
    AND "fuelType" IN ('diesel', 'petrol')
    AND ("openingStockLitres" IS NULL OR ("openingStockLitres" >= 0 AND "openingStockLitres"::text NOT IN ('NaN', 'Infinity', '-Infinity')))
    AND "fuelPurchasedLitres" >= 0 AND "fuelPurchasedLitres"::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND "fuelTransfersInLitres" >= 0 AND "fuelTransfersInLitres"::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND "fuelTransfersOutLitres" >= 0 AND "fuelTransfersOutLitres"::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND "fuelAdjustmentsLitres" >= 0 AND "fuelAdjustmentsLitres"::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND ("closingStockLitres" IS NULL OR ("closingStockLitres" >= 0 AND "closingStockLitres"::text NOT IN ('NaN', 'Infinity', '-Infinity')))
    AND (
      "generatorOperatingHours" IS NULL
      OR (
        "generatorOperatingHours" >= 0
        AND "generatorOperatingHours"::text NOT IN ('NaN', 'Infinity', '-Infinity')
        AND "generatorOperatingHours" <= (("coverageEndDate" - "coverageStartDate" + 1)::numeric * 24)
      )
    )
    AND ("fuelExpenditureUgx" IS NULL OR ("fuelExpenditureUgx" >= 0 AND "fuelExpenditureUgx"::text NOT IN ('NaN', 'Infinity', '-Infinity')))
    AND "requestKey" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND "requestFingerprint" ~ '^[0-9a-f]{64}$'
  )
);

-- Composite uniqueness on energy assets enables cross-scheme foreign key prevention.
CREATE UNIQUE INDEX IF NOT EXISTS "energy_asset_id_scheme_unq" ON "water_scheme_energy_asset" USING btree ("id", "schemeId");
CREATE UNIQUE INDEX IF NOT EXISTS "energy_asset_scheme_type_ref_unq" ON "water_scheme_energy_asset" USING btree ("schemeId", "assetType", "assetRef");
CREATE INDEX IF NOT EXISTS "water_scheme_energy_asset_scheme_idx" ON "water_scheme_energy_asset" USING btree ("schemeId");

CREATE UNIQUE INDEX IF NOT EXISTS "energy_asset_assignment_unq" ON "energy_asset_assignment" USING btree ("assetId", "sourceId");
CREATE INDEX IF NOT EXISTS "energy_asset_assignment_scheme_idx" ON "energy_asset_assignment" USING btree ("schemeId");

CREATE UNIQUE INDEX IF NOT EXISTS "water_prod_int_request_unq" ON "water_production_interval" USING btree ("recordedById", "requestKey");
CREATE INDEX IF NOT EXISTS "water_production_interval_scheme_idx" ON "water_production_interval" USING btree ("schemeId", "sourceId");
CREATE INDEX IF NOT EXISTS "water_production_interval_dates_idx" ON "water_production_interval" USING btree ("coverageStartDate", "coverageEndDate");

CREATE UNIQUE INDEX IF NOT EXISTS "water_prod_elec_request_unq" ON "water_production_electricity" USING btree ("recordedById", "requestKey");
CREATE INDEX IF NOT EXISTS "water_prod_elec_dates_idx" ON "water_production_electricity" USING btree ("assetId", "coverageStartDate", "coverageEndDate");

CREATE UNIQUE INDEX IF NOT EXISTS "water_prod_fuel_request_unq" ON "water_production_fuel" USING btree ("recordedById", "requestKey");
CREATE INDEX IF NOT EXISTS "water_prod_fuel_dates_idx" ON "water_production_fuel" USING btree ("assetId", "coverageStartDate", "coverageEndDate");

-- Foreign keys (single-column and composite scheme-integrity constraints; search_path-relative).
DO $$ BEGIN
  ALTER TABLE "water_scheme_energy_asset"
    ADD CONSTRAINT "water_scheme_energy_asset_schemeId_water_scheme_id_fk"
    FOREIGN KEY ("schemeId") REFERENCES "water_scheme"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "energy_asset_assignment"
    ADD CONSTRAINT "energy_asset_assignment_schemeId_water_scheme_id_fk"
    FOREIGN KEY ("schemeId") REFERENCES "water_scheme"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "energy_asset_assignment"
    ADD CONSTRAINT "energy_asset_assignment_asset_scheme_fk"
    FOREIGN KEY ("assetId", "schemeId") REFERENCES "water_scheme_energy_asset"("id", "schemeId") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "energy_asset_assignment"
    ADD CONSTRAINT "energy_asset_assignment_source_scheme_fk"
    FOREIGN KEY ("sourceId", "schemeId") REFERENCES "water_scheme_source"("id", "schemeId") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "water_production_interval"
    ADD CONSTRAINT "water_production_interval_schemeId_water_scheme_id_fk"
    FOREIGN KEY ("schemeId") REFERENCES "water_scheme"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "water_production_interval"
    ADD CONSTRAINT "water_production_interval_source_scheme_fk"
    FOREIGN KEY ("sourceId", "schemeId") REFERENCES "water_scheme_source"("id", "schemeId") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "water_production_interval"
    ADD CONSTRAINT "water_production_interval_recordedById_user_id_fk"
    FOREIGN KEY ("recordedById") REFERENCES "user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "water_production_interval"
    ADD CONSTRAINT "water_production_interval_verifiedById_user_id_fk"
    FOREIGN KEY ("verifiedById") REFERENCES "user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "water_production_electricity"
    ADD CONSTRAINT "water_production_electricity_schemeId_water_scheme_id_fk"
    FOREIGN KEY ("schemeId") REFERENCES "water_scheme"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "water_production_electricity"
    ADD CONSTRAINT "water_production_electricity_asset_scheme_fk"
    FOREIGN KEY ("assetId", "schemeId") REFERENCES "water_scheme_energy_asset"("id", "schemeId") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "water_production_electricity"
    ADD CONSTRAINT "water_production_electricity_recordedById_user_id_fk"
    FOREIGN KEY ("recordedById") REFERENCES "user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "water_production_electricity"
    ADD CONSTRAINT "water_production_electricity_verifiedById_user_id_fk"
    FOREIGN KEY ("verifiedById") REFERENCES "user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "water_production_fuel"
    ADD CONSTRAINT "water_production_fuel_schemeId_water_scheme_id_fk"
    FOREIGN KEY ("schemeId") REFERENCES "water_scheme"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "water_production_fuel"
    ADD CONSTRAINT "water_production_fuel_asset_scheme_fk"
    FOREIGN KEY ("assetId", "schemeId") REFERENCES "water_scheme_energy_asset"("id", "schemeId") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "water_production_fuel"
    ADD CONSTRAINT "water_production_fuel_recordedById_user_id_fk"
    FOREIGN KEY ("recordedById") REFERENCES "user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "water_production_fuel"
    ADD CONSTRAINT "water_production_fuel_verifiedById_user_id_fk"
    FOREIGN KEY ("verifiedById") REFERENCES "user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Energy asset identity guard (prevents reparenting across schemes or mutating assetType).
CREATE OR REPLACE FUNCTION guard_production_energy_asset()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW."schemeId" <> OLD."schemeId" OR NEW."assetType" <> OLD."assetType" THEN
    RAISE EXCEPTION 'Energy asset identity, scheme and type cannot be changed';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS production_energy_asset_guard ON water_scheme_energy_asset;
CREATE TRIGGER production_energy_asset_guard
  BEFORE UPDATE ON water_scheme_energy_asset
  FOR EACH ROW
  EXECUTE FUNCTION guard_production_energy_asset();

-- History, optimistic version, transition matrix, and measurement immutability guard (parity with 0069).
CREATE OR REPLACE FUNCTION guard_production_measurement_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Production history cannot be deleted';
  END IF;
  IF NEW.id <> OLD.id OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Production identity is immutable';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'Production version conflict';
  END IF;
  IF OLD.status = 'void' THEN
    RAISE EXCEPTION 'Void production is terminal';
  END IF;
  IF ROW(NEW."requestKey", NEW."requestFingerprint", NEW."recordedById", NEW."schemeId")
     IS DISTINCT FROM ROW(OLD."requestKey", OLD."requestFingerprint", OLD."recordedById", OLD."schemeId") THEN
    RAISE EXCEPTION 'Production identity is immutable';
  END IF;
  IF (to_jsonb(NEW) -> 'sourceId') IS DISTINCT FROM (to_jsonb(OLD) -> 'sourceId')
     OR (to_jsonb(NEW) -> 'assetId') IS DISTINCT FROM (to_jsonb(OLD) -> 'assetId') THEN
    RAISE EXCEPTION 'Production identity is immutable';
  END IF;
  IF NOT (
    (OLD.status IN ('entered', 'flagged') AND NEW.status IN ('entered', 'flagged', 'void'))
    OR (OLD.status = 'entered' AND NEW.status = 'verified')
    OR (OLD.status = 'verified' AND NEW.status IN ('flagged', 'void'))
  ) THEN
    RAISE EXCEPTION 'Invalid production transition';
  END IF;
  IF (
    OLD.status = 'verified'
    OR NEW.status IN ('verified', 'void')
    OR (NEW.status = 'flagged' AND OLD.status <> 'flagged')
  ) AND (
    (to_jsonb(NEW) - ARRAY['status', 'verifiedById', 'verifiedAt', 'version', 'updatedAt'])
    IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['status', 'verifiedById', 'verifiedAt', 'version', 'updatedAt'])
  ) THEN
    RAISE EXCEPTION 'Review transitions cannot edit measurements';
  END IF;
  RETURN NEW;
END $$;

-- Asset-type compatibility and elapsed-duration / supported-asset operating-hour validation.
CREATE OR REPLACE FUNCTION guard_production_electricity_asset_and_hours()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_asset_type text;
  v_supported_units integer;
  v_elapsed_hours numeric;
BEGIN
  SELECT "assetType"
    INTO v_asset_type
    FROM water_scheme_energy_asset
   WHERE id = NEW."assetId" AND "schemeId" = NEW."schemeId";

  IF v_asset_type IS NULL THEN
    RAISE EXCEPTION 'Energy asset does not belong to this scheme' USING ERRCODE = '23503';
  END IF;
  IF v_asset_type <> 'electricity_meter' THEN
    RAISE EXCEPTION 'Electricity consumption can only be recorded against an electricity_meter asset' USING ERRCODE = '23514';
  END IF;
  IF NEW."pumpOperatingHours" IS NOT NULL THEN
    SELECT GREATEST(1, COUNT(*)::int)
      INTO v_supported_units
      FROM energy_asset_assignment
     WHERE "assetId" = NEW."assetId" AND "schemeId" = NEW."schemeId";
    v_elapsed_hours := (EXTRACT(EPOCH FROM (NEW."closingTimestamp" - NEW."openingTimestamp")) / 3600.0)::numeric;
    IF NEW."pumpOperatingHours" > round(v_elapsed_hours * v_supported_units, 2) + 0.01 THEN
      RAISE EXCEPTION 'Pump operating hours (%) exceed elapsed interval duration (% h) across % supported unit(s)',
        NEW."pumpOperatingHours", round(v_elapsed_hours, 2), v_supported_units
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION guard_production_fuel_asset_type()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_asset_type text;
  v_asset_fuel text;
BEGIN
  SELECT "assetType", "fuelType"
    INTO v_asset_type, v_asset_fuel
    FROM water_scheme_energy_asset
   WHERE id = NEW."assetId" AND "schemeId" = NEW."schemeId";

  IF v_asset_type IS NULL THEN
    RAISE EXCEPTION 'Energy asset does not belong to this scheme' USING ERRCODE = '23503';
  END IF;
  IF v_asset_type <> 'generator' THEN
    RAISE EXCEPTION 'Fuel consumption can only be recorded against a generator asset' USING ERRCODE = '23514';
  END IF;
  IF v_asset_fuel IS NOT NULL AND NEW."fuelType" <> v_asset_fuel THEN
    RAISE EXCEPTION 'Fuel type (%) does not match generator configured fuel type (%)', NEW."fuelType", v_asset_fuel
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $$;

-- Concurrency-safe interval overlap guards (serialised per source/asset via transaction advisory lock).
CREATE OR REPLACE FUNCTION guard_production_interval_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'void' THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('water_production_interval:' || NEW."sourceId", 0));
  IF EXISTS (
    SELECT 1 FROM water_production_interval e
    WHERE e."sourceId" = NEW."sourceId"
      AND e.id <> NEW.id
      AND e.status <> 'void'
      AND e."openingTimestamp" < NEW."closingTimestamp"
      AND e."closingTimestamp" > NEW."openingTimestamp"
  ) THEN
    RAISE EXCEPTION 'Water meter interval overlaps an existing non-void interval on source %', NEW."sourceId"
      USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION guard_production_electricity_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'void' THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('water_production_electricity:' || NEW."assetId", 0));
  IF EXISTS (
    SELECT 1 FROM water_production_electricity e
    WHERE e."assetId" = NEW."assetId"
      AND e.id <> NEW.id
      AND e.status <> 'void'
      AND e."openingTimestamp" < NEW."closingTimestamp"
      AND e."closingTimestamp" > NEW."openingTimestamp"
  ) THEN
    RAISE EXCEPTION 'Electricity meter interval overlaps an existing non-void interval on asset %', NEW."assetId"
      USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION guard_production_fuel_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Purchase-only records (calculatedConsumedLitres IS NULL) do not claim stock-reconciled consumption over a period.
  IF NEW.status = 'void' OR NEW."calculatedConsumedLitres" IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('water_production_fuel:' || NEW."assetId", 0));
  IF EXISTS (
    SELECT 1 FROM water_production_fuel e
    WHERE e."assetId" = NEW."assetId"
      AND e.id <> NEW.id
      AND e.status <> 'void'
      AND e."calculatedConsumedLitres" IS NOT NULL
      AND e."coverageStartDate" <= NEW."coverageEndDate"
      AND e."coverageEndDate" >= NEW."coverageStartDate"
  ) THEN
    RAISE EXCEPTION 'Fuel stock reconciliation period overlaps an existing non-void period on generator %', NEW."assetId"
      USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END $$;

-- Clean up any draft trigger names before installing deterministically ordered triggers (01..04).
DROP TRIGGER IF EXISTS production_interval_self_approval_guard ON water_production_interval;
DROP TRIGGER IF EXISTS production_electricity_self_approval_guard ON water_production_electricity;
DROP TRIGGER IF EXISTS production_fuel_self_approval_guard ON water_production_fuel;

DROP TRIGGER IF EXISTS production_01_interval_self_approval_guard ON water_production_interval;
CREATE TRIGGER production_01_interval_self_approval_guard
  BEFORE INSERT OR UPDATE ON water_production_interval
  FOR EACH ROW
  EXECUTE FUNCTION guard_production_universal_self_approval();

DROP TRIGGER IF EXISTS production_02_interval_row_guard ON water_production_interval;
CREATE TRIGGER production_02_interval_row_guard
  BEFORE UPDATE OR DELETE ON water_production_interval
  FOR EACH ROW
  EXECUTE FUNCTION guard_production_measurement_row();

DROP TRIGGER IF EXISTS production_04_interval_overlap_guard ON water_production_interval;
CREATE TRIGGER production_04_interval_overlap_guard
  BEFORE INSERT OR UPDATE ON water_production_interval
  FOR EACH ROW
  EXECUTE FUNCTION guard_production_interval_overlap();

DROP TRIGGER IF EXISTS production_01_electricity_self_approval_guard ON water_production_electricity;
CREATE TRIGGER production_01_electricity_self_approval_guard
  BEFORE INSERT OR UPDATE ON water_production_electricity
  FOR EACH ROW
  EXECUTE FUNCTION guard_production_universal_self_approval();

DROP TRIGGER IF EXISTS production_02_electricity_row_guard ON water_production_electricity;
CREATE TRIGGER production_02_electricity_row_guard
  BEFORE UPDATE OR DELETE ON water_production_electricity
  FOR EACH ROW
  EXECUTE FUNCTION guard_production_measurement_row();

DROP TRIGGER IF EXISTS production_03_electricity_asset_guard ON water_production_electricity;
CREATE TRIGGER production_03_electricity_asset_guard
  BEFORE INSERT OR UPDATE ON water_production_electricity
  FOR EACH ROW
  EXECUTE FUNCTION guard_production_electricity_asset_and_hours();

DROP TRIGGER IF EXISTS production_04_electricity_overlap_guard ON water_production_electricity;
CREATE TRIGGER production_04_electricity_overlap_guard
  BEFORE INSERT OR UPDATE ON water_production_electricity
  FOR EACH ROW
  EXECUTE FUNCTION guard_production_electricity_overlap();

DROP TRIGGER IF EXISTS production_01_fuel_self_approval_guard ON water_production_fuel;
CREATE TRIGGER production_01_fuel_self_approval_guard
  BEFORE INSERT OR UPDATE ON water_production_fuel
  FOR EACH ROW
  EXECUTE FUNCTION guard_production_universal_self_approval();

DROP TRIGGER IF EXISTS production_02_fuel_row_guard ON water_production_fuel;
CREATE TRIGGER production_02_fuel_row_guard
  BEFORE UPDATE OR DELETE ON water_production_fuel
  FOR EACH ROW
  EXECUTE FUNCTION guard_production_measurement_row();

DROP TRIGGER IF EXISTS production_03_fuel_asset_guard ON water_production_fuel;
CREATE TRIGGER production_03_fuel_asset_guard
  BEFORE INSERT OR UPDATE ON water_production_fuel
  FOR EACH ROW
  EXECUTE FUNCTION guard_production_fuel_asset_type();

DROP TRIGGER IF EXISTS production_04_fuel_overlap_guard ON water_production_fuel;
CREATE TRIGGER production_04_fuel_overlap_guard
  BEFORE INSERT OR UPDATE ON water_production_fuel
  FOR EACH ROW
  EXECUTE FUNCTION guard_production_fuel_overlap();

COMMIT;
