-- Migration: 0050_crm_scheme_support
-- Added: schemeId support to CRM complaints

ALTER TABLE "crm_complaint" ADD COLUMN "schemeId" text REFERENCES "water_scheme"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "crm_complaint_scheme_idx" ON "crm_complaint" ("schemeId");
