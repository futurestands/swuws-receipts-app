# Tasks: Synchronizing Admin Dashboard with Voided Transactions

- `[x]` Update `app/actions/admin.ts`
    - `[x]` Add `notInArray` import
    - `[x]` Update `getSystemStats` to filter out voided receipts
    - `[x]` Update `getCollectionsSummary` to filter out voided receipts
    - `[x]` Update `getPrintingReports` to filter out voided receipts
- `[x]` Update `app/actions/financial-stats.ts` to exclude voided records
- `[ ]` Verify system builds and type-checks successfully
- `[ ]` Final walkthrough
