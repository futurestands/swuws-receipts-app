-- SMS lists must be submitted, then approved, before anyone can send.
-- Previously any CRM user with roleLevel >= 10 could press Send Now.

BEGIN;

ALTER TABLE "crm_sms_batch" ADD COLUMN IF NOT EXISTS "submittedAt" timestamp;
ALTER TABLE "crm_sms_batch" ADD COLUMN IF NOT EXISTS "submittedById" text REFERENCES "user"("id") ON DELETE SET NULL;
ALTER TABLE "crm_sms_batch" ADD COLUMN IF NOT EXISTS "approvedAt" timestamp;
ALTER TABLE "crm_sms_batch" ADD COLUMN IF NOT EXISTS "approvedById" text REFERENCES "user"("id") ON DELETE SET NULL;
ALTER TABLE "crm_sms_batch" ADD COLUMN IF NOT EXISTS "rejectedAt" timestamp;
ALTER TABLE "crm_sms_batch" ADD COLUMN IF NOT EXISTS "rejectedById" text REFERENCES "user"("id") ON DELETE SET NULL;
ALTER TABLE "crm_sms_batch" ADD COLUMN IF NOT EXISTS "rejectionReason" text;

-- Unsent lists that used the old "pending = ready to send" meaning become drafts.
UPDATE "crm_sms_batch"
SET status = 'draft'
WHERE status = 'pending';

INSERT INTO "iam_permission" ("id", "code", "module", "name", "description") VALUES
  (gen_random_uuid(), 'crm.sms.create', 'CRM', 'Create SMS lists', 'Build SMS contact lists and submit them for approval. Cannot send.'),
  (gen_random_uuid(), 'crm.sms.approve', 'CRM', 'Approve and send SMS', 'Approve submitted SMS lists and send them. Not granted to ordinary CRM users.')
ON CONFLICT ("code") DO NOTHING;

UPDATE "iam_permission"
SET name = 'Send Bulk SMS (legacy)',
    description = 'Legacy combined create+send. Treated as both Create SMS lists and Approve and send SMS.'
WHERE "code" = 'crm.sms.send';

-- CRM viewers can submit lists.
INSERT INTO "iam_role_permission" ("id", "role_id", "permission_id", "scope")
SELECT gen_random_uuid(), rp."role_id", create_p.id, rp."scope"
FROM "iam_role_permission" rp
JOIN "iam_permission" view_p ON view_p.id = rp."permission_id" AND view_p.code = 'crm.view'
JOIN "iam_permission" create_p ON create_p.code = 'crm.sms.create'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- Anyone already given the old Send permission keeps the right to approve/send
-- and can still create lists.
INSERT INTO "iam_role_permission" ("id", "role_id", "permission_id", "scope")
SELECT gen_random_uuid(), rp."role_id", create_p.id, rp."scope"
FROM "iam_role_permission" rp
JOIN "iam_permission" send_p ON send_p.id = rp."permission_id" AND send_p.code = 'crm.sms.send'
JOIN "iam_permission" create_p ON create_p.code = 'crm.sms.create'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "iam_role_permission" ("id", "role_id", "permission_id", "scope")
SELECT gen_random_uuid(), rp."role_id", approve_p.id, rp."scope"
FROM "iam_role_permission" rp
JOIN "iam_permission" send_p ON send_p.id = rp."permission_id" AND send_p.code = 'crm.sms.send'
JOIN "iam_permission" approve_p ON approve_p.code = 'crm.sms.approve'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- System admin role gets both new codes at global scope.
INSERT INTO "iam_role_permission" ("id", "role_id", "permission_id", "scope")
SELECT gen_random_uuid(), r.id, p.id, 'global'
FROM "iam_role" r
CROSS JOIN "iam_permission" p
WHERE r.code = 'admin' AND p.code IN ('crm.sms.create', 'crm.sms.approve')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

COMMIT;
