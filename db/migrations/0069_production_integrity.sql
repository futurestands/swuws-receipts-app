-- Additive production model. Never run against a business database without preflight/approval.
-- Existing measurements are retained as workflowVersion 0; never auto-verified.
ALTER TABLE water_scheme_source ADD COLUMN IF NOT EXISTS "capacityMethod" text NOT NULL DEFAULT 'unknown';
ALTER TABLE water_scheme_source ADD COLUMN IF NOT EXISTS "capacityConfirmedAt" timestamp;
ALTER TABLE water_scheme_source ADD COLUMN IF NOT EXISTS "capacityConfirmedById" text REFERENCES "user"(id) ON DELETE RESTRICT;
ALTER TABLE water_scheme_source ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE water_production_log ADD COLUMN IF NOT EXISTS "productionDate" date;
ALTER TABLE water_production_log ADD COLUMN IF NOT EXISTS "workflowVersion" smallint NOT NULL DEFAULT 0;
ALTER TABLE water_production_log ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE water_production_log ADD COLUMN IF NOT EXISTS "requestKey" text;
ALTER TABLE water_production_log ADD COLUMN IF NOT EXISTS "requestFingerprint" text;
ALTER TABLE water_production_log ADD COLUMN IF NOT EXISTS "verifiedAt" timestamp;
ALTER TABLE water_production_log ADD COLUMN IF NOT EXISTS "verifiedById" text REFERENCES "user"(id) ON DELETE RESTRICT;
ALTER TABLE water_production_log ALTER COLUMN "waterSuppliedM3" DROP DEFAULT;
-- Unknown configuration is NULL on new writes; retain old values verbatim.
ALTER TABLE water_scheme_source ALTER COLUMN "installedPumpCapacityM3Hr" DROP DEFAULT;
ALTER TABLE water_scheme_source ALTER COLUMN "regimeHoursPerDay" DROP DEFAULT;
ALTER TABLE water_scheme_source ALTER COLUMN "containerVolumeLitres" DROP DEFAULT;
ALTER TABLE water_scheme_source ALTER COLUMN "averageFillTimeSeconds" DROP DEFAULT;
ALTER TABLE water_scheme_source ALTER COLUMN "currentCapacityM3Day" DROP DEFAULT;
ALTER TABLE water_scheme_source ALTER COLUMN "practicalCapacityM3Month" DROP DEFAULT;

CREATE UNIQUE INDEX IF NOT EXISTS production_source_id_scheme_unq ON water_scheme_source(id, "schemeId");
CREATE UNIQUE INDEX IF NOT EXISTS production_source_day_unq ON water_production_log("sourceId", "productionDate") WHERE "workflowVersion" = 1 AND status <> 'void';
CREATE UNIQUE INDEX IF NOT EXISTS production_request_unq ON water_production_log("recordedById", "requestKey") WHERE "requestKey" IS NOT NULL;
CREATE INDEX IF NOT EXISTS production_scheme_date_status_idx ON water_production_log("schemeId", "productionDate", status);

-- Replace unsafe cascade/SET NULL behaviour with history-preserving restrictions.
ALTER TABLE water_production_log DROP CONSTRAINT IF EXISTS "water_production_log_sourceId_fkey";
ALTER TABLE water_production_log DROP CONSTRAINT IF EXISTS "water_production_log_schemeId_fkey";
ALTER TABLE water_production_log DROP CONSTRAINT IF EXISTS "water_production_log_billingPeriodId_fkey";
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='water_production_log'::regclass AND conname='production_source_scheme_fk') THEN
  ALTER TABLE water_production_log ADD CONSTRAINT production_source_scheme_fk FOREIGN KEY ("sourceId", "schemeId") REFERENCES water_scheme_source(id,"schemeId") ON DELETE RESTRICT NOT VALID;
 END IF;
 ALTER TABLE water_production_log ADD CONSTRAINT "water_production_log_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES water_scheme(id) ON DELETE RESTRICT NOT VALID;
  ALTER TABLE water_production_log ADD CONSTRAINT "water_production_log_billingPeriodId_fkey" FOREIGN KEY ("billingPeriodId") REFERENCES billing_period(id) ON DELETE RESTRICT NOT VALID;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='water_production_log'::regclass AND conname='production_workflow_shape') THEN
  ALTER TABLE water_production_log ADD CONSTRAINT production_workflow_shape CHECK (
    "workflowVersion" IN (0,1) AND version > 0 AND ("workflowVersion" = 0 OR
    ("productionDate" IS NOT NULL AND "sourceId" IS NOT NULL AND "recordedById" IS NOT NULL AND
     "requestKey" IS NOT NULL AND "requestKey" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND
     "requestFingerprint" IS NOT NULL AND "requestFingerprint" ~ '^[0-9a-f]{64}$'))) NOT VALID;
  ALTER TABLE water_production_log ADD CONSTRAINT production_values CHECK (
    "waterProducedM3" >= 0 AND "waterProducedM3"::text NOT IN ('NaN','Infinity','-Infinity') AND
    ("waterSuppliedM3" IS NULL OR ("waterSuppliedM3" >= 0 AND "waterSuppliedM3"::text NOT IN ('NaN','Infinity','-Infinity'))) AND
    ("operatingHours" IS NULL OR ("operatingHours" BETWEEN 0 AND 24 AND "operatingHours"::text NOT IN ('NaN','Infinity','-Infinity')))) NOT VALID;
  ALTER TABLE water_production_log ADD CONSTRAINT production_state CHECK (
    status IN ('entered','flagged','verified','void') AND ("workflowVersion" = 0 OR
    ((status = 'verified' AND "verifiedById" IS NOT NULL AND "verifiedAt" IS NOT NULL AND "verifiedById" <> "recordedById") OR
     (status <> 'verified' AND "verifiedById" IS NULL AND "verifiedAt" IS NULL)))) NOT VALID;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='water_scheme_source'::regclass AND conname='production_source_values') THEN
  ALTER TABLE water_scheme_source ADD CONSTRAINT production_source_values CHECK (
   version > 0 AND technology IN ('gravity','pumped_grid','pumped_solar','pumped_generator','hybrid') AND
   "capacityMethod" IN ('unknown','measured_hourly','bucket_test') AND
   ("installedPumpCapacityM3Hr" IS NULL OR ("installedPumpCapacityM3Hr" >= 0 AND "installedPumpCapacityM3Hr"::text NOT IN ('NaN','Infinity','-Infinity'))) AND
   ("regimeHoursPerDay" IS NULL OR ("regimeHoursPerDay" BETWEEN 0 AND 24 AND "regimeHoursPerDay"::text NOT IN ('NaN','Infinity','-Infinity'))) AND
   ("containerVolumeLitres" IS NULL OR ("containerVolumeLitres" >= 0 AND "containerVolumeLitres"::text NOT IN ('NaN','Infinity','-Infinity'))) AND
   ("averageFillTimeSeconds" IS NULL OR ("averageFillTimeSeconds" >= 0 AND "averageFillTimeSeconds"::text NOT IN ('NaN','Infinity','-Infinity'))) AND
   ("currentCapacityM3Day" IS NULL OR ("currentCapacityM3Day" >= 0 AND "currentCapacityM3Day"::text NOT IN ('NaN','Infinity','-Infinity'))) AND
   ("productionCapacityLSec" IS NULL OR ("productionCapacityLSec" >= 0 AND "productionCapacityLSec"::text NOT IN ('NaN','Infinity','-Infinity'))) AND
   ("practicalCapacityM3Month" IS NULL OR ("practicalCapacityM3Month" >= 0 AND "practicalCapacityM3Month"::text NOT IN ('NaN','Infinity','-Infinity'))) AND
   ("capacityConfirmedAt" IS NULL OR ("capacityConfirmedById" IS NOT NULL AND
    (("capacityMethod" = 'unknown') OR ("capacityMethod" = 'measured_hourly' AND "installedPumpCapacityM3Hr" IS NOT NULL) OR
    ("capacityMethod" = 'bucket_test' AND "containerVolumeLitres" IS NOT NULL AND "averageFillTimeSeconds" IS NOT NULL AND "containerVolumeLitres" > 0 AND "averageFillTimeSeconds" > 0))))) NOT VALID;
 END IF;
END $$;
-- Fail rather than transform incompatible historic rows. Runner transaction rolls back.
ALTER TABLE water_production_log VALIDATE CONSTRAINT production_source_scheme_fk;
ALTER TABLE water_production_log VALIDATE CONSTRAINT "water_production_log_schemeId_fkey";
ALTER TABLE water_production_log VALIDATE CONSTRAINT "water_production_log_billingPeriodId_fkey";
ALTER TABLE water_production_log VALIDATE CONSTRAINT production_workflow_shape;
ALTER TABLE water_production_log VALIDATE CONSTRAINT production_values;
ALTER TABLE water_production_log VALIDATE CONSTRAINT production_state;
ALTER TABLE water_scheme_source VALIDATE CONSTRAINT production_source_values;

CREATE OR REPLACE FUNCTION guard_production_log() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Production history cannot be deleted'; END IF;
 IF NEW.id <> OLD.id OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN RAISE EXCEPTION 'Production identity is immutable'; END IF;
 IF NEW.version <> OLD.version + 1 THEN RAISE EXCEPTION 'Production version conflict'; END IF;
 IF OLD.status = 'void' THEN RAISE EXCEPTION 'Void production is terminal'; END IF;
 IF OLD."workflowVersion" = 1 AND (NEW."workflowVersion" <> 1 OR
  ROW(NEW."requestKey",NEW."requestFingerprint",NEW."recordedById",NEW."schemeId",NEW."sourceId",NEW."productionDate",NEW."logDate") IS DISTINCT FROM
  ROW(OLD."requestKey",OLD."requestFingerprint",OLD."recordedById",OLD."schemeId",OLD."sourceId",OLD."productionDate",OLD."logDate")) THEN
  RAISE EXCEPTION 'Production identity is immutable';
 END IF;
 IF NOT ((OLD.status IN ('entered','flagged') AND NEW.status IN ('entered','flagged','void')) OR
  (OLD.status = 'entered' AND NEW.status = 'verified') OR
  (OLD.status = 'verified' AND NEW.status IN ('flagged','void'))) THEN RAISE EXCEPTION 'Invalid production transition'; END IF;
 IF (OLD.status = 'verified' OR NEW.status IN ('verified','void') OR (NEW.status = 'flagged' AND OLD.status <> 'flagged')) AND
  ROW(NEW."waterProducedM3",NEW."waterSuppliedM3",NEW."operatingHours",NEW.notes,NEW."billingPeriodId") IS DISTINCT FROM
  ROW(OLD."waterProducedM3",OLD."waterSuppliedM3",OLD."operatingHours",OLD.notes,OLD."billingPeriodId") THEN
  RAISE EXCEPTION 'Review transitions cannot edit measurements';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS production_log_guard ON water_production_log;
CREATE TRIGGER production_log_guard BEFORE UPDATE OR DELETE ON water_production_log FOR EACH ROW EXECUTE FUNCTION guard_production_log();

CREATE OR REPLACE FUNCTION guard_production_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.version <> OLD.version + 1 THEN RAISE EXCEPTION 'Source version conflict'; END IF;
 IF NEW.id <> OLD.id OR NEW."schemeId" <> OLD."schemeId" THEN RAISE EXCEPTION 'Source cannot be reparented'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS production_source_guard ON water_scheme_source;
CREATE TRIGGER production_source_guard BEFORE UPDATE ON water_scheme_source FOR EACH ROW EXECUTE FUNCTION guard_production_source();
