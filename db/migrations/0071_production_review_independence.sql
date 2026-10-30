-- Additive remediation: retain all measurements and immutable audit history.
-- Apply after 0069/0070 inside the migration runner's transaction.
-- Stop for human reconciliation if an already verified row used self-reviewed legacy data.
LOCK TABLE water_production_log IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS (
  SELECT 1 FROM water_production_log p JOIN audit_log a ON a."entityId" = p.id
  WHERE p."workflowVersion" = 1 AND p.status = 'verified'
   AND a."entityType" = 'water_production_log' AND a.action = 'production.log.legacy_review'
   AND a."userId" = p."verifiedById"
 ) THEN RAISE EXCEPTION 'Production preflight: self-reviewed legacy approvals require authorised reconciliation'; END IF;
END $$;

CREATE OR REPLACE FUNCTION guard_production_review_independence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."workflowVersion" = 1 AND NEW.status = 'verified' AND EXISTS (
  SELECT 1 FROM audit_log a WHERE a."entityType" = 'water_production_log'
   AND a."entityId" = NEW.id AND a.action = 'production.log.legacy_review'
   AND a."userId" = NEW."verifiedById"
 ) THEN RAISE EXCEPTION 'An independent verifier must approve legacy-reviewed production'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS production_review_independence_guard ON water_production_log;
CREATE TRIGGER production_review_independence_guard BEFORE INSERT OR UPDATE ON water_production_log
 FOR EACH ROW EXECUTE FUNCTION guard_production_review_independence();
