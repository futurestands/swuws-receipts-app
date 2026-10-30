-- Migration 0074: Production IAM Role Permission Grants
-- Maps Production IAM permissions to standard system roles without creating a blanket bypass.
-- Preserves independent production verification (trigger 0072) and scheme-level access restrictions.

BEGIN;

DO $$
DECLARE
  r_admin text;
  r_hc text;
  r_fo text;
  r_cm text;
  r_am text;
  r_agent text;
  r_it text;

  p_view text;
  p_create text;
  p_verify text;
  p_sources text;
BEGIN
  -- Resolve IAM Role IDs
  SELECT id INTO r_admin FROM iam_role WHERE code = 'admin';
  SELECT id INTO r_hc FROM iam_role WHERE code = 'head_commercial';
  SELECT id INTO r_fo FROM iam_role WHERE code = 'finance_officer';
  SELECT id INTO r_cm FROM iam_role WHERE code = 'cluster_manager';
  SELECT id INTO r_am FROM iam_role WHERE code = 'area_manager';
  SELECT id INTO r_agent FROM iam_role WHERE code = 'agent';
  SELECT id INTO r_it FROM iam_role WHERE code = 'it_officer';

  -- Resolve Permission IDs
  SELECT id INTO p_view FROM iam_permission WHERE code = 'production.view';
  SELECT id INTO p_create FROM iam_permission WHERE code = 'production.create';
  SELECT id INTO p_verify FROM iam_permission WHERE code = 'production.verify';
  SELECT id INTO p_sources FROM iam_permission WHERE code = 'production.sources.manage';

  -- 1. System Administrator (admin) -> Global Scope
  IF r_admin IS NOT NULL THEN
    IF p_view IS NOT NULL THEN INSERT INTO iam_role_permission (id, role_id, permission_id, scope) VALUES ('rp-admin-prod-view', r_admin, p_view, 'global') ON CONFLICT DO NOTHING; END IF;
    IF p_create IS NOT NULL THEN INSERT INTO iam_role_permission (id, role_id, permission_id, scope) VALUES ('rp-admin-prod-create', r_admin, p_create, 'global') ON CONFLICT DO NOTHING; END IF;
    IF p_verify IS NOT NULL THEN INSERT INTO iam_role_permission (id, role_id, permission_id, scope) VALUES ('rp-admin-prod-verify', r_admin, p_verify, 'global') ON CONFLICT DO NOTHING; END IF;
    IF p_sources IS NOT NULL THEN INSERT INTO iam_role_permission (id, role_id, permission_id, scope) VALUES ('rp-admin-prod-sources', r_admin, p_sources, 'global') ON CONFLICT DO NOTHING; END IF;
  END IF;

  -- 2. Head Commercial (head_commercial) -> Global View, Verify, Sources (NO Create)
  IF r_hc IS NOT NULL THEN
    IF p_view IS NOT NULL THEN INSERT INTO iam_role_permission (id, role_id, permission_id, scope) VALUES ('rp-hc-prod-view', r_hc, p_view, 'global') ON CONFLICT DO NOTHING; END IF;
    IF p_verify IS NOT NULL THEN INSERT INTO iam_role_permission (id, role_id, permission_id, scope) VALUES ('rp-hc-prod-verify', r_hc, p_verify, 'global') ON CONFLICT DO NOTHING; END IF;
    IF p_sources IS NOT NULL THEN INSERT INTO iam_role_permission (id, role_id, permission_id, scope) VALUES ('rp-hc-prod-sources', r_hc, p_sources, 'global') ON CONFLICT DO NOTHING; END IF;
  END IF;

  -- 3. Finance Officer & IT Officer -> Global View Only (NO Create, Verify, Sources)
  IF r_fo IS NOT NULL AND p_view IS NOT NULL THEN INSERT INTO iam_role_permission (id, role_id, permission_id, scope) VALUES ('rp-fo-prod-view', r_fo, p_view, 'global') ON CONFLICT DO NOTHING; END IF;
  IF r_it IS NOT NULL AND p_view IS NOT NULL THEN INSERT INTO iam_role_permission (id, role_id, permission_id, scope) VALUES ('rp-it-prod-view', r_it, p_view, 'global') ON CONFLICT DO NOTHING; END IF;

  -- 4. Cluster Manager (cluster_manager) -> Cluster Scope
  IF r_cm IS NOT NULL THEN
    IF p_view IS NOT NULL THEN INSERT INTO iam_role_permission (id, role_id, permission_id, scope) VALUES ('rp-cm-prod-view', r_cm, p_view, 'cluster') ON CONFLICT DO NOTHING; END IF;
    IF p_create IS NOT NULL THEN INSERT INTO iam_role_permission (id, role_id, permission_id, scope) VALUES ('rp-cm-prod-create', r_cm, p_create, 'cluster') ON CONFLICT DO NOTHING; END IF;
    IF p_verify IS NOT NULL THEN INSERT INTO iam_role_permission (id, role_id, permission_id, scope) VALUES ('rp-cm-prod-verify', r_cm, p_verify, 'cluster') ON CONFLICT DO NOTHING; END IF;
    IF p_sources IS NOT NULL THEN INSERT INTO iam_role_permission (id, role_id, permission_id, scope) VALUES ('rp-cm-prod-sources', r_cm, p_sources, 'cluster') ON CONFLICT DO NOTHING; END IF;
  END IF;

  -- 5. Area Manager (area_manager) -> Area Scope
  IF r_am IS NOT NULL THEN
    IF p_view IS NOT NULL THEN INSERT INTO iam_role_permission (id, role_id, permission_id, scope) VALUES ('rp-am-prod-view', r_am, p_view, 'area') ON CONFLICT DO NOTHING; END IF;
    IF p_create IS NOT NULL THEN INSERT INTO iam_role_permission (id, role_id, permission_id, scope) VALUES ('rp-am-prod-create', r_am, p_create, 'area') ON CONFLICT DO NOTHING; END IF;
    IF p_verify IS NOT NULL THEN INSERT INTO iam_role_permission (id, role_id, permission_id, scope) VALUES ('rp-am-prod-verify', r_am, p_verify, 'area') ON CONFLICT DO NOTHING; END IF;
    IF p_sources IS NOT NULL THEN INSERT INTO iam_role_permission (id, role_id, permission_id, scope) VALUES ('rp-am-prod-sources', r_am, p_sources, 'area') ON CONFLICT DO NOTHING; END IF;
  END IF;

  -- 6. Plumber / Agent (agent) -> Scheme Scope (View & Create Only)
  IF r_agent IS NOT NULL THEN
    IF p_view IS NOT NULL THEN INSERT INTO iam_role_permission (id, role_id, permission_id, scope) VALUES ('rp-agent-prod-view', r_agent, p_view, 'scheme') ON CONFLICT DO NOTHING; END IF;
    IF p_create IS NOT NULL THEN INSERT INTO iam_role_permission (id, role_id, permission_id, scope) VALUES ('rp-agent-prod-create', r_agent, p_create, 'scheme') ON CONFLICT DO NOTHING; END IF;
  END IF;

END $$;

COMMIT;
