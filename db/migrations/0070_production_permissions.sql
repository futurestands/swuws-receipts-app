-- Definitions only. Grant/scope assignments require a separately reviewed IAM matrix.
INSERT INTO iam_permission (id, code, module, name, description) VALUES
 ('perm-production-view','production.view','Production','View production','View scoped production records and sources'),
 ('perm-production-create','production.create','Production','Record production','Create and correct own unverified daily records'),
 ('perm-production-verify','production.verify','Production','Verify production','Independently verify, flag, revoke or void records'),
 ('perm-production-sources','production.sources.manage','Production','Manage production sources','Configure and archive scoped water sources')
ON CONFLICT (code) DO NOTHING;
