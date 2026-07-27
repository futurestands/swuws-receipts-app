# Implementation Plan: System Reset Tool (Fresh Start)

This plan provides a secure, one-time utility for administrators to wipe all test data (receipts, bills, customers) while preserving the system configuration (users, roles, areas, tariffs). This prepares the system for "Go-Live" with real data.

## User Review Required

> [!CAUTION]
> **PERMANENT DATA LOSS**: This action will permanently delete all existing customers, receipts, and billing history. It **cannot be undone**. It is designed specifically for the transition from testing to production.

## Proposed Changes

---

### 1. Administrative Data Purge Engine

#### [MODIFY] [app/actions/admin.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/admin.ts)
- **`wipeOperationalData`**: A new server action restricted to `system_admin`.
- **Target Tables**:
    - **Finance**: `receipt`, `receipt_print_history`, `receipt_attachment`.
    - **Billing**: `billing_record`, `billing_run`, `billing_upload`, `meter_reading`.
    - **CRM**: `customer` (to allow fresh import of real accounts).
    - **Reconciliation**: `daily_collection_record`, `daily_collection_import`, `reconciliation_match`, `reconciliation_exception`, `reconciliation_approval`.
    - **Audit**: `audit_log` (clears the testing trail).
- **Sequence Reset**: Resets the `receipt_seq` to 1 so the first real receipt starts at #000001.

---

### 2. Admin Interface: The "Fresh Start" Button

#### [NEW] [system-reset-panel](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/admin/system-reset-panel.tsx)
- A high-visibility, "Danger Zone" component.
- Features:
    - **Safety Lock**: Requires typing the word "RESET" to enable the button.
    - **Verification**: Prominent warning about what is deleted vs. what is kept.

#### [MODIFY] [admin-tabs.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/admin/admin-tabs.tsx)
- Add a "Maintenance" or "System Reset" tab visible only to the highest authority.

## Verification Plan

### Automated Verification
- Run `npm run typecheck` to ensure the new action and component are correctly typed.

### Manual Verification
1. Log in as a **System Administrator**.
2. Navigate to **Admin > Maintenance**.
3. Type "RESET" in the safety box.
4. Click the **"Purge All Test Data"** button.
5. **Verify**: Dashboard cards (Receipts, Arrears) return to USh 0.
6. **Verify**: Customer list is empty and ready for real import.
7. **Verify**: Area Offices, Schemes, and Tariffs are STILL PRESENT (preserved configuration).
