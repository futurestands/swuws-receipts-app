-- REVIEW ONLY. Existing table DATA is not recalculated or backfilled.
-- These are permission DEFINITIONS, not role/user permission assignments.
-- Preflight must reject incompatible existing definitions before installation.
GRANT USAGE ON SCHEMA public TO swuws_history_runtime;
GRANT SELECT (id,active) ON "user" TO swuws_history_runtime;
GRANT SELECT (id,"branchId") ON water_scheme TO swuws_history_runtime;
GRANT SELECT (id,"clusterId") ON branch TO swuws_history_runtime;
GRANT SELECT (id,"organizationId") ON cluster TO swuws_history_runtime;
GRANT SELECT (id,year,month) ON billing_period TO swuws_history_runtime;
GRANT SELECT (id,"schemeId","billingPeriodId") ON scheme_target TO swuws_history_runtime;
GRANT SELECT (id,"periodId","generatedById","createdAt") ON report_generation_history TO swuws_history_runtime;
INSERT INTO iam_permission (id,code,module,name,description) VALUES
 ('perm-production-capacity-approve','production.capacity.approve','Production','Approve capacity assessments and baselines','Independently approve scoped engineering assessments and explicit period baselines'),
 ('perm-decision-targets-manage','decision_support.targets.manage','Decision Support','Manage target definitions','Create scoped versioned targets and evidence-backed period assignments'),
 ('perm-decision-targets-approve','decision_support.targets.approve','Decision Support','Approve targets','Independently approve target definitions and period assignments')
ON CONFLICT (code) DO NOTHING;
-- Deliberately no GRANT swuws_history_runtime TO <existing_login>.
-- Deliberately no INSERT into iam_role_permission, user assignments or history tables.
