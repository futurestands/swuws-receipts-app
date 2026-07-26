# Phase 6: Final Hardening & Audit Closure

This is the final push to resolve the new "Remediation Defects" and the remaining enterprise gaps identified in the second forensic pass.

## User Review Required

> [!CAUTION]
> **Financial Idempotency**: We are fixing a "Double-Credit" bug. Once applied, the system will physically block any attempt to void a receipt that has already been reversed.
>
> **Secret Rotation**: I cannot rotate your actual production secrets (BETTER_AUTH_SECRET, etc.), but I will add a script to help you "Clean" your exports so you don't accidentally share secrets in the future.

## Proposed Changes

---

### 1. High Priority: Financial Idempotency

#### [MODIFY] [app/actions/receipts.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/receipts.ts)
- **`requestReceiptVoid`**:
    - Inside the transaction, add a check for an existing `receipt.void` action in the `audit_log` table for the given `receiptId`.
    - If found, throw a specific "Already Voided" error.
    - This ensures that even if the UI button "flickers," the database only ever processes one reversal.

---

### 2. Enterprise Governance & Auditing

#### [MODIFY] [app/actions/template-actions.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/template-actions.ts)
- Add `writeAudit` to `publishTemplateVersion`.
- Why: Templates control customer-facing SMS/HTML. Changes to them MUST be in the immutable audit log for compliance.

#### [MODIFY] [app/actions/billing.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/billing.ts)
#### [MODIFY] [app/actions/reconciliation.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/reconciliation.ts)
- Expand the use of `logFinancial` and `logSecurity` from `lib/logger.ts` across these modules to provide a consistent observability trail.

---

### 3. Test Suite Repair (Rigor)

#### [MODIFY] [lib/scopes/index.test.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/lib/scopes/index.test.ts)
- Fix the test-authoring bug.
- Instead of `JSON.stringify` on the Drizzle SQL object (which is circular), I will use `Drizzle's` built-in `getSQL()` or simple property existence checks to verify the filter is generated correctly.

---

### 4. Deployment Safety

#### [NEW] [scripts/clean-export.sh](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/scripts/clean-export.sh)
- Create a simple utility script that prepares a "Safe" zip of the project by explicitly removing `.env`, `node_modules`, and `server_log.txt`.

## Verification Plan

### Automated Verification
- **Test Fix**: Run `npm test` and ensure **8/8 tests pass** (fixing the 2 failures).
- **Type Safety**: Re-verify `tsc --noEmit` passes once the test types are correctly exported.

### Manual Verification
1. Attempt to call `requestReceiptVoid` via the console twice for the same ID.
2. **Verify**: The second call must fail with "Receipt is already voided."
3. Publish a template and verify the event appears in the **Audit Log** tab.
