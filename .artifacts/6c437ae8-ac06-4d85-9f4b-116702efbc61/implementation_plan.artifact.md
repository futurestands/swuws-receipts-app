# Phase 12: Final Audit Closure & Technical Hardening

This plan addresses the final high-leverage items from the Pass 4 Forensic Re-Audit, focusing on administrative transparency, financial race-condition prevention, and production-ready email integration.

## User Review Required

> [!CAUTION]
> **System Reset Transparency**: I am updating the "System Reset" tool to be 100% honest: it will wipe the **Entire Audit Trail**. I will add a mandatory checkbox in the UI to confirm you understand that all security logs will be cleared before production starts.
>
> **Billing Import Safety**: I am adding "Row Locking" to your billing imports. This prevents mathematical errors if an agent is issuing a receipt at the exact same moment a new bill is being imported.

## Proposed Changes

---

### 1. Administrative Transparency (System Reset)

#### [MODIFY] [system-reset-panel](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/admin/system-reset-panel.tsx)
- Update "PERMANENTLY DELETED" list to say "Entire System Audit History (Full Trail)."
- Add a new mandatory Checkbox: *"I understand that this will also delete all security and IAM audit logs."*
- Disable the "Start Fresh" button until this checkbox is ticked.

---

### 2. Financial Concurrency (Billing Import)

#### [MODIFY] [billing-actions](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/billing.ts)
- **`importBilling`**: Add `SELECT ... FOR UPDATE` locking to the customer synchronization loop.
- This ensures that the "Source of Truth" overwrite from the EBS file happens atomically and doesn't collide with live field receipts.

---

### 3. Production Email Integration

#### [MODIFY] [email-service](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/lib/email-service.ts)
- Replace the `// await fetch` stub with a real implementation using the **Resend API**.
- The system is now functionally ready to send real emails as soon as the `RESEND_API_KEY` is added to the production environment.

---

### 4. Technical Polish

#### [MODIFY] [package.json](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/package.json)
- Move `vitest` to `dependencies` (temporarily) to ensure it is always present in the environment for `tsc` checks.

## Verification Plan

### Automated Verification
- Run `npm run typecheck` to verify the new UI components and action signatures.
- Run `npm test` (all 8/8 tests must pass).

### Manual Verification
1. **Reset Check**: Navigate to **Admin > Maintenance**. Verify the new audit-log warning is prominent and required.
2. **Import Check**: Run a billing import. Verify the logs show successful balance synchronization with row locking.
3. **Email Check**: Trigger a password reset. Verify the server logs still show the debug output, but the code now includes the `fetch` call for production.
