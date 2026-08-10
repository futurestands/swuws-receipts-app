# Fix Billing Import Constraint Violation

The goal is to fix the "Failed query" error during the Monthly Billing Import process. The error occurs when a customer has a credit (negative) balance, which is being inserted into the `currentCharges` column that has a `CHECK (currentCharges >= 0)` constraint.

## Proposed Changes

### Billing Actions

#### [MODIFY] [billing.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/app/actions/billing.ts)

1.  Update the `importBilling` function to ensure values inserted into the `currentCharges` column are never negative.
2.  Refine the "Preview Enhancement" logic in `validateBillingImport` to be safer, although the primary fix will be in the insertion logic to handle any negative values correctly.

```diff
<<<<
            billAmount: String(isNaN(excelMonthlyBill) ? 0 : excelMonthlyBill),
            arrears: String(isNaN(systemArrears) ? 0 : systemArrears),
            currentCharges: String(isNaN(excelReportedArrears) ? 0 : excelReportedArrears),
            totalDue: String(newTotalDue),
====
            billAmount: String(isNaN(excelMonthlyBill) ? 0 : excelMonthlyBill),
            arrears: String(isNaN(systemArrears) ? 0 : systemArrears),
            // Ensure currentCharges (often used for arrears snapshot) never violates DB constraint for negative values
            currentCharges: String(Math.max(0, isNaN(excelReportedArrears) ? 0 : excelReportedArrears)),
            totalDue: String(newTotalDue),
>>>>
```

## Verification Plan

### Automated Tests
- I will attempt to run the existing billing validation logic to ensure no regression in data parsing.

### Manual Verification
- The user can verify by importing a file containing customers with credit balances (negative arrears in the system). The import should now complete successfully instead of showing the "Failed query" toast.
