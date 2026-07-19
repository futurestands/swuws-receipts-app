-- Production Performance Hardening (Phase 6)
-- Adding missing indices for high-volume collection and audit tables.

-- 1. Receipt Optimization
CREATE INDEX IF NOT EXISTS "receipt_customer_account_idx" ON "receipt" ("customerAccount");
CREATE INDEX IF NOT EXISTS "receipt_payment_date_idx" ON "receipt" ("paymentDate");
CREATE INDEX IF NOT EXISTS "receipt_amount_idx" ON "receipt" ("amount");

-- 2. Daily Collection Record Optimization
CREATE INDEX IF NOT EXISTS "daily_collection_record_account_no_idx" ON "daily_collection_record" ("accountNumber");
CREATE INDEX IF NOT EXISTS "daily_collection_record_pay_date_idx" ON "daily_collection_record" ("paymentDate");
CREATE INDEX IF NOT EXISTS "daily_collection_record_amount_idx" ON "daily_collection_record" ("amount");

-- 3. Audit & Logging Optimization
CREATE INDEX IF NOT EXISTS "audit_log_user_id_idx" ON "audit_log" ("userId");
CREATE INDEX IF NOT EXISTS "audit_log_action_idx" ON "audit_log" ("action");
CREATE INDEX IF NOT EXISTS "audit_log_entity_idx" ON "audit_log" ("entityType", "entityId");

-- 4. Notification Optimization
CREATE INDEX IF NOT EXISTS "notification_type_priority_idx" ON "notification" ("type", "priority");
