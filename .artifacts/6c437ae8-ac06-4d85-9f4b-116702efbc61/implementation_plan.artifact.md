# Implementation Plan: Final Feature Completion & Hardening

This plan addresses the blocking bugs and functional gaps identified in the third forensic audit, ensuring the system is buildable, functional, and secure for production.

## User Review Required

> [!IMPORTANT]
> **Database Trigger Modification**: To allow the "System Reset" feature to work while keeping receipts immutable during normal operation, I will add a **Bypass Path** to your database triggers. This path will only be accessible during the administrative reset transaction.
>
> **Password Reset Dependency**: The password reset feature requires the user to click a link in an email. Ensure you have access to your server logs to see these links until a real email provider is configured.

## Proposed Changes

---

### 1. Critical Build Fixes

#### [MODIFY] [app/admin/system-reset-panel.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/admin/system-reset-panel.tsx)
- Fix mismatched JSX tag: Change `</li>` to `</p>` on line 82.

---

### 2. Password Reset Repair

#### [MODIFY] [app/login/reset-password/reset-password-client.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/login/reset-password/reset-password-client.tsx)
- Import `useSearchParams` from `next/navigation`.
- Extract the `token` from the URL query parameters.
- Pass the `token` to `authClient.resetPassword` to validate the request.

---

### 3. System Reset Integrity

#### [NEW] [db/migrations/0036_maintenance_bypass_trigger.sql](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/db/migrations/0036_maintenance_bypass_trigger.sql)
- Update the immutability triggers for `receipt` and `receipt_attachment` to allow deletion ONLY if a session variable `app.allow_operational_wipe` is set to `'true'`.

#### [MODIFY] [app/actions/admin.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/admin.ts)
- Update `wipeOperationalData` to execute `SET app.allow_operational_wipe = 'true'` inside the transaction before deleting records.
- Add logic to explicitly delete from the `audit_log` table as promised in the UI.

---

### 4. Security & Scoping Hardening

#### [MODIFY] [lib/email-service.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/lib/email-service.ts)
- Add `{ escape: true }` to the `renderTemplate` call to prevent HTML injection via user names.

#### [MODIFY] [app/actions/tariff-import.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/tariff-import.ts)
- Inside the bulk import loop, call `validateWriteScope(current, "system.settings.manage", { branchId, schemeId })`.
- This ensures a Branch Manager cannot use bulk import to change prices in a different branch.

## Verification Plan

### Automated Verification
- Run `npm run typecheck` to verify the build-break is resolved.
- Run `npm test` to ensure existing logic remains sound.

### Manual Verification
1. **System Reset**: Create a test receipt, then run the "System Reset" tool. **Verify**: It succeeds without a database error.
2. **Password Reset**: Request a reset, copy the link from logs, and verify you can set a new password.
3. **Scoping**: Try to import a tariff for a branch you don't manage. **Verify**: The row is flagged as "Forbidden."
