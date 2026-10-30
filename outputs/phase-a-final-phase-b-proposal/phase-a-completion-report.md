# SWUWS Phase A completion assessment

Review date: 30 October 2026. HEAD: `51d75cc1e1be87e02a7773a52a631751f30c9a53`.

**Phase A is incomplete.** Evidence preservation, design, mapping analysis and isolated validation artifacts exist. Immutable source-assessment versioning and pinned historical report baselines have **not been integrated into the local application**. Passing current tests does not establish those missing capabilities.

No source code, registered migration, workbook, production data or Supabase record was changed in this continuation. No database migration was applied, including to a disposable database. Phase B remains a design proposal only. No commit, push, merge or deployment occurred.

## Requirement-by-requirement result

| Requirement | Verified local implementation | Completion assessment |
|---|---|---|
| Immutable assessment versions | `lib/production/service.ts:173–190` locks the source, checks its version, updates the same row, increments `version`, and writes an audit before/after entry. There is no application schema/service reference to `source_capacity_assessment` or `scheme_capacity_baseline`. | **Incomplete.** Optimistic concurrency and audit history are useful, but are not immutable assessment entities linked to reports. |
| Preserve methodology and units | Source rows retain method/technology, bucket litres/seconds, hours/day, L/s and daily capacity. The three allowed method codes are unknown, measured_hourly and bucket_test. Measured hourly yield is still read from the field named `installedPumpCapacityM3Hr`. | **Partial.** Explicit measured-versus-installed distinction, dial-timing metadata, derivation version and evidence provenance are missing. |
| Assessment/effective dates and responsible officer | Confirmation timestamp/officer and ordinary creation/update timestamps exist. The source request has no assessment date, effective date or provenance contract. | **Incomplete.** Confirmation or update dates cannot be promoted to historical assessment dates. |
| Retain previous values | Atomic audit records contain before/after source states. There is no first-class append-only assessment lineage consumed by reporting. Saving a source explicitly sets `practicalCapacityM3Month` to NULL. | **Partial preservation only; baseline evidence remains at risk.** |
| Historical reports cannot change silently | `lib/production/reporting.ts:40–44,62` uses today's active confirmed source daily capacities × the selected month's calendar days. Both engines consume that result. | **Not satisfied.** Editing or archiving current configuration can change a rerun of an old period. |
| Source-to-scheme relationships | Existing source/scheme composite FK, immutable source parenting and scoped service checks are present in 0069 and `lib/production/{service,scope}.ts`. | **Existing safeguards preserved.** No new assessment-to-source relationship is implemented. |
| Reporting-period selection | Verified workflow-version-1 production is selected by production DATE month. Supplied remains a separate measurement. Calendar boundaries and current/prior month coverage helpers exist. | **Existing behavior verified.** No selection of an effective historical assessment or pinned baseline ID exists. |
| Workspaces and reports | Production workspace/panel, Intelligence and Decision Support dashboards, NRW logic and 14-slide Board Pack remain in the source tree and passing regression coverage. | **Preserved**, with the audit's calculation/availability limitations unchanged. |

### Concrete historical-report risk

For an illustrative July report, the current formula uses a current daily capacity of 56.50 m³/day ×31 = 1,751.50 m³. If a later source edit changes that daily capacity to 60.00, the same selected July uses 1,860.00 m³. There is no baseline-ID lookup in this read path that would keep the original denominator. This is a code-path counterexample, not a database edit or an assertion that a real source was changed.

The earlier synthetic output-equality proof showed that **unused** draft tables do not affect current outputs. It did not prove that the current application protects historical reports after a configuration change. That distinction remains essential.

## What exists and what does not

Existing registered migrations **0069–0072** implement the verified-production workflow, permissions and review guards. They predate this Phase A baseline work. There is no registered baseline-preservation migration.

Prepared artifacts retained unchanged:

- `outputs/engineering-basis-review/`: original workbook audit, complete cell/formula evidence and formula-review register.
- `outputs/phase-a-baseline-proposal/`: unregistered three-table schema draft, separate legacy-capture draft, 35-check synthetic proof and proposal.
- `outputs/phase-a-history-validation/`: source/scheme/month-label register, read-only business inventory, eight mapping tests, thirteen synthetic output-comparison tests, 29 output equalities and preservation manifest.

The draft SQL under `outputs/` is not part of the application migration runner. No Drizzle mappings, source actions, source form fields or historical report readers have been wired to those draft tables. No historical backfill is needed or authorized.

The last business inventory was read-only, captured at **2026-10-30 12:38:04 UTC**. It found zero sources, zero production logs, zero stored scheme mappings, zero source-capacity audit events and zero report-history entries in the configured database. It is not a freshly repeated inventory in this continuation. Workbook evidence has no confirmed assessment date, original officer or reporting year. Nothing in the current work assigns its July/August labels to calendar periods or inserts its figures as actual production.

## Current test evidence

Executed without migration-applying suites:

```
npm test -- lib/permissions lib/scopes lib/production/reporting.test.ts lib/production/schemas.test.ts lib/production/scope.test.ts lib/decision-support components/production app/actions/intelligence.production.test.ts outputs/phase-a-history-validation/mapping-register.test.ts
```

**18 suites passed; 163 tests passed; exit 0.** These include scope/IDOR, granular permissions, multi-tenant and administrative permissions, source/date schemas, production action authorization, production UI interactions, scheme mapping, management reports, workbook evidence and the 14-slide exporter.

`npm run lint -- --no-cache`: **passed, exit 0, no errors or warnings**.

`npx tsc --noEmit --incremental false`: **passed, exit 0, no errors**.

Several existing mocked suites emitted missing-`DATABASE_URL` diagnostics. No business database URL was supplied to these tests. No business mutation actions were executed.

Not rerun under the current no-migrations restriction:

- The prior **35/35** disposable database draft checks.
- The prior **13/13** output-invariance tests and **29** exact before/after comparisons, which apply draft DDL in disposable namespaces.
- The prior production integrity database run: **27 passed / 2 failed**. Its outstanding issues remain the incomplete fixture schema (`user.phone` missing) and an error-message assertion reaching the version guard before the self-approval guard. No existing harness or database trigger was edited to make these results green.

These earlier results remain historical test evidence, not tests executed now. No PostgreSQL cluster was started and no database migration was applied in this continuation.

## Remaining prospective Phase A work

The following work is required before Phase A can be marked complete. It is independent of importing historical Excel figures or inventing historical dates.

1. Finalize a prospective immutable assessment contract: separate measured yield and installed rating; capture raw observations, methodology/derivation version, unit metadata, assessment/effective dates, assumptions, authenticated responsible officer and evidence provenance.
2. Integrate append-only assessment writes with the existing source service, concurrency controls, audit transaction and IAM scopes. Current configuration remains an explicitly named projection; assessment history is retained when configuration is edited or archived.
3. Extend the existing source form to collect the missing assessment metadata. Add no replacement production workspace.
4. Select and pin scheme/period report baselines and source membership by immutable identity. A new assessment must not silently change an already issued report. Unavailable past baselines remain unavailable; no fallback to today's source configuration disguised as historical evidence.
5. Persist baseline IDs, source roster, calculation basis and report cutoff in report provenance. Permit explicit report reissue/revision without overwriting the earlier result.
6. Add prospective assessment service, atomic audit-failure, concurrent-edit, scope/permission, no-backdating, missing-input, month-selection and report-replay tests. Run SQL constraints on a disposable database only after database validation is expressly permitted again.

The earlier three-table proposal provides a starting point, not approved final implementation. Its dated scheme-month/source-FK model cannot directly represent all undated workbook archival evidence while live source tables are empty. No automatic legacy capture is necessary against the inspected empty engineering tables.

## Completion decision

| Phase A component | Status |
|---|---|
| Workbook/architecture audit and preservation evidence | Complete as documentation |
| Historical record/identity/period review | Complete to available evidence; dated assignments remain unresolved |
| Existing workflow and permission regression verification | Passed within the stated test boundary |
| Prospective assessment versioning in the application | **Not implemented** |
| Historical report denominator pinning/replay | **Not implemented** |
| Historical backfills or production imports | **Neither required nor authorized** |
| Phase A overall | **Incomplete; do not certify as deployed or locally integrated** |

Stop after this assessment and the companion Phase B proposal. Prospective Phase A integration and any later Phase B implementation require a reviewed implementation scope; the present work makes no schema/data changes.
