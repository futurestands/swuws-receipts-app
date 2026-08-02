# Implementation Plan: Unify Dashboard Stats (Field vs. Import)

This plan ensures that the "Billing Period Management" dashboard accurately reflects financial activity from BOTH manual field readings and bulk imports.

## User Review Required

> [!NOTE]
> Currently, the dashboard only "sees" bills that were imported via Excel. Manual readings captured by agents on their phones are missing from the "Billed" and "Collected" totals. This fix will unify these two sources.

## Proposed Changes

### Database Schema

#### [MODIFY] [finance.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/lib/db/schema/finance.ts)
- Add `billingPeriodId` (text) to the `receipt` table. This will allow us to accurately track which period a payment belongs to, even if it wasn't an imported bill.

### Server Actions

#### [MODIFY] [receipts.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/app/actions/receipts.ts)
- Update `issueReceipt` to save the `billingPeriodId` when a receipt is created (either from a billing record or a manual selection).

#### [MODIFY] [billing.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/app/actions/billing.ts)
- Update `getCollectionSummary` to:
  - Sum `billedAmount` from `meter_reading` + `totalDue` from `billing_record`.
  - Count distinct customers from both tables.
  - Update the "Collected" and "Cash in Hand" logic to include receipts linked to the current period via the new `billingPeriodId` column.

## Verification Plan

### Manual Verification
1. **Field Test:**
   - Open a new billing period.
   - Capture a manual meter reading for a customer (e.g., 50,000 UGX).
   - Go to the Billing dashboard.
   - **Expectation:** "Billed" should now show 50,000 UGX.
2. **Payment Test:**
   - Issue a receipt for that manual reading (e.g., 20,000 UGX).
   - Go to the Billing dashboard.
   - **Expectation:** "Collected" (Operational) should show 20,000 UGX.
3. **Bulk Test:**
   - Import a monthly billing file.
   - **Expectation:** The totals should correctly add up (Field Readings + Imported Bills).
