-- 0049_crm_complaint_language.sql
-- Adds language support to CRM complaints.

BEGIN;

ALTER TABLE "crm_complaint" ADD COLUMN IF NOT EXISTS "language" text DEFAULT 'English';

COMMIT;
