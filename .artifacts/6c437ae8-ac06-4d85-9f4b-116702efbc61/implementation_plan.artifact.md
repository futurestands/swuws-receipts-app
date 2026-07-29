# Implementation Plan: Fixing Customer Import TypeError

This plan addresses the `TypeError: data.customerAccount.toLowerCase is not a function` error during customer bulk imports. The error occurs when Excel provides numeric values for columns intended to be text, such as account numbers.

## Proposed Changes

### 1. Hardening Import Schemas (Server Side)

#### [MODIFY] [customer-import.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/customer-import.ts)
- Update `customerImportSchema` to use `z.coerce.string()` for `customerAccount` and `schemeName`. This automatically converts numeric Excel cells into text.
- Modify `onValidateRow` to use `String(data.customerAccount).toLowerCase()`. This ensures that even if validation hasn't run yet, the code doesn't crash on non-string values.

#### [MODIFY] [tariff-import.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/tariff-import.ts)
- Update `tariffImportSchema` to use `z.coerce.string()` for `targetName`.
- Apply safe string casting in the `onValidateRow` function.

#### [MODIFY] [billing.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/billing.ts)
- Apply safe string casting in the `onValidateRow` function for `accountNumber`.

## Verification Plan

### Automated Verification
- Run `npm run typecheck` to ensure code stability.

### Manual Verification
1. Attempt to import a customer list where the "CustomerRef" column contains only numbers (e.g., `10001` instead of `C10001`).
2. **Verify**: The system successfully processes the file without crashing.
3. **Verify**: Account numbers are correctly stored as strings in the database.
