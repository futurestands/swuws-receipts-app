# Phase 1 water production implementation report

Historical report for the initial implementation. The current remediation candidate
supersedes its administrator exception and fixes the independently reviewed approval,
finding-scope, history and reporting defects. See the
[remediation report](phase-1-water-production-remediation.md) and
[staging checklist](phase-1-remediation-staging-checklist.md).

Date: 2026-10-27. Local implementation under the user's approved Phase 1 scope.
No business/production database was accessed during development. No commit, push,
merge or deployment was performed. No additional WATOPS evidence was needed;
REA and its configuration were left unchanged.

## Completed workflows

1. Record one source's production per Kampala calendar day. Source ownership,
   organisational ancestry, permission scopes, real dates, decimal precision and
   hours are checked on the server. Future dates and unknown input properties are
   rejected. Explicit supplied volume/hours of zero survive unchanged; blank means
   unknown. The source and production date become immutable after creation; void
   and re-record an incorrect identity.
2. Resolve the optional billing reference by the production year's/month's billed
   month, not the collection window or active period. Missing periods do not block
   daily recording or verification. Ambiguous/mismatched periods fail. Production
   DATE remains authoritative when a period is added later; an unchanged retry
   still returns the same record.
3. Independently verify or flag entered production. Verification cannot be done by
   the recorder, including an administrator. Supplied > produced requires an
   explanatory measurement note before verification.
4. Revoke verified production to flagged before the recorder can correct it.
   Revocation removes it from official totals immediately. Correction returns it
   to entered and requires independent verification again. Voiding is reasoned,
   terminal and retains the record and audit trail; no hard delete is exposed.
5. Review legacy entered/flagged records with an explicit source/date/measurement
   confirmation and reason, preserving the original recorder. Promotion does not
   verify them. A legacy verified record must first be revoked; a legacy row with
   no recorder requires a separately approved remediation rather than invented
   provenance.
6. Create/edit/archive sources using version checks and explicit capacity methods.
   Bucket conversion runs as PostgreSQL numeric arithmetic. Unknown input produces
   an unavailable benchmark, not assumed daily production. Confirmed current
   configuration is labelled separately from historical installed capacity.
7. Use one verified-record aggregation service in the workspace, intelligence and
   trusted management reporting. Official totals exclude legacy, entered, flagged
   and void rows. Verified zero is distinct from no observations. Supplied-data
   availability and provisional totals are explicit. Coverage counts distinct
   verified dates with an elapsed calendar-day denominator, not source-row count.
8. Replace synthetic historical trends with actual previous-month observations;
   suppress comparisons without sufficient coverage or for an incomplete current
   month. Zero baselines have an absolute change but no invented percentage.
9. Show scoped production-only workspaces without returning commercial KPIs or
   findings. Existing intelligence users retain their dashboard and scoped scheme
   findings. Both existing scheme route families share the same production UI.
10. Keep durable retry identity, active source/day uniqueness, row-version checks,
    database guards and transactional mutation/audit logging. Uncertain submission
    responses can be retried without a second record; stale updates return conflicts.

## Permissions and security

Definitions: `production.view`, `production.create`, `production.verify`,
`production.sources.manage`. Viewing/reporting/investigation rights do not grant
production writes. Writes require view plus the relevant write grant, intersected
with organisation and all assigned hierarchy boundaries. Own-only grants cannot
approve other people's entries or manage sources. The existing explicit system-admin
capability remains; self-verification is still prohibited.

No existing non-admin role was automatically granted these capabilities. The actual
role/scope assignment matrix is a release prerequisite. Cross-organisation access is
limited to an unassigned system administrator. Missing/contradictory ancestry fails
closed. The previously observed database role's BYPASSRLS setting was not changed;
the new application checks do not depend on RLS enforcing these scopes.

The existing shared intelligence scheme filter now also clamps organisation and
intersects a requested scheme with all assignments. No changes were made to receipt,
CRM, reconciliation or shared commercial permission implementations.

## Database changes and disposable validation

- `0069_production_integrity.sql`: extends existing source/log tables with DATE,
  workflow/version, retry fingerprint/key, verification and capacity-confirmation
  fields; adds numeric/state/shape checks, same-scheme source FK, uniqueness and
  reporting indexes, restrictive history references and update/delete guards.
- `0070_production_permissions.sql`: idempotent permission definitions, no grants.
- Existing measurements remain intact as workflow version 0; there is no automatic
  date inference, source reassignment, verification or measurement cleanup.
- Constraint validation intentionally rejects incompatible historical rows. Tests
  demonstrate rollback on an invalid legacy configuration before applying the valid
  migration. An authorised preflight on each deployment's schema/data is still needed.

Before executing the new SQL, the approved source/day, DATE/month, verified-only and
revoke-before-correction model was explicitly confirmed in the project conversation.
Validation used a newly initialised PostgreSQL 17 cluster under ignored `.artifacts`,
listening only on a separate loopback port. The test database name ends
`_production_test`; tests require an explicit safe URL and never read `.env` as a
connection fallback. Each integration run used a fresh namespace and synthetic rows.
The fixture applies the relevant historical source migrations; it is not a production
snapshot or a claim that every historical migration can be replayed in filename order.

Real PostgreSQL checks include independent verification/revocation/correction,
concurrent retries and edits, duplicate source/day entries, audit rollback, billed
month versus collection dates, absent/ambiguous periods, known zero versus unknown,
legacy preservation/review, foreign organisation/source denial, distinct-day counting,
both reporting engines, migration reruns and existing protection-trigger enforcement.

No production migration has been executed. The historical ledger-only entry recorded
in the audit remains unresolved because development did not reconnect to business data.

## Modified and added files

Existing files modified:

- `.github/workflows/ci.yml`: disposable PostgreSQL service and mandatory integration
  step; valid test HTTPS origin for the existing production auth checks.
- `app/actions/intelligence.ts`: scoped existing detail read; production action
  adapters, validation/conflict responses and both-route revalidation.
- `app/intelligence/layout.tsx`, `app/intelligence/page.tsx`,
  `app/intelligence/schemes/[id]/page.tsx`: existing routes admit scoped production
  viewers and use the shared workspace while retaining authorised intelligence.
- `app/decision-support/layout.tsx`, `app/decision-support/page.tsx`,
  `app/decision-support/schemes/[id]/page.tsx`: shared production detail and protected
  decision-support root.
- `lib/db/schema/intelligence.ts`: model fields/checks/indexes/FKs aligned with SQL.
- `lib/permissions/index.ts`, `lib/intelligence/scope.ts`: separate production
  capabilities and shared intelligence organisation/requested-scheme restrictions.
- `lib/nav-config.ts`, `lib/nav-config.test.ts`: production-only existing-route
  navigation and permission regression checks.
- `lib/intelligence/engine.ts`, `lib/intelligence/data-quality.ts`,
  `lib/intelligence/trends.ts`, `lib/intelligence/types.ts`: shared verified data,
  calendar coverage, real history and zero-baseline/availability handling.
- `lib/decision-support/performance-engine.ts`,
  `lib/decision-support/data-validation.ts`, `lib/decision-support/types.ts`:
  consistent production eligibility/coverage and explicit availability metadata;
  commercial arithmetic is retained.
- `lib/decision-support/reports.ts`, `lib/decision-support/board-pack.ts`: production
  availability and current-configuration methodology labels in existing exports.
- `vitest.config.ts`: integration suite excluded from ordinary unit runs and enabled
  explicitly for the mandatory disposable-database invocation.
- `db/migrations/README.md`: migration preflight, test isolation and rollback guidance.
- `docs/phase-1-water-production-spec.md`: approval status and implementation link.

New implementation/test files:

- `lib/production/schemas.ts`, `scope.ts`, `service.ts`, `reporting.ts`,
  `test-database.ts`: validation, scoped access, transactional workflow, shared
  production aggregation and fail-closed disposable-target guard.
- `lib/production/schemas.test.ts`, `scope.test.ts`, `reporting.test.ts`,
  `integrity.integration.test.ts`.
- `app/actions/intelligence.production.test.ts`.
- `components/production/production-panel.tsx`, `production-workspace.tsx`,
  `scheme-production-page.tsx`, `production-panel.test.tsx`,
  `production-workspace.test.tsx`.
- `app/intelligence/intelligence-dashboard.tsx` and
  `app/decision-support/decision-support-dashboard.tsx`: extracted existing client
  dashboards so server route gates can keep production-only viewers out of commercial
  data. These are refactors, not replacement dashboard modules.
- `db/migrations/0069_production_integrity.sql`, `0070_production_permissions.sql`.
- This implementation report. The already-created sanitised audit/specification
  documents remain in the working tree.

Justified inventory additions to the original plan are the two extracted client
dashboards, shared server scheme-page renderer, disposable-target helper and CI
integration service/step. They support the approved access boundaries and make real
database verification repeatable. No dependency or package-lock change was needed.

The pre-existing `next-env.d.ts` generated-route-import difference remains outside
this feature's change set. It was not intentionally edited as application code.
Large route-file deletions in an unstaged Git stat reflect extracted dashboards and
shared scheme UI; inspect the new files alongside the tracked diff before staging.

## Verification results

| Check | Result |
| --- | --- |
| Full regression including disposable PostgreSQL integration | 52 files passed; **395 passed, 1 skipped** |
| New real PostgreSQL integration cases | **21 passed**, included above |
| New/extended passing tests relative to 324-pass baseline | **71** |
| Existing private-workbook skip | Remains the single skip; no new silent skips |
| Lint | Passed: `npm run lint -- --no-cache` |
| Typecheck | Passed: `npx tsc --noEmit --incremental false` |
| Production build | Final rerun passed: optimised compilation, TypeScript, static-page generation and route generation using disposable database settings |
| Git whitespace check | `git diff --check` passed |
| CI workflow | Added, YAML parsed and reviewed locally; no push/remote CI run performed |

The full test command was `npm test -- --no-cache` with the integration switch and
explicit disposable URL set in the process environment. App DATABASE_URL was
overridden to an unused loopback placeholder during tests. Build settings likewise
overrode the database and auth origins; no production database connection was used.
After final review tightened PostgreSQL's nullable bucket-capacity CHECK, all 21
integration cases passed again (including the new missing-input assertion), and the
production build passed again. The isolated cluster was stopped after verification;
synthetic test files remain under ignored `.artifacts` for local troubleshooting.

The build reports the middleware-convention deprecation and file-tracing warning
through `next.config.mjs` → existing Excel-reference/scheme-matching code. It also
reports metadataBase fallback in the isolated test environment; the maintenance
route is handled dynamically because it uses headers. None prevented the build.
These were not expanded into unrelated architecture changes.

## Remaining limitations and deployment requirements

1. Full authenticated browser/visual acceptance is outstanding: the available
   computer-use inventory exposed no browser surfaces. Shared UI interactions were
   tested in jsdom, and server/DB workflows were tested against real PostgreSQL;
   this is not a claim of a completed live-browser UAT session. Before release,
   exercise operator → verifier → revocation → correction → reverification in a
   staging browser, both existing scheme routes, errors/conflicts and mobile layout.
2. Review the actual production role/grant matrix and missing organisational ancestry
   before enabling operators. No broad permission backfill was applied.
3. Obtain separate migration/deployment approval. Back up and preflight the actual
   deployment schema/data on an authorised disposable copy; reconcile invalid legacy
   rows and the historical ledger-only entry. The connected production database was
   deliberately not inspected or modified during implementation.
4. Deploy schema and matching application together under the existing maintenance
   process. Old production writers do not implement these verification/version rules
   and must not remain enabled. Rebuild with the separately approved release
   environment; the local `.next` output uses test-only origins and is not a release
   artifact. Do not roll back by dropping history/new columns.
5. Legacy rows without sufficient provenance stay provisional. Capacity is a current
   confirmed-configuration benchmark, not an effective-dated historic asset model.
   Coverage is days with entries, not proof that every source was measured.
6. Station/bulk-meter day sheets, energy/fuel, chemical/store issues, offline production,
   water quality, assets/work orders, inventory/procurement and policy-verified
   disconnections remain later phases. REA remains available when additional authorised
   reference evidence is necessary.

The implementation is ready for code and staging review. It is not deployed or an
assertion of operational sign-off in production.
