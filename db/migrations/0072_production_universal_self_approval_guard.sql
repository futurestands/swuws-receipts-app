-- Additive corrective migration 0072: Universal Self-Approval Guard
-- Enforces at DB trigger level that no water production record can enter 'verified' status
-- if verifiedById is identical to recordedById/submittedById, or if self-reviewed in legacy audit.

CREATE OR REPLACE FUNCTION guard_production_universal_self_approval()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'verified' THEN
    -- Rule 1: A verified record must have an explicit verifier
    IF NEW."verifiedById" IS NULL THEN
      RAISE EXCEPTION 'A verified production record requires an explicit verifiedById';
    END IF;

    -- Rule 2: Universal self-approval prevention (recordedById != verifiedById)
    IF NEW."recordedById" IS NOT NULL AND NEW."verifiedById" = NEW."recordedById" THEN
      RAISE EXCEPTION 'Self-approval is forbidden: An independent verifier must approve water production logs';
    END IF;

    -- Rule 3: Legacy review audit check
    IF EXISTS (
      SELECT 1 FROM audit_log a
      WHERE a."entityType" = 'water_production_log'
        AND a."entityId" = NEW.id
        AND a.action = 'production.log.legacy_review'
        AND a."userId" = NEW."verifiedById"
    ) THEN
      RAISE EXCEPTION 'An independent verifier must approve legacy-reviewed production logs';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS production_universal_self_approval_guard ON water_production_log;

CREATE TRIGGER production_universal_self_approval_guard
  BEFORE INSERT OR UPDATE ON water_production_log
  FOR EACH ROW
  EXECUTE FUNCTION guard_production_universal_self_approval();
