# Walkthrough: Fixing Top Debtors logic

I have successfully fixed the "Top Debtors" card on the Performance Dashboard. The card now correctly displays the customers with the highest outstanding debt, and each entry is clickable for easy follow-up.

## Changes Made

### 1. Accurate Data Source
Pivoted the `getTopDebtors` logic to use the **Live Account Balance** instead of calculating from system-only bills.
- **Location**: [reports.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/reports.ts)
- **Result**: The list now accurately reflects the total debt owed by each customer, including their opening balances and historical arrears. This ensures the card is perfectly synced with your USh 1.4B "Total System Arrears" metric.

### 2. Enhanced UI & Navigation
Updated the dashboard to show more debtors and provide one-click navigation to their profiles.
- **Location**: [page.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/dashboard/reports/page.tsx)
- **Increase**: Expanded the list from 5 to **10 debtors**.
- **Interactivity**: Clicking a customer's name now takes you directly to their **Customer Profile** ([e.g. /dashboard/customers/[id]](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/dashboard/customers/%5Bid%5D/page.tsx)), allowing you to review their full ledger and follow up on their debt.

### 3. Database Performance
Added a database index on the `accountBalance` column to ensure the list remains fast as you onboard more customers.
- **Location**: [crm.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/lib/db/schema/crm.ts)
- **Migration**: [0035_customer_balance_index.sql](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/db/migrations/0035_customer_balance_index.sql)

## Verification Results

### Build & Type Check
- **Status**: **PASS**
- **Notes**: All UI links and action return types are verified.

### Operational Clarity
- Verified that the "Top Debtors" list is now populated and consistent with the organization's arrears pool.
- Confirmed that only "Active" customers are included in the top debtor calculation.

---

> [!TIP]
> **Management Tip**: You can now use this card as a "Priority List" for collections. Simply click on the top debtor to see their contact info and full payment history.
