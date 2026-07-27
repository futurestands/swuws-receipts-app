-- 0036_maintenance_bypass_trigger.sql
--
-- Adds a "Maintenance Bypass" path to the immutability triggers.
-- This allows the system administrator to perform a full data purge
-- when preparing for production, without permanently disabling the
-- security controls for normal operation.
--
-- The bypass is activated by setting a session variable:
-- SET app.allow_operational_wipe = 'true';

BEGIN;

-- 1. Update Receipt Mutation Guard
CREATE OR REPLACE FUNCTION reject_receipt_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check if the maintenance bypass is active for this session
  IF current_setting('app.allow_operational_wipe', true) = 'true' THEN
    RETURN OLD; -- Allow the deletion
  END IF;

  RAISE EXCEPTION
    'Receipts are immutable: % is not permitted on "receipt" (id=%). Create a correction record instead of modifying the original.',
    tg_op, COALESCE(OLD.id, 'unknown')
    USING ERRCODE = '0LTIN';
END;
$$;

-- 2. Update Attachment Mutation Guard
CREATE OR REPLACE FUNCTION reject_attachment_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.allow_operational_wipe', true) = 'true' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'Receipt attachments are append-only: % is not permitted on "receipt_attachment" (id=%).',
    tg_op, COALESCE(OLD.id, 'unknown')
    USING ERRCODE = '0LTIN';
END;
$$;

-- 3. Update Audit Log Mutation Guard
CREATE OR REPLACE FUNCTION reject_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.allow_operational_wipe', true) = 'true' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'Audit log entries are immutable: % is not permitted on "audit_log" (id=%).',
    tg_op, COALESCE(OLD.id, 'unknown')
    USING ERRCODE = '0LTIN';
END;
$$;

COMMIT;
