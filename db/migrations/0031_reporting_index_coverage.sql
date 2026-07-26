-- Reporting & Dashboard Performance Optimization (Phase 7)
-- Adding missing indices to accelerate hierarchical joins and real-time aggregations.

-- 1. Hierarchy Optimization
CREATE INDEX IF NOT EXISTS "branch_cluster_idx" ON "branch" ("clusterId");

-- 2. Customer Optimization (Redundant but ensures coverage)
CREATE INDEX IF NOT EXISTS "customer_scheme_idx" ON "customer" ("waterSchemeId");

-- 3. Water Scheme Optimization (Redundant but ensures coverage)
CREATE INDEX IF NOT EXISTS "water_scheme_branch_idx" ON "water_scheme" ("branchId");

-- 4. Billing Record Optimization
CREATE INDEX IF NOT EXISTS "billing_record_period_status_idx" ON "billing_record" ("billingPeriodId", "status");
