# Implementation Plan - Unified Import Engine (Phase 1: Customer Refactor)

This plan addresses technical debt identified in the forensic audit by centralizing duplicated Excel parsing and data mapping logic into a reusable "Import Engine".

## User Review Required

> [!NOTE]
> This is a foundational refactor. While it won't change how your customers are uploaded, it makes the system more robust, easier to maintain, and faster to add new import types in the future.

## Proposed Changes

### Core Infrastructure

#### [NEW] [import-engine.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/lib/import-engine.ts)
Create a generic utility to handle:
- **Excel Processing**: Standardized `SheetJS` logic to convert files to JSON.
- **Dynamic Mapping**: Reusable logic to apply template-based column aliases.
- **Unified Validation**: A standard wrapper for Zod-based row validation.
- **Reporting**: A consistent structure for import summaries (valid rows, errors, warnings).

### Customer Management

#### [MODIFY] [customer-import.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/customer-import.ts)
Refactor `validateCustomerImport` and `importCustomers` to use the new `import-engine.ts`.
- **Simplification**: Remove manual `XLSX` and mapping code.
- **Reliability**: Ensure identical error handling and data cleaning across all imports.

### Finance & Billing (Future Proofing)

#### [MODIFY] [billing.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/billing.ts)
Update `getImportMapping` to be exported or moved to the shared engine to avoid duplication.

---

## Verification Plan

### Automated Checks
- **Type Check**: Run `tsc --noEmit` to ensure the generic engine correctly handles the `CustomerImportRow` type.

### Manual Verification
1. **Bulk Import Workflow**:
   - Go to **Customers > Bulk Import**.
   - Upload a test Excel file with valid and invalid data.
   - Verify that the validation summary correctly identifies errors (e.g., missing names) and warnings.
   - Proceed with the import and verify that customers are created/updated in the database correctly.
2. **Audit Check**: Verify that `customer.bulk_import_upsert` is still correctly logged in the Admin audit log.
