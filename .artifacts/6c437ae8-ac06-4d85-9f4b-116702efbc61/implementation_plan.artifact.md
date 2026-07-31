# Implementation Plan - Customer Excel Export

Add a feature to download the filtered customer list as an Excel file.

## User Review Required

> [!NOTE]
> The export will respect the current filters (Text search, Branch, Water Scheme, and Balance Range).

## Proposed Changes

### Backend (Server Actions)

#### [MODIFY] [customers.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/customers.ts)
- Add `import * as XLSX from "xlsx"` at the top.
- Add `exportCustomersExcel` server action:
    - Accepts same filters as `searchCustomers`.
    - Queries all matching customers (no pagination).
    - Maps data to a clean format for Excel (Name, Account #, Phone, Branch, Scheme, Arrears, etc.).
    - Returns the Excel file as a base64 string.

### Frontend (Dashboard)

#### [MODIFY] [customer-search-bar.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/dashboard/customers/customer-search-bar.tsx)
- Add `Download` icon from `lucide-react`.
- Add `exportCustomersExcel` to the list of imported actions.
- Add `isExporting` state using `useState`.
- Add `handleExport` function:
    - Calls `exportCustomersExcel` with current state values (query, branchId, etc.).
    - Triggers a browser download of the generated file.
- Add a "Download Excel" button in the search bar area (next to Bulk Import).

## Verification Plan

### Manual Verification
1. Navigate to the Customers dashboard.
2. Apply some filters (e.g., a specific Branch or a Balance Range).
3. Click the "Download Excel" button.
4. Verify that the downloaded file contains the correct filtered data and is properly formatted.
