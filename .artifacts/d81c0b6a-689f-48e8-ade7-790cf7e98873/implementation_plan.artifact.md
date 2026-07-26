# Implementation Plan - Fix Meter Reading Report Data Fetching

The user is unable to fetch data for the Meter Reading Report. This is primarily caused by two issues:
1.  **Date Range Limitation**: The current date filtering logic uses midnight of the end date, effectively excluding all readings captured during that day.
2.  **Irrelevant Filters**: The "Reconciliation Status" filter is confusingly displayed for reports where it doesn't apply.

## Proposed Changes

### Backend Reporting Logic

#### [MODIFY] [executive-reports.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/executive-reports.ts)
Update the date filtering logic for all reports to ensure the end date includes the entire day (up to 23:59:59.999).

```typescript
const start = new Date(filters.startDate)
start.setHours(0, 0, 0, 0)

const end = new Date(filters.endDate)
end.setHours(23, 59, 59, 999)
```

### Reporting UI

#### [MODIFY] [report-generator-client.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/dashboard/reports/catalog/%5Bid%5D/report-generator-client.tsx)
-   Conditionally hide the "Reconciliation Status" filter if the `reportId` is "meter-reading" or "audit-activity", as these don't support reconciliation.
-   Improve the empty state message to be more helpful.

---

## Verification Plan

### Manual Verification
1.  **Fetch Today's Readings**:
    -   Go to the **Meter Reading Report**.
    -   Set both Start and End dates to today.
    -   Click **Fetch Data**.
    -   Verify that readings captured today are now visible.
2.  **UI Cleanliness**:
    -   Verify that the "Reconciliation Status" dropdown is no longer visible for the Meter Reading Report.
    -   Verify it is still visible for the "Receipt Activity Report".
