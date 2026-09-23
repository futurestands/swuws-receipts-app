-- 0062_decision_support_actions_history.sql
-- Create Management Action Register, Report Generation History, and IAM Permissions

CREATE TABLE IF NOT EXISTS management_action (
    "id" TEXT PRIMARY KEY,
    "findingId" TEXT REFERENCES intelligence_finding("id") ON DELETE CASCADE,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "responsibleUserId" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
    "responsibleScope" TEXT,
    "dueDate" TIMESTAMP NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "evidence" JSONB,
    "resolutionNotes" TEXT,
    "closureEvidenceUrl" TEXT,
    "closedAt" TIMESTAMP,
    "createdById" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mgmt_action_finding_idx ON management_action("findingId");
CREATE INDEX IF NOT EXISTS mgmt_action_resp_user_idx ON management_action("responsibleUserId");
CREATE INDEX IF NOT EXISTS mgmt_action_status_idx ON management_action("status");
CREATE INDEX IF NOT EXISTS mgmt_action_due_date_idx ON management_action("dueDate");

CREATE TABLE IF NOT EXISTS report_generation_history (
    "id" TEXT PRIMARY KEY,
    "reportType" TEXT NOT NULL,
    "periodId" TEXT REFERENCES billing_period("id") ON DELETE SET NULL,
    "scopeLevel" TEXT NOT NULL DEFAULT 'organization',
    "scopeId" TEXT,
    "generatedById" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
    "fileFormat" TEXT NOT NULL DEFAULT 'pptx',
    "metadata" JSONB,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS report_history_period_idx ON report_generation_history("periodId");
CREATE INDEX IF NOT EXISTS report_history_user_idx ON report_generation_history("generatedById");
CREATE INDEX IF NOT EXISTS report_history_type_idx ON report_generation_history("reportType");

-- Seed IAM Permissions for Decision Support
INSERT INTO iam_permission (id, code, module, name, description)
VALUES
  ('perm-ds-actions', 'decision_support.actions', 'Decision Support', 'Manage Actions', 'Allows creating, assigning, and closing management actions'),
  ('perm-ds-boardpack', 'decision_support.board_pack', 'Decision Support', 'Generate Board Pack', 'Allows generating and downloading PowerPoint Board Pack decks'),
  ('perm-ds-export', 'decision_support.export', 'Decision Support', 'Export Decision Support Data', 'Allows downloading PDF, DOCX, and CSV reports')
ON CONFLICT (code) DO NOTHING;
