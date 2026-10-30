-- REVIEW ONLY. Supersedes the unregistered Phase A draft; do not apply both.
-- Outside db/migrations intentionally. No initialization, UPDATE, backfill or existing-table ALTER.
-- Requires 0069-0072 and PostgreSQL 17. Apply all four proposed files atomically ONLY after approval.

CREATE FUNCTION swuws_history_number_ok(n numeric) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT n IS NULL OR (n >= 0 AND n::text NOT IN ('NaN','Infinity','-Infinity'))
$$;

CREATE TABLE source_capacity_assessment (
 id text PRIMARY KEY,
 "organizationId" text NOT NULL REFERENCES organization(id) ON DELETE RESTRICT,
 "sourceId" text NOT NULL,
 "schemeId" text NOT NULL,
 revision integer NOT NULL CHECK (revision > 0),
 "sourceVersionObserved" integer NOT NULL CHECK ("sourceVersionObserved" > 0),
 "supersedesId" text UNIQUE,
 kind text NOT NULL CHECK (kind IN ('documented_assessment','reference_evidence')),
 classification text NOT NULL CHECK (classification IN ('VERIFIED_ASSESSMENT','CONFIGURATION','HISTORICAL_REFERENCE','ESTIMATE','UNAVAILABLE')),
 methodology text NOT NULL CHECK (length(trim(methodology)) > 0),
 "methodologyVersion" text NOT NULL CHECK (length(trim("methodologyVersion")) > 0),
 "assessedAt" timestamptz,
 "effectiveFrom" date,
 "effectiveThrough" date,
 "recordedAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
 "responsibleOfficerId" text REFERENCES "user"(id) ON DELETE RESTRICT,
 "capturedById" text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 "installedRatingM3Hour" numeric CHECK (swuws_history_number_ok("installedRatingM3Hour")),
 "measuredYieldM3Hour" numeric CHECK (swuws_history_number_ok("measuredYieldM3Hour")),
 "regimeHoursPerDay" numeric CHECK (swuws_history_number_ok("regimeHoursPerDay") AND "regimeHoursPerDay" <= 24),
 "capacitySelection" text NOT NULL CHECK ("capacitySelection" IN ('measured_yield','installed_rating','as_written','unavailable')),
 "capacityM3Day" numeric CHECK (swuws_history_number_ok("capacityM3Day")),
 "benchmarkCapacityM3Month" numeric CHECK (swuws_history_number_ok("benchmarkCapacityM3Month")),
 "benchmarkDays" integer CHECK ("benchmarkDays" BETWEEN 1 AND 366),
 "sourceWasActive" boolean NOT NULL,
 "rawObservations" jsonb NOT NULL CHECK (jsonb_typeof("rawObservations") = 'object'),
 assumptions jsonb NOT NULL CHECK (jsonb_typeof(assumptions) = 'object'),
 provenance jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object' AND provenance <> '{}'::jsonb),
 "hierarchySnapshot" jsonb NOT NULL CHECK (jsonb_typeof("hierarchySnapshot") = 'object' AND "hierarchySnapshot" <> '{}'::jsonb),
 UNIQUE ("sourceId",revision),
 UNIQUE (id,"sourceId","schemeId","organizationId"),
 FOREIGN KEY ("sourceId","schemeId") REFERENCES water_scheme_source(id,"schemeId") ON DELETE RESTRICT,
 FOREIGN KEY ("supersedesId","sourceId","schemeId","organizationId") REFERENCES source_capacity_assessment(id,"sourceId","schemeId","organizationId") ON DELETE RESTRICT,
 CHECK ("supersedesId" IS DISTINCT FROM id),
 CHECK ((revision=1 AND "supersedesId" IS NULL) OR (revision>1 AND "supersedesId" IS NOT NULL)),
 CHECK ("effectiveThrough" IS NULL OR ("effectiveFrom" IS NOT NULL AND "effectiveThrough" >= "effectiveFrom")),
 CHECK (kind <> 'documented_assessment' OR ("assessedAt" IS NOT NULL AND "effectiveFrom" IS NOT NULL AND "responsibleOfficerId" IS NOT NULL)),
 CHECK (classification <> 'VERIFIED_ASSESSMENT' OR (kind='documented_assessment' AND "rawObservations" <> '{}'::jsonb)),
 CHECK (("capacitySelection"='unavailable' AND "capacityM3Day" IS NULL AND "benchmarkCapacityM3Month" IS NULL)
   OR ("capacitySelection"='measured_yield' AND "measuredYieldM3Hour" IS NOT NULL AND "regimeHoursPerDay" IS NOT NULL AND "capacityM3Day" IS NOT NULL AND "capacityM3Day"="measuredYieldM3Hour"*"regimeHoursPerDay")
   OR ("capacitySelection"='installed_rating' AND "installedRatingM3Hour" IS NOT NULL AND "regimeHoursPerDay" IS NOT NULL AND "capacityM3Day" IS NOT NULL AND "capacityM3Day"="installedRatingM3Hour"*"regimeHoursPerDay")
   OR ("capacitySelection"='as_written' AND classification='HISTORICAL_REFERENCE' AND provenance ? 'originalCells')),
 CHECK ("capacitySelection" IN ('unavailable','as_written') OR "benchmarkCapacityM3Month" IS NULL OR ("benchmarkDays" IS NOT NULL AND "benchmarkCapacityM3Month"="capacityM3Day"*"benchmarkDays"))
);
CREATE INDEX source_assessment_effective_idx ON source_capacity_assessment("organizationId","sourceId","effectiveFrom");

CREATE TABLE scheme_capacity_baseline (
 id text PRIMARY KEY,
 "organizationId" text NOT NULL REFERENCES organization(id) ON DELETE RESTRICT,
 "schemeId" text NOT NULL REFERENCES water_scheme(id) ON DELETE RESTRICT,
 "periodMonth" date NOT NULL CHECK (extract(day FROM "periodMonth")=1),
 revision integer NOT NULL CHECK (revision>0),
 "supersedesId" text UNIQUE,
 basis text NOT NULL CHECK (basis IN ('original_fixed_days','calendar_days','preserved_report')),
 "selectionPolicy" text NOT NULL CHECK ("selectionPolicy" IN ('explicit_whole_month','mid_month_pro_rata')),
 "dayCount" integer CHECK ("dayCount" BETWEEN 1 AND 366),
 classification text NOT NULL CHECK (classification IN ('VERIFIED_ASSESSMENT','CONFIGURATION','HISTORICAL_REFERENCE','ESTIMATE','UNAVAILABLE')),
 completeness text NOT NULL CHECK (completeness IN ('complete','incomplete','unknown')),
 "capacityM3" numeric CHECK (swuws_history_number_ok("capacityM3")),
 "expectedSourceCount" integer NOT NULL CHECK ("expectedSourceCount">0),
 "sourceRoster" text[] NOT NULL CHECK (cardinality("sourceRoster")="expectedSourceCount"),
 "selectedById" text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 "recordedAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
 "creationTransactionId" bigint NOT NULL DEFAULT txid_current(),
 reason text NOT NULL CHECK (length(trim(reason))>0),
 assumptions jsonb NOT NULL CHECK (jsonb_typeof(assumptions)='object'),
 provenance jsonb NOT NULL CHECK (jsonb_typeof(provenance)='object' AND provenance<>'{}'::jsonb),
 UNIQUE ("schemeId","periodMonth",revision),
 UNIQUE (id,"schemeId","periodMonth","organizationId"),
 FOREIGN KEY ("supersedesId","schemeId","periodMonth","organizationId") REFERENCES scheme_capacity_baseline(id,"schemeId","periodMonth","organizationId") ON DELETE RESTRICT,
 CHECK ("supersedesId" IS DISTINCT FROM id),
 CHECK ((revision=1 AND "supersedesId" IS NULL) OR (revision>1 AND "supersedesId" IS NOT NULL)),
 CHECK ((completeness='complete' AND "capacityM3" IS NOT NULL AND classification<>'UNAVAILABLE') OR (completeness<>'complete' AND "capacityM3" IS NULL)),
 CHECK (basis='preserved_report' OR "dayCount" IS NOT NULL),
 CHECK (basis<>'calendar_days' OR "dayCount"=extract(day FROM ("periodMonth"+interval '1 month - 1 day'))::integer),
 CHECK (basis<>'preserved_report' OR (classification='HISTORICAL_REFERENCE' AND provenance ? 'originalReportHash'))
);
CREATE INDEX scheme_baseline_period_idx ON scheme_capacity_baseline("organizationId","schemeId","periodMonth");

CREATE TABLE scheme_capacity_baseline_source (
 "baselineId" text NOT NULL,
 "organizationId" text NOT NULL,
 "schemeId" text NOT NULL,
 "periodMonth" date NOT NULL,
 "sourceId" text NOT NULL,
 "assessmentId" text NOT NULL,
 "assessmentApprovalId" text NOT NULL,
 "contributionM3" numeric CHECK (swuws_history_number_ok("contributionM3")),
 provenance jsonb NOT NULL CHECK (jsonb_typeof(provenance)='object' AND provenance<>'{}'::jsonb),
 PRIMARY KEY ("baselineId","sourceId"),
 FOREIGN KEY ("baselineId","schemeId","periodMonth","organizationId") REFERENCES scheme_capacity_baseline(id,"schemeId","periodMonth","organizationId") ON DELETE RESTRICT,
 FOREIGN KEY ("assessmentId","sourceId","schemeId","organizationId") REFERENCES source_capacity_assessment(id,"sourceId","schemeId","organizationId") ON DELETE RESTRICT
);
CREATE INDEX baseline_source_assessment_idx ON scheme_capacity_baseline_source("assessmentId");
