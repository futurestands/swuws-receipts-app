# Implementation Plan: Separating Operational Cash from Verified Collections

This plan aligns the **Performance Dashboard** with the organizational requirement that receipts are only evidence of cash-in-hand, while the **External Billing System (EBS)** import is the only source of verified revenue.

## User Review Required

> [!IMPORTANT]
> **Source of Truth Shift**: "Monthly Collected" and "Collection Rate %" will now only increase when a bank/EBS report is imported and matched. Receipts will be shown in a separate **"Operational Cash"** card to track money that has been collected but not yet verified by the bank.
>
> **The 30k Mystery**: I have identified that the "USh 30,000" was appearing because the system was incorrectly subtracting "Verified Arrears" (from EBS) from "Total Collections" (from Receipts), leading to a mixed and inaccurate figure.

## Proposed Changes

---

### 1. Re-engineering Reporting Metrics

#### [MODIFY] [app/actions/reports.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/reports.ts)
- **`getDashboardStats`**:
    - **Verified Metrics (EBS)**:
        - `verifiedMonthly`: Sum of matched `daily_collection_record` entries for the selected billing period.
        - `verifiedArrears`: Sum of matched `daily_collection_record` entries linked to *past* billing periods.
    - **Operational Metrics (Receipts)**:
        - `receiptTotal`: Sum of all non-voided `receipt` records.
        - `receiptCount`: Total number of issued receipts.
    - Update the return object to structure these metrics clearly for the UI.

---

### 2. Performance Dashboard UI Updates

#### [MODIFY] [app/dashboard/reports/page.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/dashboard/reports/page.tsx)
- **Row 1 Enhancements**:
    - Update "Arrears Collected" to show `verifiedArrears` (EBS confirmed money against old debt).
- **Row 2 Enhancements**:
    - Add a new Stat Card: **"Operational Cash (Receipts)"**. This will show the total value and count of receipts printed.
    - Update "Monthly Collected" to **"Bank Verified Collections"**. This will show `verifiedMonthly`.
    - Update "Collection Rate" to be calculated strictly using **Bank Verified** money vs. Monthly Billed.

---

### 3. Logic Standardization

#### [MODIFY] [app/actions/billing.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/billing.ts)
- Ensure the `getCollectionSummary` (used on the main dashboard) uses the same "EBS-First" logic to ensure consistency between the Dashboard and the Reports page.

## Verification Plan

### Automated Verification
- Run `npm run typecheck` to verify the updated report data structure.

### Manual Verification
1. Open the Performance Dashboard.
2. **Verify**: A new card "Operational Cash (Receipts)" appears with the sum of all your printed receipts (going beyond the 30k you mentioned).
3. **Verify**: "Bank Verified Collections" shows only money imported from EBS reports.
4. **Verify**: The "Collection Rate" progress bar correctly reflects only the verified bank money.
