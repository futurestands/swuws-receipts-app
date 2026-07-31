# Add Balance Range Search for Customers

This plan details the implementation of a balance range filter (Min/Max Arrears) on the Customers page to allow administrators to find customers within specific debt or credit brackets.

## User Review Required

> [!IMPORTANT]
> The search will use the `accountBalance` field, which is displayed as "Arrears" in the UI.
> Positive balances indicate arrears (money owed), while negative balances (if applicable) would indicate credit.

## Proposed Changes

### Backend (Server Actions)

#### [MODIFY] [customers.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/customers.ts)
- Update `searchCustomers` parameters to include optional `minBalance` and `maxBalance` (numbers).
- Import `gte` and `lte` from `drizzle-orm`.
- Add conditions to the `where` clause:
    - If `minBalance` is provided: `gte(customer.accountBalance, minBalance)`
    - If `maxBalance` is provided: `lte(customer.accountBalance, maxBalance)`

### Frontend (Dashboard Pages)

#### [MODIFY] [page.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/dashboard/customers/page.tsx)
- Update `searchParams` type to include `minBalance` and `maxBalance`.
- Extract and parse `minBalance` and `maxBalance` from `searchParams`.
- Pass these values to the `searchCustomers` action.
- Pass these values as `initialMinBalance` and `initialMaxBalance` to the `CustomerSearchBar` component.
- Ensure the pagination links preserve the new balance parameters.

#### [MODIFY] [customer-search-bar.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/dashboard/customers/customer-search-bar.tsx)
- Add `initialMinBalance` and `initialMaxBalance` to props.
- Add state for `minBalance` and `maxBalance` (strings for input handling).
- Add two new `Input` fields in the search form for "Min Balance" and "Max Balance".
- Update `handleSearch` to include `minBalance` and `maxBalance` in the URL search parameters.
- Update `clearFilters` to reset the balance fields.
- Adjust the grid layout (`lg:grid-cols-4` -> `lg:grid-cols-6` or similar) to accommodate the new fields.

## Verification Plan

### Automated Tests
- I will check if I can add a basic unit test if existing tests exist, but primarily I will verify via manual review of the code logic.

### Manual Verification
- Navigate to `/dashboard/customers`.
- Enter a value in "Min Balance" and click Search. Verify only customers with arrears $\ge$ Min are shown.
- Enter a value in "Max Balance" and click Search. Verify only customers with arrears $\le$ Max are shown.
- Enter both values and verify the range search.
- Click "Clear Filters" and verify the balance fields are reset.
- Navigate between pages and verify filters are preserved.
