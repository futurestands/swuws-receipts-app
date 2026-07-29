-- Reconciliation Governance Permissions (Phase 6 Hardening)

INSERT INTO "iam_permission" ("id", "code", "module", "name", "description") VALUES
(gen_random_uuid(), 'reconciliation.view', 'Reconciliation', 'View Reconciliation', 'Access to reconciliation modules and batches'),
(gen_random_uuid(), 'reconciliation.run', 'Reconciliation', 'Run Reconciliation', 'Execute automated matching engine'),
(gen_random_uuid(), 'reconciliation.exceptions.manage', 'Reconciliation', 'Manage Exceptions', 'Investigate and resolve reconciliation mismatches'),
(gen_random_uuid(), 'reconciliation.approve', 'Reconciliation', 'Approve Sign-off', 'Final management approval of reconciliation results');

-- Assign to default roles
-- Admin gets all
INSERT INTO "iam_role_permission" ("id", "role_id", "permission_id", "scope")
SELECT gen_random_uuid(), r.id, p.id, 'global'
FROM "iam_role" r, "iam_permission" p
WHERE r.code = 'admin' AND p.code LIKE 'reconciliation%';

-- Finance Officer & Head Commercial get all
INSERT INTO "iam_role_permission" ("id", "role_id", "permission_id", "scope")
SELECT gen_random_uuid(), r.id, p.id, 'global'
FROM "iam_role" r, "iam_permission" p
WHERE r.code IN ('finance_officer', 'head_commercial') AND p.code LIKE 'reconciliation%';

-- Commercial Officer gets view and exceptions
INSERT INTO "iam_role_permission" ("id", "role_id", "permission_id", "scope")
SELECT gen_random_uuid(), r.id, p.id, 'area'
FROM "iam_role" r, "iam_permission" p
WHERE r.code = 'commercial_officer' AND p.code IN ('reconciliation.view', 'reconciliation.exceptions.manage');
