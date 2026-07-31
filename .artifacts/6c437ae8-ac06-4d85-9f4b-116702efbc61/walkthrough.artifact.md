# Walkthrough: Balance Range Search for Customers

I have successfully added a balance range filter to the Customers dashboard. This allows users to find customers based on their current arrears (account balance).

## Changes Made

### Backend
- **Server Action**: Updated `searchCustomers` in [customers.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/customers.ts) to accept `minBalance` and `maxBalance`.
- **Database Query**: Added `gte` (greater than or equal) and `lte` (less than or equal) conditions to the Drizzle ORM query for the `accountBalance` column.

### Frontend
- **Page Logic**: Updated the [Customers Page](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/dashboard/customers/page.tsx) to parse `minBalance` and `maxBalance` from the URL search parameters and pass them to the backend action.
- **Pagination**: Updated pagination links to ensure that active balance filters are preserved when moving between pages.
- **Search Bar UI**: Modified the [Customer Search Bar](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/dashboard/customers/customer-search-bar.tsx) to include two new numeric input fields: "Min Arrears" and "Max Arrears".
- **State Management**: Ensured that the search bar maintains the current filter values in its state and can clear them using the "X" button.

## Verification Results

### Logic Check
- The backend correctly applies `gte` for `minBalance` and `lte` for `maxBalance`.
- The frontend correctly syncs state with URL parameters.
- Pagination preserves all active filters (Query, Branch, Scheme, Min Arrears, Max Arrears).

### UI Layout
- The search form grid was expanded to `lg:grid-cols-6` to accommodate the new fields while remaining responsive on smaller screens.
