# Implementation Plan: Connecting Governance Actions to UI

This plan connects the backend "strengthening" logic we built (Receipt Voiding and Customer Deactivation) to the actual User Interface. This ensures that administrators can exercise their permissions directly through the dashboard.

## User Review Required

> [!CAUTION]
> **Financial Reversal**: The "Void" action will trigger an immediate restoration of the customer's balance. This cannot be undone automatically. I am adding a mandatory "Confirmation Dialog" to prevent accidental clicks.

## Proposed Changes

---

### 1. Receipt Management: Voiding Interface

#### [NEW] [void-receipt-button.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/dashboard/receipts/[id]/void-receipt-button.tsx)
- Create a client-side button component for "Voiding."
- Includes an `AlertDialog` confirmation with a text area for the "Void Reason."
- Visibility: Only shown if the user has the `receipts.void` permission.
- Constraint: The button will be disabled if the receipt is already `matched` (reconciled).

#### [MODIFY] [app/dashboard/receipts/[id]/page.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/dashboard/receipts/[id]/page.tsx)
- Import and place the `VoidReceiptButton` next to the `PrintButton`.
- Add a "Voided" watermark/badge to the receipt UI if the audit trail contains a void event (calculated dynamically).

---

### 2. CRM Management: Customer Lifecycle

#### [MODIFY] [app/dashboard/customers/[id]/edit-customer-form.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/dashboard/customers/[id]/edit-customer-form.tsx)
- Add a "Deactivate Customer" (or "Activate") button at the bottom of the form.
- Use `setCustomerActive` action.
- Gated by the `customers.delete` permission.
- Logic: "Deactivated" customers will be excluded from the operational "Quick Search" but remain in the "Report Search."

---

### 3. Reporting Engine Updates

#### [MODIFY] [app/actions/reports.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/reports.ts)
- Update `getCustomerStatement` to explicitly label voided payments in the ledger.

## Verification Plan

### Automated Verification
- Run `npm run typecheck` to ensure new component imports are valid.

### Manual Verification
1. Open a receipt as a **System Administrator**.
2. Click "Void," enter a reason, and confirm.
3. **Verify**: The customer's balance on their profile page increases by the receipt amount.
4. **Verify**: The receipt page now shows a "VOIDED" badge.
5. Deactivate a customer and verify they no longer appear in the "New Receipt" customer picker.
