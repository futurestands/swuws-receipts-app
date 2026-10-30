# Phase 1 remediation: staging migration and acceptance checklist

Prepared 2026-10-27 for branch `fix/phase1-production-remediation`, based on review of
`2dcfca5fe28d28c814a26158faa4901d4d3d7f46`. This checklist is not deployment approval.
No live database was accessed during remediation.

## Approval and environment gates

- [ ] Review the source diff and the remediation report; approve the candidate revision.
- [ ] Approve a staging-only migration window and named migration operator.
- [ ] Confirm staging database identity independently of the application configuration.
      Use synthetic data or an approved sanitised copy; no production connection.
- [ ] Take a staging backup and demonstrate restoration to a separate disposable database.
- [ ] Review the migration ledger against the actual release files. Reconcile the previously
      reported `0011_receipt_billing_snapshots.sql` ledger anomaly if present. Its current
      presence has not been checked against live data.
- [ ] Approve explicit IAM grants and organisational assignments. Administrator status and
      seniority no longer grant production writes or finding investigations/dismissals.
- [ ] Arrange independent legacy approval staffing: the recorder and anyone who reviewed
      a legacy row cannot verify it. Later corrections do not remove this disqualification.

## Migration rehearsal and execution

The model remains the existing source and production-log tables from 0069. Remediation
adds no columns, no automatic backfill and no duplicate module. 0071 adds an approval
guard using existing immutable audit records.

- [ ] Rehearse the exact candidate SQL in a disposable restoration before touching staging.
- [ ] Apply pending migrations in filename order, including prerequisites. In this phase:
      **0069 -> 0070 -> 0071**, each in its own transaction with a migration-ledger entry.
      Skip files already recorded as applied; never edit an applied migration to retrofit a fix.
- [ ] Check incompatible historic negative/non-finite values, unknown technology strings,
      orphaned sources/schemes/periods, mismatched source ownership, duplicate active
      source/day and actor/request keys, invalid workflow/state metadata and malformed
      retry keys. 0069 intentionally fails validation rather than rewriting them.
- [ ] Check duplicate billing-period year/month pairs. Production entry refuses ambiguous
      matching periods even if the database permits the old duplicate periods.
- [ ] Check active staff with absent or contradictory organisation/hierarchy assignments.
      Access fails closed; repair assignments through the approved IAM process.
- [ ] Check workflow-version-1 verified records whose verifier is also the immutable
      `production.log.legacy_review` audit actor for that row. **0071 aborts if any exist.**
      Escalate for authorised revocation/reconciliation; never delete audit evidence or
      change measurements/approvals automatically to make migration succeed.
- [ ] Schedule a short write pause. 0069 validates constraints and adds indexes/FKs;
      0071 holds a SHARE ROW EXCLUSIVE lock on the production-log table while checking
      existing approvals and installing its guard. Set reviewed lock/statement timeouts.
- [ ] Verify repeatability in the disposable restoration and preservation of records,
      receipt/attachment immutability, audit immutability and Pegasus security triggers.
- [ ] Verify all three migration ledger entries and the new
      `production_review_independence_guard` trigger before releasing application traffic.

**Runner caveat:** `db/migrate.js` loads `.env` and overwrites existing environment
variables. Merely setting `DATABASE_URL` in a terminal does not safely redirect that
runner. Use a reviewed staging-only release environment whose `.env` is independently
verified, or a reviewed SQL runner explicitly bound to staging. Do not run the repository
runner from this development checkout. The integration harness reads SQL directly and
uses a guarded loopback `_production_test` database, bypassing `.env` entirely.

0069 and 0070 remain byte-for-byte unchanged. 0069 extends workflow, retry, verification
and capacity metadata, restricts history references, validates numeric/state/ownership
constraints and guards updates/deletes. 0070 inserts four permission definitions with
ON CONFLICT DO NOTHING and grants them to nobody. Their repeat runs passed disposable
tests; this does not guarantee compatibility with uninspected business records.

## IAM acceptance matrix

Apply each test through the UI and by direct server-action invocation. Use at least two
organisations, multiple schemes and two concurrent sessions. Confirm both route families
(`/intelligence` and `/decision-support`, including scheme drill-downs).

| Synthetic user | Expected authority |
| --- | --- |
| Administrator with no production/finding grants | Intelligence compatibility reads only; no production write/source controls or finding mutation |
| Scoped production viewer | View/history only; no create, correct, verify or source management |
| Viewer + creator | Create and correct own entered/flagged records in scope |
| Viewer + verifier | Review/flag/revoke/void in scope; no self-approval or legacy-reviewer approval |
| Viewer + source manager | Configure/archive sources in scope; no automatic record creation or verification |
| Explicitly granted administrator | Same scoped operational rules and independence restrictions as other users |
| Foreign organisation, broken hierarchy or missing grant | No scoped production mutation or foreign history disclosure |
| Own-only production grant | Own reads/entry where assigned; no verification/source management |
| Intelligence investigator only | Investigate in grant scope; cannot dismiss/resolve |
| Intelligence dismiss grant | Dismiss/resolve in grant scope; cannot investigate/reopen without investigate grant |

## Operational UAT

- [ ] Create one daily record per source with an explicit production date. Confirm the
      correct calendar month and optional matching billing month, including February/leap
      year and a collection window in the following month. No period is created by entry.
- [ ] Reject invalid dates/future dates, negative/non-finite/exponent/overprecision inputs,
      hours above 24, missing source, foreign/archived source and mismatched billing period.
- [ ] Save produced/supplied/hours zero. Reload; zero remains zero. Blank supplied/hours
      remains unknown. A supplied-over-produced record needs explanatory notes to verify.
- [ ] Retry an uncertain submission; obtain the same record. Change the payload with the
      same key; reject it. Independently submit duplicate source/day; reject it.
- [ ] Verify via another authorised user. Confirm only verified rows enter official totals.
      Entered/flagged/legacy records remain separate; verified zero is distinguishable
      from no verified observations.
- [ ] Reject direct edits to verified records. Revoke with reason, correct as original
      recorder, then independently verify. Check every actor/reason/before/after event.
- [ ] Promote a legacy row through explicit source/date review without automatic approval.
      The legacy reviewer must not see a Verify control and direct self-approval must fail.
      A separate permitted verifier can approve. Historic provenance remains unchanged.
- [ ] Simultaneously correct or verify the same version in two sessions; one succeeds
      and the other reloads after a conflict. No lost update or duplicate approval.
- [ ] Void with reason. Retain history, exclude totals, release the daily slot, prevent
      further mutation of the void row and preserve restrictive parent references.
- [ ] Configure unknown, measured-hourly and bucket-test capacity. Zero operating regime
      gives known zero capacity; unavailable or zero-denominator utilisation is labelled
      unavailable. Archive a source without losing historic records.
- [ ] Open audit history for flag/revoke/void/review; identify the action's actor. History
      currently shows the latest 100 events, not a complete paginated audit export.
- [ ] Compare production workspace, both reporting engines, monthly and specialised
      report tables and the board-pack matrix against synthetic verified totals. Check
      unavailable capacity and missing-period loss labels. No `Unavailable%` or false 0%
      utilisation should appear. Check all existing report entry points contain sections.
- [ ] Investigate/dismiss a real generated finding; retain evidence and display the stored
      status. Reject invented/foreign findings, wrong transition grants and foreign or
      inactive assignees. Do not reuse old-month finding disposition for a new month.
- [ ] Check CRM category/department/SMS screens, billing imports, receipt creation/retry,
      reconciliation, offline receipt sync/search/printing and navigation through real
      authenticated sessions. Production entry itself is online-only in Phase 1.
- [ ] Test desktop/mobile layout, loading/errors, month/scheme selection and record paging.
- [ ] Obtain water-production owner, IAM owner and staging QA sign-off with screenshots
      or sanitised acceptance evidence; keep customer data and secrets out of docs.

## Recovery and release gates

If a migration fails, leave traffic paused, preserve diagnostic counts and investigate;
the transaction must roll back and must not be marked applied. Restore staging from its
verified backup if necessary. Avoid destructive down migrations and never remove audit
history. An application rollback must retain compatible schema; do not roll back to the
known self-approval/admin-bypass build while opening operational writes.

Production rollout, merging and pushing require separate approval. Existing Next.js
middleware-deprecation and NFT tracing warnings remain tracked packaging/framework work;
review the deployable artifact in staging. Decision-support periodDeltas, historical
capacity configurations, offline production and period-qualified finding history are
outside this remediation and must not be represented as accepted capabilities.
