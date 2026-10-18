-- 0066_pegasus_event_delete_guard.sql
-- Add DELETE trigger block and signatureVerified flip guard on pegasus_event table

CREATE OR REPLACE FUNCTION check_pegasus_event_security_guard()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent DELETE entirely (audit inbox is append-only)
    IF (TG_OP = 'DELETE') THEN
        RAISE EXCEPTION 'Pegasus event inbox records are immutable and cannot be deleted.';
    END IF;

    -- Prevent flipping signatureVerified from true back to false
    IF (TG_OP = 'UPDATE') THEN
        IF OLD."signatureVerified" = true AND NEW."signatureVerified" = false THEN
            RAISE EXCEPTION 'Once verified, signatureVerified cannot be reverted to false.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pegasus_event_security_guard_trg ON "pegasus_event";
CREATE TRIGGER pegasus_event_security_guard_trg
    BEFORE UPDATE OR DELETE ON "pegasus_event"
    FOR EACH ROW
    EXECUTE FUNCTION check_pegasus_event_security_guard();
