# PR #3 release readiness

## Repairs after the forensic audit

- Conditional queued-to-processing record claims prevent overlapping workers from sending the same record. Billing claims also use PostgreSQL advisory transaction locks for each account/phone and recheck contact history across batches.
- Work is bounded to 40 messages per request, with eight concurrent gateway calls and ten-second provider timeouts. Remaining queues stay approved and resumable; legacy pending batches can resume.
- Ambiguous deliveries remain unknown/processing for manual reconciliation. They are never automatically retried. Details exposes these statuses and the batch shows “Delivery review needed”. A failed-only retry/reconciliation workflow is still outstanding.
- Submission, approval and rejection compare the observed prior state before updating it.
- New batches deduplicate normalized phones/customer IDs. Counts and UI exclusion notices reflect duplicates. Draft/rejected queues no longer count as actual contact.
- Restricted upload users must match every recipient to an active scoped customer. Lookup supports account and MeterRef and rejects ambiguous references; uploads enforce the selected area/scheme. Generic creation validates linked customer territory and registered phone. Unmatched external contacts require global customer access.
- Saved messages reject missing template variables instead of silently removing them. Due-date validation remains in place.
- Pending-message statistics count queued records rather than lists.
- Only the precise Pegasus webhook path bypasses browser cookie redirects. Signature verification, rate limits and payload limits remain in the webhook handler.
- The SMS service refuses real sending on Vercel Preview deployments. This does not establish separate database credentials; platform settings must be reviewed.
- EBS test mocks and union assertions are correctly typed; full TypeScript passes locally.
- The separate CI scanner patch matches assignment lines, avoiding the workflow matching its own command. Full repository lint and dataset-dependent tests still need repair; no required gate was removed.

## Evidence

The actual sender action is invoked by `lib/sms-sender.regression.test.ts` through an isolated synthetic DB/gateway harness. It verifies that 81 messages complete over three invocations, overlapping workers make one call for one queued record, and uncertain deliveries are held without resend. The helper tests cover missing variables, zero balances, deduplication, claim ownership and post-send DB failure. These are not live PostgreSQL/provider tests; billing advisory-lock concurrency still needs staging verification.

Full suite after the initial repairs: 198 passed, 7 failed, 1 skipped. The seven failures are the previously observed decision-support tests requiring `global target.xlsx`; the source workbook must be provisioned or replaced with an explicitly approved fixture. Do not fabricate reference data to force a pass. Changed-file lint, full TypeScript and the production build passed locally. Review checks on the final pushed commit independently.

## Release gates

1. Apply `0068_sms_batch_due_date.sql` to the target Preview/staging database before using that version and to production before production deployment. No production database credentials or migration access were available to this coding session, and no production migration was applied.
2. Verify Preview and Production have separate database/provider configuration. Disabled SMS does not prevent other preview actions from writing to a shared database.
3. Repair existing repository lint errors and provision the decision-support dataset. Do not bypass CI because Vercel says Ready.
4. Test signed-in server actions with real area A/area B permissions, inactive and unmatched customers, mixed-scope imports and corrected MeterRef/account mappings.
5. Test PostgreSQL/provider concurrency and failures in staging: overlapping batches for one phone/account, timeout after provider acceptance, database failure after sending and interrupted worker reconciliation.
6. Review outstanding dependency advisories and remaining audit findings, including explicit billing-period binding, balance changes between approval and sending, immutable campaign scope and recipient snapshots. This patch does not resolve every audit finding.

Keep PR #3 open until the release gates are satisfied. GitHub access does not grant database migration access or prove environment isolation. Production remains on its existing commit until an intentional verified release.
