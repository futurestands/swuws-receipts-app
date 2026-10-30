-- REVIEW DRAFT ONLY. Not registered with db/migrate.js. No business database use.
-- Requires existing SWUWS migrations through 0072. Run in one transaction.
-- No UPDATE/DELETE or data initialization of existing tables.
CREATE FUNCTION engineering_capacity_number_ok(n numeric) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
 SELECT n IS NULL OR (n >= 0 AND n::text NOT IN ('NaN','Infinity','-Infinity'))
$$;

CREATE TABLE source_capacity_assessment (
 id text PRIMARY KEY,
 "sourceId" text NOT NULL,
 "schemeId" text NOT NULL,
 "sourceVersion" integer NOT NULL CHECK ("sourceVersion" > 0),
 "assessmentKind" text NOT NULL CHECK ("assessmentKind" IN ('legacy_snapshot','new_assessment')),
 "supersedesId" text UNIQUE,
 methodology text NOT NULL CHECK (length(trim(methodology)) > 0),
 "methodologyVersion" text NOT NULL,
 "assessedAt" timestamptz,
 "effectiveFrom" date,
 "recordedAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
 "responsibleOfficerId" text REFERENCES "user"(id) ON DELETE RESTRICT,
 "capturedById" text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 "recordedInstalledPumpCapacityM3Hr" numeric,
 "measuredCapacityM3Hr" numeric,
 "regimeHoursPerDay" numeric,
 "capacityM3Day" numeric,
 "benchmarkCapacityM3Month" numeric,
 "benchmarkDays" integer CHECK ("benchmarkDays" > 0),
 "sourceWasActive" boolean NOT NULL,
 assumptions jsonb NOT NULL CHECK (jsonb_typeof(assumptions) = 'object'),
 provenance jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object' AND provenance <> '{}'::jsonb),
 "originalSourceRow" jsonb,
 UNIQUE(id,"sourceId","schemeId"),
 FOREIGN KEY ("sourceId","schemeId") REFERENCES water_scheme_source(id,"schemeId") ON DELETE RESTRICT,
 FOREIGN KEY ("supersedesId","sourceId","schemeId") REFERENCES source_capacity_assessment(id,"sourceId","schemeId") ON DELETE RESTRICT,
 CHECK (engineering_capacity_number_ok("recordedInstalledPumpCapacityM3Hr") AND engineering_capacity_number_ok("measuredCapacityM3Hr")
   AND engineering_capacity_number_ok("capacityM3Day") AND engineering_capacity_number_ok("benchmarkCapacityM3Month")),
 CHECK ("regimeHoursPerDay" IS NULL OR (engineering_capacity_number_ok("regimeHoursPerDay") AND "regimeHoursPerDay" <= 24)),
 CHECK (("assessmentKind" = 'legacy_snapshot' AND "effectiveFrom" IS NULL AND "assessedAt" IS NULL
          AND "measuredCapacityM3Hr" IS NULL AND "benchmarkDays" IS NULL AND "originalSourceRow" IS NOT NULL)
     OR ("assessmentKind" = 'new_assessment' AND "effectiveFrom" IS NOT NULL AND "assessedAt" IS NOT NULL
          AND "responsibleOfficerId" IS NOT NULL AND "originalSourceRow" IS NULL)),
 CHECK ("originalSourceRow" IS NULL OR jsonb_typeof("originalSourceRow") = 'object')
);
CREATE UNIQUE INDEX source_capacity_legacy_version_unq ON source_capacity_assessment("sourceId","sourceVersion") WHERE "assessmentKind"='legacy_snapshot';
CREATE INDEX source_capacity_effective_idx ON source_capacity_assessment("sourceId","effectiveFrom");

CREATE TABLE scheme_capacity_baseline (
 id text PRIMARY KEY,
 "schemeId" text NOT NULL REFERENCES water_scheme(id) ON DELETE RESTRICT,
 "periodMonth" date NOT NULL CHECK (extract(day FROM "periodMonth") = 1),
 revision integer NOT NULL CHECK (revision > 0),
 "supersedesId" text UNIQUE,
 basis text NOT NULL CHECK (basis IN ('original_fixed_days','calendar_days','preserved_report')),
 "dayCount" integer CHECK ("dayCount" BETWEEN 1 AND 366),
 "capacityM3" numeric CHECK (engineering_capacity_number_ok("capacityM3")),
 completeness text NOT NULL CHECK (completeness IN ('complete','incomplete','unknown')),
 "expectedSourceCount" integer NOT NULL CHECK ("expectedSourceCount" > 0),
 "selectedById" text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 "recordedAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
 "creationTransactionId" bigint NOT NULL DEFAULT txid_current(),
 reason text NOT NULL CHECK (length(trim(reason)) > 0),
 assumptions jsonb NOT NULL CHECK (jsonb_typeof(assumptions) = 'object'),
 provenance jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object' AND provenance <> '{}'::jsonb),
 UNIQUE("schemeId","periodMonth",revision),
 UNIQUE(id,"schemeId"),
 UNIQUE(id,"schemeId","periodMonth"),
 FOREIGN KEY ("supersedesId","schemeId","periodMonth") REFERENCES scheme_capacity_baseline(id,"schemeId","periodMonth") ON DELETE RESTRICT,
 CHECK ((revision = 1 AND "supersedesId" IS NULL) OR (revision > 1 AND "supersedesId" IS NOT NULL)),
 CHECK ((completeness='complete' AND "capacityM3" IS NOT NULL) OR (completeness<>'complete' AND "capacityM3" IS NULL)),
 CHECK (basis='preserved_report' OR "dayCount" IS NOT NULL)
);

CREATE TABLE scheme_capacity_baseline_source (
 "baselineId" text NOT NULL,
 "schemeId" text NOT NULL,
 "sourceId" text NOT NULL,
 "assessmentId" text NOT NULL,
 "contributionM3" numeric CHECK (engineering_capacity_number_ok("contributionM3")),
 provenance jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object' AND provenance <> '{}'::jsonb),
 PRIMARY KEY ("baselineId","sourceId"),
 FOREIGN KEY ("baselineId","schemeId") REFERENCES scheme_capacity_baseline(id,"schemeId") ON DELETE RESTRICT,
 FOREIGN KEY ("assessmentId","sourceId","schemeId") REFERENCES source_capacity_assessment(id,"sourceId","schemeId") ON DELETE RESTRICT
);

CREATE FUNCTION engineering_capacity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Engineering capacity history is immutable; append a reviewed revision'; END $$;

CREATE TRIGGER source_assessment_immutable BEFORE UPDATE OR DELETE ON source_capacity_assessment FOR EACH ROW EXECUTE FUNCTION engineering_capacity_immutable();
CREATE TRIGGER source_assessment_no_truncate BEFORE TRUNCATE ON source_capacity_assessment FOR EACH STATEMENT EXECUTE FUNCTION engineering_capacity_immutable();
CREATE TRIGGER scheme_baseline_immutable BEFORE UPDATE OR DELETE ON scheme_capacity_baseline FOR EACH ROW EXECUTE FUNCTION engineering_capacity_immutable();
CREATE TRIGGER scheme_baseline_no_truncate BEFORE TRUNCATE ON scheme_capacity_baseline FOR EACH STATEMENT EXECUTE FUNCTION engineering_capacity_immutable();
CREATE TRIGGER baseline_source_immutable BEFORE UPDATE OR DELETE ON scheme_capacity_baseline_source FOR EACH ROW EXECUTE FUNCTION engineering_capacity_immutable();
CREATE TRIGGER baseline_source_no_truncate BEFORE TRUNCATE ON scheme_capacity_baseline_source FOR EACH STATEMENT EXECUTE FUNCTION engineering_capacity_immutable();

CREATE FUNCTION engineering_capacity_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_revision integer;
BEGIN
 IF TG_TABLE_NAME = 'source_capacity_assessment' THEN
  NEW."recordedAt" := clock_timestamp();
  -- Forward assessments cannot reinterpret a previous day. Historical assignment
  -- requires a separately reviewed import/reconciliation workflow, not this path.
  IF NEW."assessmentKind"='new_assessment' AND
     (NEW."effectiveFrom" < (NEW."recordedAt" AT TIME ZONE 'Africa/Kampala')::date OR NEW."assessedAt" > NEW."recordedAt") THEN
   RAISE EXCEPTION 'New assessment cannot backdate effectivity or invent a future measurement';
  END IF;
 ELSIF TG_TABLE_NAME = 'scheme_capacity_baseline' THEN
  NEW."recordedAt" := clock_timestamp(); NEW."creationTransactionId" := txid_current();
  IF NEW."supersedesId" IS NOT NULL THEN
   SELECT revision INTO parent_revision FROM scheme_capacity_baseline WHERE id=NEW."supersedesId";
   IF NEW.revision IS DISTINCT FROM parent_revision + 1 THEN RAISE EXCEPTION 'Baseline revisions must be consecutive'; END IF;
  END IF;
 ELSE
  IF NOT EXISTS (SELECT 1 FROM scheme_capacity_baseline b WHERE b.id=NEW."baselineId" AND b."creationTransactionId"=txid_current()) THEN
   RAISE EXCEPTION 'Baseline membership is sealed after its creation transaction';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_insert_guard BEFORE INSERT ON source_capacity_assessment FOR EACH ROW EXECUTE FUNCTION engineering_capacity_insert_guard();
CREATE TRIGGER baseline_insert_guard BEFORE INSERT ON scheme_capacity_baseline FOR EACH ROW EXECUTE FUNCTION engineering_capacity_insert_guard();
CREATE TRIGGER baseline_source_insert_guard BEFORE INSERT ON scheme_capacity_baseline_source FOR EACH ROW EXECUTE FUNCTION engineering_capacity_insert_guard();

CREATE FUNCTION engineering_capacity_baseline_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b scheme_capacity_baseline; n integer; known integer; total numeric; target_id text;
BEGIN
 IF TG_TABLE_NAME='scheme_capacity_baseline' THEN target_id := NEW.id;
 ELSE target_id := NEW."baselineId"; END IF;
 SELECT * INTO STRICT b FROM scheme_capacity_baseline WHERE id=target_id;
 SELECT count(*),count("contributionM3"),sum("contributionM3") INTO n,known,total FROM scheme_capacity_baseline_source WHERE "baselineId"=b.id;
 IF n<>b."expectedSourceCount" THEN RAISE EXCEPTION 'Baseline source membership is incomplete'; END IF;
 IF b.completeness='complete' AND (known<>n OR total IS DISTINCT FROM b."capacityM3") THEN
  RAISE EXCEPTION 'Complete baseline must equal its known source contributions';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER baseline_consistent AFTER INSERT ON scheme_capacity_baseline DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION engineering_capacity_baseline_check();
CREATE CONSTRAINT TRIGGER baseline_source_consistent AFTER INSERT ON scheme_capacity_baseline_source DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION engineering_capacity_baseline_check();
REVOKE ALL ON source_capacity_assessment,scheme_capacity_baseline,scheme_capacity_baseline_source FROM PUBLIC;

-- Deliberately no INSERT SELECT here. Initialization is separately approval-gated.
-- Deliberately no source writer or report switch here. This is a migration proof,
-- not a working application feature. Existing grants/RLS and service scopes require
-- review before any deployment. No new client-facing grants are proposed.
