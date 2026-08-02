# Implementation Plan: Unify Performance Dashboard (Field vs. Import)

This plan ensures that the "Performance Dashboard" (`/dashboard/reports`) reflects financial activity from BOTH manual field readings and bulk imports, matching the logic recently applied to the Billing Management page.

## User Review Required

> [!NOTE]
> Currently, the "Performance Dashboard" is only reporting on imported Excel bills. Manual readings captured in the field are missing from the "Monthly Billed" totals. I will merge these two sources so you get a complete picture of company performance.

## Proposed Changes

### Server Actions

#### [MODIFY] [reports.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/app/actions/reports.ts)
- **Aggregation:** Update `getDashboardStats` to query both `billingRecord` (imports) and `meterReading` (manual entries).
  - Sum `totalDue`/`billedAmount` for the "Monthly Billed" metric.
  - Sum `arrears`/`previousBalanceSnapshot` for the "Arrears Billed" metric.
  - Combine distinct customer counts.
- **Receipt Filtering:** Update "Operational Cash" logic to use the new `billingPeriodId` column if a specific period is selected in the filters. This ensures you only see cash collected for the period you are looking at.
- **Waterfall Matching:** Update the "Bank Verified" logic to use the new `receipt.billingPeriodId` for period-specific filtering.

## Verification Plan

### Manual Verification
1. **Reporting Test:**
   - Go to the Performance Dashboard.
   - Select the current billing period.
   - **Expectation:** "Monthly Billed" should now show the total from both your field tests and any imports.
2. **Cash Filtering:**
   - Filter by a different period.
   - **Expectation:** "Operational Cash" should update to show only money collected for that specific month.
