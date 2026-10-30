-- REVIEW ONLY. Requires proposed file 01. No INSERT SELECT and no existing-table ALTER.
CREATE TABLE scheme_target_definition_version (
 id text PRIMARY KEY,
 "definitionKey" text NOT NULL CHECK (length(trim("definitionKey"))>0),
 "organizationId" text NOT NULL REFERENCES organization(id) ON DELETE RESTRICT,
 "schemeId" text REFERENCES water_scheme(id) ON DELETE RESTRICT,
 revision integer NOT NULL CHECK (revision>0),
 "supersedesId" text UNIQUE,
 classification text NOT NULL CHECK (classification IN ('HISTORICAL_REFERENCE','MANAGEMENT_TARGET','ESTIMATE')),
 "formulaVersion" text NOT NULL CHECK (length(trim("formulaVersion"))>0),
 -- EngineeringMetric objects keyed exactly as MpsTpsInputs. Inputs are authoritative;
 -- original saved Excel outputs remain evidence, not actual production or billed revenue.
 inputs jsonb NOT NULL CHECK (jsonb_typeof(inputs)='object'),
 "inputProvenance" jsonb NOT NULL CHECK (jsonb_typeof("inputProvenance")='object'),
 assumptions jsonb NOT NULL CHECK (jsonb_typeof(assumptions)='object'),
 "originalSavedResults" jsonb NOT NULL CHECK (jsonb_typeof("originalSavedResults")='object'),
 provenance jsonb NOT NULL CHECK (jsonb_typeof(provenance)='object' AND provenance<>'{}'::jsonb),
 "createdById" text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 "recordedAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE ("definitionKey",revision),
 UNIQUE (id,"definitionKey","organizationId"),
 FOREIGN KEY ("supersedesId","definitionKey","organizationId") REFERENCES scheme_target_definition_version(id,"definitionKey","organizationId") ON DELETE RESTRICT,
 CHECK ("supersedesId" IS DISTINCT FROM id),
 CHECK ((revision=1 AND "supersedesId" IS NULL) OR (revision>1 AND "supersedesId" IS NOT NULL))
);
CREATE INDEX target_definition_scheme_idx ON scheme_target_definition_version("organizationId","schemeId");

CREATE TABLE scheme_target_period_assignment (
 id text PRIMARY KEY,
 "organizationId" text NOT NULL REFERENCES organization(id) ON DELETE RESTRICT,
 "schemeId" text NOT NULL REFERENCES water_scheme(id) ON DELETE RESTRICT,
 "billingPeriodId" text NOT NULL REFERENCES billing_period(id) ON DELETE RESTRICT,
 "periodMonth" date NOT NULL CHECK (extract(day FROM "periodMonth")=1),
 revision integer NOT NULL CHECK (revision>0),
 "supersedesId" text UNIQUE,
 "targetDefinitionId" text NOT NULL REFERENCES scheme_target_definition_version(id) ON DELETE RESTRICT,
 "definitionApprovalId" text NOT NULL,
 "baselineId" text NOT NULL,
 "baselineApprovalId" text NOT NULL,
 -- Optional link to the existing mutable operational projection. The immutable
 -- definition/assignment remains authoritative; no trigger writes scheme_target.
 "schemeTargetId" text REFERENCES scheme_target(id) ON DELETE RESTRICT,
 "assignedById" text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 "recordedAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
 provenance jsonb NOT NULL CHECK (jsonb_typeof(provenance)='object' AND provenance ? 'periodEvidence' AND provenance ? 'identityEvidence'),
 UNIQUE ("schemeId","billingPeriodId",revision),
 UNIQUE (id,"schemeId","billingPeriodId","periodMonth","organizationId"),
 FOREIGN KEY ("baselineId","schemeId","periodMonth","organizationId") REFERENCES scheme_capacity_baseline(id,"schemeId","periodMonth","organizationId") ON DELETE RESTRICT,
 FOREIGN KEY ("supersedesId","schemeId","billingPeriodId","periodMonth","organizationId") REFERENCES scheme_target_period_assignment(id,"schemeId","billingPeriodId","periodMonth","organizationId") ON DELETE RESTRICT,
 CHECK ("supersedesId" IS DISTINCT FROM id),
 CHECK ((revision=1 AND "supersedesId" IS NULL) OR (revision>1 AND "supersedesId" IS NOT NULL))
);
CREATE INDEX target_assignment_period_idx ON scheme_target_period_assignment("organizationId","schemeId","periodMonth");

CREATE TABLE decision_support_review_event (
 id text PRIMARY KEY,
 "organizationId" text NOT NULL REFERENCES organization(id) ON DELETE RESTRICT,
 "assessmentId" text REFERENCES source_capacity_assessment(id) ON DELETE RESTRICT,
 "baselineId" text REFERENCES scheme_capacity_baseline(id) ON DELETE RESTRICT,
 "targetDefinitionId" text REFERENCES scheme_target_definition_version(id) ON DELETE RESTRICT,
 "targetAssignmentId" text REFERENCES scheme_target_period_assignment(id) ON DELETE RESTRICT,
 revision integer NOT NULL CHECK (revision>0),
 "supersedesId" text UNIQUE REFERENCES decision_support_review_event(id) ON DELETE RESTRICT,
 decision text NOT NULL CHECK (decision IN ('approve','reject','revoke')),
 "reviewerId" text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 "recordedAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL CHECK (length(trim(reason))>=10),
 "authorizationEvidence" jsonb NOT NULL CHECK (jsonb_typeof("authorizationEvidence")='object' AND "authorizationEvidence" ? 'permissionCode' AND "authorizationEvidence" ? 'scope'),
 provenance jsonb NOT NULL CHECK (jsonb_typeof(provenance)='object' AND provenance<>'{}'::jsonb),
 CHECK (num_nonnulls("assessmentId","baselineId","targetDefinitionId","targetAssignmentId")=1),
 CHECK ("supersedesId" IS DISTINCT FROM id),
 CHECK ((revision=1 AND "supersedesId" IS NULL) OR (revision>1 AND "supersedesId" IS NOT NULL))
);
CREATE UNIQUE INDEX review_assessment_revision_unq ON decision_support_review_event("assessmentId",revision) WHERE "assessmentId" IS NOT NULL;
CREATE UNIQUE INDEX review_baseline_revision_unq ON decision_support_review_event("baselineId",revision) WHERE "baselineId" IS NOT NULL;
CREATE UNIQUE INDEX review_definition_revision_unq ON decision_support_review_event("targetDefinitionId",revision) WHERE "targetDefinitionId" IS NOT NULL;
CREATE UNIQUE INDEX review_assignment_revision_unq ON decision_support_review_event("targetAssignmentId",revision) WHERE "targetAssignmentId" IS NOT NULL;

CREATE TABLE decision_support_report_snapshot (
 "reportId" text PRIMARY KEY REFERENCES report_generation_history(id) ON DELETE RESTRICT,
 "organizationId" text NOT NULL REFERENCES organization(id) ON DELETE RESTRICT,
 "billingPeriodId" text NOT NULL REFERENCES billing_period(id) ON DELETE RESTRICT,
 "periodMonth" date NOT NULL CHECK (extract(day FROM "periodMonth")=1),
 "generatedById" text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 "recordedAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
 "creationTransactionId" bigint NOT NULL DEFAULT txid_current(),
 "formulaVersion" text NOT NULL CHECK (length(trim("formulaVersion"))>0),
 "actualsAsOf" timestamptz NOT NULL,
 "expectedSchemeCount" integer NOT NULL CHECK ("expectedSchemeCount">0),
 "schemeRoster" text[] NOT NULL CHECK (cardinality("schemeRoster")="expectedSchemeCount"),
 -- Full availability/classification-qualified report data and source observation IDs/versions.
 -- Snapshot is immutable. Later actual corrections create another report, not a replacement.
 payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND payload ? 'measurementProvenance' AND payload ? 'sourceVersions' AND payload ? 'scope'),
 "payloadSha256" text NOT NULL CHECK ("payloadSha256" ~ '^[0-9a-f]{64}$'),
 UNIQUE ("reportId","billingPeriodId","periodMonth","organizationId")
);

CREATE TABLE decision_support_report_scheme_reference (
 "reportId" text NOT NULL,
 "organizationId" text NOT NULL,
 "billingPeriodId" text NOT NULL,
 "periodMonth" date NOT NULL,
 "schemeId" text NOT NULL REFERENCES water_scheme(id) ON DELETE RESTRICT,
 "capacityState" text NOT NULL CHECK ("capacityState" IN ('PINNED','UNAVAILABLE')),
 "baselineId" text,
 "baselineApprovalId" text,
 "targetState" text NOT NULL CHECK ("targetState" IN ('PINNED','UNAVAILABLE')),
 "targetAssignmentId" text,
 "assignmentApprovalId" text,
 reason text NOT NULL CHECK (length(trim(reason))>0),
 PRIMARY KEY ("reportId","schemeId"),
 FOREIGN KEY ("reportId","billingPeriodId","periodMonth","organizationId") REFERENCES decision_support_report_snapshot("reportId","billingPeriodId","periodMonth","organizationId") ON DELETE RESTRICT,
 FOREIGN KEY ("baselineId","schemeId","periodMonth","organizationId") REFERENCES scheme_capacity_baseline(id,"schemeId","periodMonth","organizationId") ON DELETE RESTRICT,
 FOREIGN KEY ("targetAssignmentId","schemeId","billingPeriodId","periodMonth","organizationId") REFERENCES scheme_target_period_assignment(id,"schemeId","billingPeriodId","periodMonth","organizationId") ON DELETE RESTRICT,
 CHECK (("capacityState"='PINNED' AND "baselineId" IS NOT NULL AND "baselineApprovalId" IS NOT NULL) OR ("capacityState"='UNAVAILABLE' AND "baselineId" IS NULL AND "baselineApprovalId" IS NULL)),
 CHECK (("targetState"='PINNED' AND "targetAssignmentId" IS NOT NULL AND "assignmentApprovalId" IS NOT NULL) OR ("targetState"='UNAVAILABLE' AND "targetAssignmentId" IS NULL AND "assignmentApprovalId" IS NULL))
);
ALTER TABLE scheme_capacity_baseline_source ADD FOREIGN KEY ("assessmentApprovalId") REFERENCES decision_support_review_event(id) ON DELETE RESTRICT;
ALTER TABLE scheme_target_period_assignment ADD FOREIGN KEY ("definitionApprovalId") REFERENCES decision_support_review_event(id) ON DELETE RESTRICT;
ALTER TABLE scheme_target_period_assignment ADD FOREIGN KEY ("baselineApprovalId") REFERENCES decision_support_review_event(id) ON DELETE RESTRICT;
ALTER TABLE decision_support_report_scheme_reference ADD FOREIGN KEY ("baselineApprovalId") REFERENCES decision_support_review_event(id) ON DELETE RESTRICT;
ALTER TABLE decision_support_report_scheme_reference ADD FOREIGN KEY ("assignmentApprovalId") REFERENCES decision_support_review_event(id) ON DELETE RESTRICT;
