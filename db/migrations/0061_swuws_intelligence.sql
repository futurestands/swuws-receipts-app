-- 0061_swuws_intelligence.sql
-- Create SWUWS Intelligence Module Tables and Permissions

CREATE TABLE IF NOT EXISTS water_scheme_source (
    "id" TEXT PRIMARY KEY,
    "schemeId" TEXT NOT NULL REFERENCES water_scheme("id") ON DELETE CASCADE,
    "sourceName" TEXT NOT NULL,
    "technology" TEXT NOT NULL DEFAULT 'gravity',
    "installedPumpCapacityM3Hr" NUMERIC(12, 2) DEFAULT 0,
    "regimeHoursPerDay" NUMERIC(5, 2) DEFAULT 24,
    "containerVolumeLitres" NUMERIC(12, 2) DEFAULT 0,
    "averageFillTimeSeconds" NUMERIC(12, 2) DEFAULT 0,
    "productionCapacityLSec" NUMERIC(12, 4) DEFAULT 0,
    "currentCapacityM3Day" NUMERIC(12, 2) DEFAULT 0,
    "practicalCapacityM3Month" NUMERIC(12, 2) DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS water_scheme_source_scheme_idx ON water_scheme_source("schemeId");

CREATE TABLE IF NOT EXISTS water_production_log (
    "id" TEXT PRIMARY KEY,
    "schemeId" TEXT NOT NULL REFERENCES water_scheme("id") ON DELETE CASCADE,
    "sourceId" TEXT REFERENCES water_scheme_source("id") ON DELETE SET NULL,
    "billingPeriodId" TEXT REFERENCES billing_period("id") ON DELETE SET NULL,
    "logDate" TIMESTAMP NOT NULL,
    "waterProducedM3" NUMERIC(12, 2) NOT NULL DEFAULT 0,
    "waterSuppliedM3" NUMERIC(12, 2) DEFAULT 0,
    "operatingHours" NUMERIC(5, 2),
    "status" TEXT NOT NULL DEFAULT 'entered',
    "recordedById" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS water_production_log_scheme_period_idx ON water_production_log("schemeId", "billingPeriodId");
CREATE INDEX IF NOT EXISTS water_production_log_date_idx ON water_production_log("logDate");

CREATE TABLE IF NOT EXISTS scheme_target (
    "id" TEXT PRIMARY KEY,
    "schemeId" TEXT NOT NULL REFERENCES water_scheme("id") ON DELETE CASCADE,
    "billingPeriodId" TEXT REFERENCES billing_period("id") ON DELETE SET NULL,
    "targetProductionM3" NUMERIC(12, 2),
    "targetNrwPercent" NUMERIC(5, 2),
    "targetCapacityUtilisationPercent" NUMERIC(5, 2),
    "targetCollectionEfficiencyPercent" NUMERIC(5, 2),
    "targetBillingUgx" NUMERIC(12, 2),
    "targetArrearsRecoveryUgx" NUMERIC(12, 2),
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT scheme_target_scheme_period_unq UNIQUE ("schemeId", "billingPeriodId")
);

CREATE TABLE IF NOT EXISTS intelligence_finding (
    "id" TEXT PRIMARY KEY,
    "organizationId" TEXT REFERENCES organization("id") ON DELETE SET NULL,
    "clusterId" TEXT REFERENCES cluster("id") ON DELETE SET NULL,
    "branchId" TEXT REFERENCES branch("id") ON DELETE SET NULL,
    "schemeId" TEXT REFERENCES water_scheme("id") ON DELETE SET NULL,
    "sourceId" TEXT REFERENCES water_scheme_source("id") ON DELETE SET NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "observation" TEXT,
    "evidence" JSONB NOT NULL,
    "recommendation" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'HIGH',
    "reportingPeriod" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assignedToUserId" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
    "resolutionNotes" TEXT,
    "resolvedAt" TIMESTAMP,
    "detectedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS intel_finding_scheme_idx ON intelligence_finding("schemeId");
CREATE INDEX IF NOT EXISTS intel_finding_cat_idx ON intelligence_finding("category");
CREATE INDEX IF NOT EXISTS intel_finding_sev_idx ON intelligence_finding("severity");
CREATE INDEX IF NOT EXISTS intel_finding_status_idx ON intelligence_finding("status");
CREATE INDEX IF NOT EXISTS intel_finding_detected_idx ON intelligence_finding("detectedAt");

CREATE TABLE IF NOT EXISTS intelligence_rule (
    "id" TEXT PRIMARY KEY,
    "code" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "threshold" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Seed IAM Permissions for SWUWS Intelligence
INSERT INTO iam_permission (id, code, module, name, description)
VALUES
  ('perm-intel-view', 'intelligence.view', 'Intelligence', 'View SWUWS Intelligence', 'Allows viewing intelligence dashboards and scheme insights'),
  ('perm-intel-investigate', 'intelligence.investigate', 'Intelligence', 'Investigate Findings', 'Allows investigating and assigning intelligence findings'),
  ('perm-intel-manage-rules', 'intelligence.manage_rules', 'Intelligence', 'Manage Intelligence Rules', 'Allows configuring anomaly detection rules and thresholds'),
  ('perm-intel-dismiss', 'intelligence.dismiss', 'Intelligence', 'Dismiss Findings', 'Allows resolving or dismissing intelligence findings'),
  ('perm-intel-export', 'intelligence.export', 'Intelligence', 'Export Intelligence Data', 'Allows exporting intelligence reports and data')
ON CONFLICT (code) DO NOTHING;
