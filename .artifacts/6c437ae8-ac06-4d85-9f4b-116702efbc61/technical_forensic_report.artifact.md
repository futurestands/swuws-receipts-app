# Technical Forensic Report: System Stability & Deployment Audit

**Status:** Ongoing Investigation
**Focus:** Production 500 Errors and "Data Unavailable" Popups

## 1. Identified Architectural Risks
After reviewing the backend logic in `app/actions`, several areas pose risks to production stability due to high join complexity and potential timeouts on Vercel.

### A. Reporting Engine (High Risk)
*   **The "All-Time" Trap:** If no active billing period exists, the dashboard tries to aggregate every record in the database. On a production dataset with 10k+ customers, this exceeds the 10-second Vercel execution limit.
*   **Join Waterfall:** `getDashboardStats` performs a 7-table join to calculate arrears splits in real-time. This is mathematically correct but computationally expensive for a live dashboard.
*   **Audit Join:** Filtering voided receipts using a `LEFT JOIN` on the `audit_log` table without filtering by `entityType` first is slow.

### B. Billing Dashboard (Medium Risk)
*   **Raw SQL Union:** `getCollectionSummary` uses a raw SQL `UNION` to count distinct customers. If the database driver or schema has slight naming variations (quotes/case), this will crash the page.
*   **Missing Table Guards:** Several queries assume that `billing_record` and `meter_reading` exist and are populated. On a fresh environment, these might return nulls that the UI doesn't handle gracefully.

## 2. Evidence of "Hidden" or Unfinished Code
I scanned the repository for non-standard files and found the following:
*   **Untracked Folders:** `RECEIPT/` and `app/test/` exist on disk but are not tracked by Git. These likely contain experimental work or sensitive local data.
*   **Dead Column References:** I found several instances where code was trying to update `updatedAt` columns on tables that don't have them in the SQL migrations (fixed in previous turn).

## 3. Remediation Strategy

| Category | Action Taken / Planned |
| :--- | :--- |
| **Stability** | Added `safeProgress` to prevent division-by-zero crashes. |
| **Stability** | Wrapped dashboard fetches in `try/catch` with "Data Unavailable" UI. |
| **Performance** | Optimized voided receipt filtering to use indexed paths. |
| **Performance** | (PLANNED) Decouple Arrears calculation from the main dashboard to a separate background pass. |
| **Alignment** | Verifying that all `billing_period` logic enforces the `active` status before allowing collections. |

## 4. Final Recommendation to User
The system is functionally sound on `localhost` because the data volume is low. The production crashes are primarily **"Efficiency Wall"** issues where the cloud server is giving up on heavy math.

**I am currently streamlining these queries to ensure they finish in < 2 seconds.**
