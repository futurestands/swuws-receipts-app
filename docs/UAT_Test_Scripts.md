# User Acceptance Testing (UAT) Scripts

## Test Case 1: Commercial Receipting
**Role:** Commercial Officer
1. **Precondition**: Active billing period exists.
2. **Steps**:
   - Search for a known customer account.
   - Issue a receipt for UGX 50,000.
   - Print the receipt.
3. **Expected Result**: Receipt is saved, inventory count increments, and print preview opens.

## Test Case 2: Daily Collection Import
**Role:** Finance Officer
1. **Precondition**: Authorized billing uploader role.
2. **Steps**:
   - Upload a valid `.xlsx` export from EBS.
   - Verify preview totals.
   - Confirm import.
3. **Expected Result**: Metadata batch created and individual records visible in repository.

## Test Case 3: Automated Reconciliation
**Role:** Finance Manager
1. **Precondition**: Import batch processed.
2. **Steps**:
   - Open batch details.
   - Click "Run Automated Matching".
3. **Expected Result**: Records change from "Pending" to "Matched" with confidence scores.

## Test Case 4: Scope Isolation
**Role:** Area Manager (Branch Level)
1. **Precondition**: User assigned to a specific branch.
2. **Steps**:
   - Navigate to "All Receipts".
   - Search for a receipt from a different branch.
3. **Expected Result**: No results found; user only sees receipts from their assigned area.

## Test Case 5: Audit Log Integrity
**Role:** Internal Auditor
1. **Precondition**: Sensitive action performed (e.g. role update).
2. **Steps**:
   - Open "Audit Activity Report".
   - Locate the specific action.
3. **Expected Result**: Entry exists with correct timestamp, user, and "Before/After" state.
