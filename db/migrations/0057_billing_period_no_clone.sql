-- Auto-open raced and cloned empty "August 2026" periods beside the real one.
-- Keep the oldest row for each bill month; archive empty clones. Never delete runs.

WITH ranked AS (
  SELECT
    bp.id,
    ROW_NUMBER() OVER (
      PARTITION BY bp.month, bp.year
      ORDER BY bp."createdAt" ASC, bp.id ASC
    ) AS rn,
    COALESCE((SELECT COUNT(*) FROM billing_run br WHERE br."billingPeriodId" = bp.id), 0) AS runs,
    COALESCE((SELECT COUNT(*) FROM billing_record rec WHERE rec."billingPeriodId" = bp.id), 0) AS records
  FROM billing_period bp
  WHERE bp.status <> 'archived'
)
UPDATE billing_period bp
SET
  status = 'archived',
  "isOpen" = false,
  "archivedAt" = NOW(),
  "updatedAt" = NOW()
FROM ranked r
WHERE bp.id = r.id
  AND r.rn > 1
  AND r.runs = 0
  AND r.records = 0;

CREATE UNIQUE INDEX IF NOT EXISTS billing_period_one_active_idx
  ON billing_period ((true)) WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS billing_period_month_year_live_idx
  ON billing_period (month, year) WHERE status <> 'archived';
