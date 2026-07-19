# Finance User Manual
**SWUWS Collection & Financial Governance Platform v1.0.0**

## 1. Daily Collection Import
- **Step 1**: Export the "Confirmed Payment Report" from the External Billing System (EBS) as `.xlsx` or `.csv`.
- **Step 2**: Go to **Daily Collections** -> **Import Daily Collection**.
- **Step 3**: Upload the file and verify the preview totals (Records vs Amount).
- **Step 4**: Confirm the import to store the records in the system repository.

## 2. Automated Reconciliation
- **Select Batch**: Open a processed import batch.
- **Run Engine**: Click "Run Automated Matching". The system will match receipts based on References, Account Numbers, and Amounts.
- **Review Summary**: Inspect the Match Progress and Confidence Breakdown.

## 3. Exception Management
- **Queue**: Open the **Exceptions** module to view mismatches (e.g., Unmatched Receipts).
- **Investigate**: Click a case to view side-by-side data from SWUWS and EBS.
- **Resolve**: Add notes and select a resolution reason (e.g., "Verified Manual Match").

## 4. Final Sign-off
- **Approval**: Once exceptions are resolved, submit the batch for approval.
- **Locking**: Once approved by a Manager, the batch becomes read-only for audit integrity.
