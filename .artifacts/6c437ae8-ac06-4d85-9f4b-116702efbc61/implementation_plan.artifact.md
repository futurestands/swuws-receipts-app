# Implementation Plan: Accurate Top Debtors List

This plan fixes the "Top Debtors" card on the Performance Dashboard to accurately reflect the 10 customers with the highest outstanding arrears (Account Balance).

## User Review Required

> [!IMPORTANT]
> **Data Accuracy**: This change switches the "Top Debtors" source from calculated bills to the **Live Account Balance**. This ensures that the list is perfectly synced with your USh 1.4B "Total System Arrears" metric.
>
> **Interactive Management**: Clicking a customer name in the list will now take you directly to their **Customer Profile**, allowing you to view their full ledger and follow up on payments.

## Proposed Changes

---

### 1. Database Optimization

#### [MODIFY] [lib/db/schema/crm.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/lib/db/schema/crm.ts)
- Add a database index on the `accountBalance` column.
- This ensures the "Top 10" list loads instantly even as your customer base grows.

#### [NEW] [db/migrations/0035_customer_balance_index.sql](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/db/migrations/0035_customer_balance_index.sql)
- Migration to create the new index.

---

### 2. Reporting Logic Realignment

#### [MODIFY] [app/actions/reports.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/reports.ts)
- **Refactor `getTopDebtors`**:
    - Remove the complex join with `billingRecord`.
    - Query the `customer` table directly.
    - Sort by `accountBalance` descending.
    - Filter for `accountBalance > 0`.
    - Join with `waterScheme` only to display the scheme name for context.

---

### 3. Dashboard Interface Enhancement

#### [MODIFY] [app/dashboard/reports/page.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/dashboard/reports/page.tsx)
- Increase the debtor limit from 5 to **10**.
- Ensure the list items remain clickable and visually distinct.

## Verification Plan

### Automated Verification
- Run `npm run typecheck` to verify no data type regressions.
- Execute unit tests to confirm the reporting engine stability.

### Manual Verification
1. Navigate to the **Reports** dashboard.
2. **Verify**: The "Top Debtors" list now displays 10 customers.
3. **Verify**: The amounts shown are consistent with the "Total System Arrears" (all values > 0).
4. **Verify**: Clicking a customer name redirects to their detail page.
