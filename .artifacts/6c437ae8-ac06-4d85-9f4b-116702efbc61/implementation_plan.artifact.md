# Implementation Plan: Pivoting to EBS-Confirmed Financial Reporting

This plan aligns the system's metrics with the organizational reality: **Receipts are evidence of cash-in-hand, but the External Billing System (EBS) import is the only source of "Official Collected" data.**

## User Review Required

> [!IMPORTANT]
> **Dashboard Metric Shift**: "Official Collected" and "Collection %" will now only increase AFTER you import the daily bank/EBS report. Receipts printed today will show up in a separate "Cash to be Deposited" KPI.
>
> **Arrears Logic**: "Arrears Collected" will now be calculated based on EBS records that are reconciled against older billing periods or unmatched receipts, rather than just "unlinked" receipts.

## Proposed Changes

---

### 1. Dashboard: Operational vs. Official Metrics

#### [MODIFY] [app/actions/billing.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/billing.ts)
- **`getCollectionSummary`**:
    - Change `totalCollected` source from `receipt` table to `daily_collection_record` (sum of amounts in the current billing period's date range).
    - Add a new metric: `cashInHand` (sum of `receipts` issued but not yet matched/deposited).

#### [MODIFY] [app/dashboard/page.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/dashboard/page.tsx)
- Add a third Stat Card: **"Unverified Cash (In-Hand)"**.
- Label the existing Collected card as **"Official Bank Collections"**.

---

### 2. Reporting: Re-engineering "Arrears Collected"

#### [MODIFY] [app/actions/reports.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/reports.ts)
- **`getDashboardStats`**:
    - Update the `collections` object to pull from `reconciliation_match` and `daily_collection_record`.
    - **Confirmed Arrears**: Count an EBS record as "Arrears Collection" only if it matches a debt from a *previous* billing period.

---

### 3. Reconciliation Governance

#### [MODIFY] [app/actions/reconciliation.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/reconciliation.ts)
- Add a check to ensure that when an EBS record is "Matched" to an older debt, it triggers an audit log specifically categorized as "Arrears Resolution."

## Verification Plan

### Automated Verification
- Update `math.test.ts` to include scenarios where Receipts > EBS Deposits (showing unverified cash) and EBS Deposits > Receipts (showing direct bank payments).

### Manual Verification
1. Issue a USh 10,000 receipt. **Verify**: Dashboard "Official Collections" remains unchanged, but "Cash In-Hand" increases.
2. Import an EBS report containing that USh 10,000 deposit. **Verify**: Dashboard "Official Collections" now increases, and "Collection Progress %" updates.
3. Verify the "Arrears Collected" metric only updates after the EBS record is processed.
