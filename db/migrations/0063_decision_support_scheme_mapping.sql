-- 0063_decision_support_scheme_mapping.sql
-- Create Decision Support Scheme Mapping Table for Auditable Reconciliation

CREATE TABLE IF NOT EXISTS decision_support_scheme_mapping (
    "id" TEXT PRIMARY KEY,
    "waterSchemeId" TEXT REFERENCES water_scheme("id") ON DELETE SET NULL,
    "excelArea" TEXT NOT NULL,
    "excelSchemeName" TEXT NOT NULL,
    "matchStatus" TEXT NOT NULL,
    "matchMethod" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT FALSE,
    "approvedById" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
    "approvedAt" TIMESTAMP DEFAULT NOW(),
    "source" TEXT NOT NULL DEFAULT 'SWUWS Excel Reference Dataset (global target.xlsx)',
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ds_scheme_map_scheme_idx ON decision_support_scheme_mapping("waterSchemeId");
CREATE INDEX IF NOT EXISTS ds_scheme_map_status_idx ON decision_support_scheme_mapping("matchStatus");
