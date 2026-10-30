-- REVIEW ONLY. Outside db/migrations/ intentionally.
-- Idempotent, transactional repair script for canonical SWUWS organization hierarchy.
-- Does NOT alter existing scheme, branch, cluster, or user IDs.
-- Excludes unverified/external user accounts from organization assignment.

BEGIN;

DO $$
DECLARE
  v_org_name text;
  v_org_code text;
  v_org_id text := 'org-swuws';
BEGIN
  -- 1. Resolve canonical organization name and code from org_settings if available
  SELECT COALESCE(NULLIF(trim("orgName"), ''), 'South Western Umbrella of Water and Sanitation'),
         COALESCE(NULLIF(trim("receiptPrefix"), ''), 'SWUWS')
  INTO v_org_name, v_org_code
  FROM org_settings
  LIMIT 1;

  IF v_org_name IS NULL THEN
    v_org_name := 'South Western Umbrella of Water and Sanitation';
    v_org_code := 'SWUWS';
  END IF;

  -- 2. Upsert canonical parent organization
  INSERT INTO organization (id, name, code, active, "createdAt")
  VALUES (v_org_id, v_org_name, v_org_code, true, NOW())
  ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, active = true;

  -- 3. Link unassociated clusters (ANKOLE, KIGEZI, RUJUMBURA, ISINGIRO) to parent organization
  UPDATE cluster
  SET "organizationId" = (SELECT id FROM organization WHERE code = v_org_code LIMIT 1)
  WHERE "organizationId" IS NULL;

  -- 4. Associate verified system managers and assigned staff to parent organization
  UPDATE "user" u
  SET "organizationId" = (SELECT id FROM organization WHERE code = v_org_code LIMIT 1)
  WHERE u."organizationId" IS NULL
    AND u.active = true
    AND (
      u.role IN ('admin', 'head_commercial', 'finance_officer', 'it_officer', 'area_manager', 'area_engineer', 'cluster_manager', 'commercial_officer', 'manager')
      OR u."schemeId" IS NOT NULL
      OR u."branchId" IS NOT NULL
      OR u."clusterId" IS NOT NULL
    );
END $$;

COMMIT;
