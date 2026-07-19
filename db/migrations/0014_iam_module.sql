-- IAM Module Migration (Fixed snake_case and quoting)

-- Cleanup partial attempts if any
DROP TABLE IF EXISTS "iam_role_permission";
DROP TABLE IF EXISTS "iam_permission";
DROP TABLE IF EXISTS "iam_role" CASCADE;

-- Create IAM Tables
CREATE TABLE "iam_role" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"level" integer DEFAULT 0 NOT NULL,
	"parent_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "iam_role_code_idx" ON "iam_role" ("code");
CREATE INDEX "iam_role_parent_idx" ON "iam_role" ("parent_id");
ALTER TABLE "iam_role" ADD CONSTRAINT "iam_role_parentId_fkey" FOREIGN KEY ("parent_id") REFERENCES "iam_role"("id") ON DELETE SET NULL;

CREATE TABLE "iam_permission" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"module" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "iam_permission_code_idx" ON "iam_permission" ("code");
CREATE INDEX "iam_permission_module_idx" ON "iam_permission" ("module");

CREATE TABLE "iam_role_permission" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"permission_id" text NOT NULL,
	"scope" text DEFAULT 'own' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "iam_role_permission_unq" ON "iam_role_permission" ("role_id","permission_id");
CREATE INDEX "iam_role_permission_role_idx" ON "iam_role_permission" ("role_id");
ALTER TABLE "iam_role_permission" ADD CONSTRAINT "iam_role_permission_roleId_fkey" FOREIGN KEY ("role_id") REFERENCES "iam_role"("id") ON DELETE CASCADE;
ALTER TABLE "iam_role_permission" ADD CONSTRAINT "iam_role_permission_permissionId_fkey" FOREIGN KEY ("permission_id") REFERENCES "iam_permission"("id") ON DELETE CASCADE;

-- Add iamRoleId to user table
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "iamRoleId" text;
-- (Foreign key might already exist if we are rerunning, so we check existence if possible or just use a standard alter)
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_iamRoleId_fkey";
ALTER TABLE "user" ADD CONSTRAINT "user_iamRoleId_fkey" FOREIGN KEY ("iamRoleId") REFERENCES "iam_role"("id") ON DELETE SET NULL;

-- 1. Seed Permissions
INSERT INTO "iam_permission" ("id", "code", "module", "name", "description") VALUES
(gen_random_uuid(), 'dashboard.view', 'Dashboard', 'View Dashboard', 'Access to the main dashboard'),
(gen_random_uuid(), 'dashboard.metrics.view', 'Dashboard', 'View Key Metrics', 'View high-level financial metrics'),
(gen_random_uuid(), 'collection.view', 'Collection', 'View Billing Periods', 'View current and past billing periods'),
(gen_random_uuid(), 'collection.create', 'Collection', 'Create Billing Period', 'Ability to create new billing cycles'),
(gen_random_uuid(), 'collection.edit', 'Collection', 'Edit Billing Period', 'Edit period details in Draft status'),
(gen_random_uuid(), 'collection.activate', 'Collection', 'Activate Billing Period', 'Trigger Start of Collection'),
(gen_random_uuid(), 'collection.close', 'Collection', 'Close Billing Period', 'End receipt issuance for a period'),
(gen_random_uuid(), 'collection.archive', 'Collection', 'Archive Billing Period', 'Move period to historical archives'),
(gen_random_uuid(), 'billing.import', 'Billing Import', 'Import Monthly Billing', 'Upload billing files from external system'),
(gen_random_uuid(), 'billing.history.view', 'Billing Import', 'View Import History', 'See history of all billing uploads'),
(gen_random_uuid(), 'receipts.view', 'Receipts', 'View Receipts', 'Browse and search issued receipts'),
(gen_random_uuid(), 'receipts.create', 'Receipts', 'Issue Receipt', 'Create new payment receipts'),
(gen_random_uuid(), 'receipts.print', 'Receipts', 'Print Receipt', 'Initial printing of receipts'),
(gen_random_uuid(), 'receipts.reprint', 'Receipts', 'Reprint Receipt', 'Printing additional copies of receipts'),
(gen_random_uuid(), 'receipts.void', 'Receipts', 'Void Receipt', 'Cancel or void incorrect receipts'),
(gen_random_uuid(), 'receipts.attachments.upload', 'Receipts', 'Upload Attachments', 'Add proof documents to receipts'),
(gen_random_uuid(), 'customers.view', 'Customers', 'View Customers', 'View customer profiles and history'),
(gen_random_uuid(), 'customers.create', 'Customers', 'Create Customer', 'Add new customer profiles'),
(gen_random_uuid(), 'customers.edit', 'Customers', 'Edit Customer', 'Modify customer details'),
(gen_random_uuid(), 'customers.delete', 'Customers', 'Delete Customer', 'Remove customer records'),
(gen_random_uuid(), 'customers.import', 'Customers', 'Import Customers', 'Bulk upload customer records'),
(gen_random_uuid(), 'reports.view', 'Reports', 'View Reports', 'Access to collection and performance reports'),
(gen_random_uuid(), 'reports.export', 'Reports', 'Export Reports', 'Download reports in CSV/PDF format'),
(gen_random_uuid(), 'users.view', 'Users', 'View Users', 'View system users and agents'),
(gen_random_uuid(), 'users.create', 'Users', 'Create User', 'Create new user accounts'),
(gen_random_uuid(), 'users.edit', 'Users', 'Edit User', 'Modify user details and roles'),
(gen_random_uuid(), 'users.disable', 'Users', 'Disable User', 'Deactivate system access for a user'),
(gen_random_uuid(), 'users.reset_password', 'Users', 'Reset Password', 'Trigger password resets for users'),
(gen_random_uuid(), 'roles.view', 'IAM', 'View Roles', 'View system roles and hierarchy'),
(gen_random_uuid(), 'roles.manage', 'IAM', 'Manage Roles', 'Create, edit, and assign roles'),
(gen_random_uuid(), 'permissions.view', 'IAM', 'View Permissions', 'View the permission matrix'),
(gen_random_uuid(), 'branding.manage', 'Branding', 'Manage Branding', 'Update org logo, name, and receipt layout'),
(gen_random_uuid(), 'system.settings.manage', 'System', 'Manage Settings', 'Update global system configuration'),
(gen_random_uuid(), 'system.audit.view', 'System', 'View Audit Logs', 'Access the immutable system audit log'),
(gen_random_uuid(), 'system.audit.export', 'System', 'Export Audit Logs', 'Download audit logs');

-- 2. Seed Default Roles
INSERT INTO "iam_role" ("id", "name", "code", "description", "level", "is_system") VALUES
(gen_random_uuid(), 'System Administrator', 'admin', 'Full system access and security governance', 10, true),
(gen_random_uuid(), 'Head Commercial', 'head_commercial', 'Organizational management and revenue oversight', 8, true),
(gen_random_uuid(), 'Finance Officer', 'finance_officer', 'Reconciliation, reporting and financial audit', 7, true),
(gen_random_uuid(), 'Cluster Manager', 'cluster_manager', 'Regional management of multiple areas', 6, true),
(gen_random_uuid(), 'Commercial Officer', 'commercial_officer', 'Area-level oversight and billing management', 5, true),
(gen_random_uuid(), 'Plumber (Agent)', 'agent', 'Local collections and receipt issuance', 1, true);

-- 3. Map Role Permissions (Initial Setup)

-- Admin gets everything (global scope)
INSERT INTO "iam_role_permission" ("id", "role_id", "permission_id", "scope")
SELECT gen_random_uuid(), r.id, p.id, 'global'
FROM "iam_role" r, "iam_permission" p
WHERE r.code = 'admin';

-- Head Commercial gets most things (global scope)
INSERT INTO "iam_role_permission" ("id", "role_id", "permission_id", "scope")
SELECT gen_random_uuid(), r.id, p.id, 'global'
FROM "iam_role" r, "iam_permission" p
WHERE r.code = 'head_commercial'
AND p.code NOT IN ('system.settings.manage', 'collection.archive', 'roles.manage');

-- Commercial Officer (Area scope)
INSERT INTO "iam_role_permission" ("id", "role_id", "permission_id", "scope")
SELECT gen_random_uuid(), r.id, p.id, 'area'
FROM "iam_role" r, "iam_permission" p
WHERE r.code = 'commercial_officer'
AND p.code IN ('dashboard.view', 'collection.view', 'billing.import', 'billing.history.view', 'receipts.view', 'receipts.create', 'receipts.print', 'customers.view', 'customers.create', 'customers.edit', 'reports.view');

-- Plumber (Scheme scope)
INSERT INTO "iam_role_permission" ("id", "role_id", "permission_id", "scope")
SELECT gen_random_uuid(), r.id, p.id, 'scheme'
FROM "iam_role" r, "iam_permission" p
WHERE r.code = 'agent'
AND p.code IN ('dashboard.view', 'receipts.view', 'receipts.create', 'receipts.print', 'customers.view');

-- 4. Initial backfill of User Role IDs
UPDATE "user" u
SET "iamRoleId" = r.id
FROM "iam_role" r
WHERE u.role = r.code;
