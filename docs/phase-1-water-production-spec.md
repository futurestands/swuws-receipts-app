# Phase 1: complete the existing water production workflow

Remediation amendment (2026-10-27): the approved remediation removes the administrator
operational bypass described in the historical plan below. All production mutations and
finding investigations/dismissals now require explicit scoped grants. A legacy reviewer
cannot approve that record. See [remediation report](phase-1-water-production-remediation.md)
and [staging checklist](phase-1-remediation-staging-checklist.md) for the current candidate.

Date: 2026-10-27. Status: implementation scope approved by the user in the project conversation; implemented locally and validated using a disposable database. Production migrations, actual IAM grant assignments, commits, pushes, merges and deployment still require separate approval. See [implementation report](phase-1-water-production-implementation.md) for results and remaining release checks.

Evidence and limitations: [sanitised audit](swuws-watops-audit.md). Requirements below record the approved SWUWS design. WATOPS exposed day-sheet and approval screens, but its transaction implementation was not tested or copied. The original planning text is retained below; the implementation report records the final file inventory and justified implementation details.

## 1. Outcome and scope

A permitted operator records one source's measured production for one Uganda calendar day; an independent verifier can verify or flag it; a reasoned correction revokes verification before editing; both existing reporting paths consistently distinguish verified production, provisional entries and missing data. Every write is scoped, validated, repeat-safe and audited atomically.

Reuse `water_scheme_source`, `water_production_log`, billing-period identities, hierarchy, session/IAM, `writeAudit`, existing scheme pages, UI primitives and reporting engines. No parallel production module, separate authentication system or new financial ledger.

Phase 1 excludes cumulative bulk meters/resets, station day-sheet headers, shift entry, energy/fuel, chemical/store posting, incident management, offline production sync, assets/work orders and new procurement/quality/disconnection workflows. Those remain in the roadmap. Do not advertise full WATOPS day-sheet parity at Phase 1 completion.

## 2. Security implementation order

1. Close object-level scheme/source read and write gaps (SEC-01/04).
2. Separate write/configuration/verification permission from intelligence viewing (SEC-02). Cover direct server-action invocation, not only hidden controls.
3. Enforce runtime and relational validation; treat database RLS as insufficient with the inspected role (SEC-03/INT-01).
4. Make mutation, audit, idempotency and concurrency protections atomic (INT-04).
5. Repair calendar/period/zero semantics and official-report eligibility (INT-02/03).
6. Remove assumed capacity, row-count completeness and synthetic historical observations (INT-05/06).

Do not use live-data write probes to demonstrate these defects. Existing financial receipt/attachment/audit/Pegasus controls, maintenance behaviour and commercial permission checks remain intact.

## 3. Record and validation contract

### Daily record

- New record granularity: one active record per source per `productionDate`; source must belong to the selected active scheme. Do not mix scheme totals with source totals. A void record is retained but does not occupy the active daily slot.
- `productionDate`: strict real ISO `YYYY-MM-DD`, SQL DATE, interpreted in `Africa/Kampala`; reject future days using server time. Preserve legacy `logDate`; write it using a documented UTC-midnight compatibility encoding of the date. Reporting for new records uses DATE, not timezone interpretation of that timestamp.
- `waterProducedM3`: required decimal, 0 through 9,999,999,999.99, at most two fractional places. Reject blank, negative, non-finite, exponent and overprecision input. Canonicalise as decimal strings; aggregate in PostgreSQL numeric, not floating-point write arithmetic.
- `waterSuppliedM3`: nullable, same numeric rules. Blank means unknown; explicit zero stays zero. Never copy produced volume into supplied volume implicitly. Explain supplied volume as water leaving the source into the supply system.
- `operatingHours`: nullable decimal from 0 to 24 inclusive, two fractional places; zero stays zero.
- Do not reject supplied > produced as universally impossible: storage/timing can cause it. Surface a review warning; require an explanatory note to verify such an entry. Do not label the difference physical loss without the later measurement-boundary model.
- `notes`: optional trimmed text, maximum 2,000 characters. Workflow reason: required trimmed text, 10–1,000 characters for flag, revoke verification and void. Escape rendered text using existing React conventions.
- IDs: bounded non-empty opaque strings (maximum 200 characters), not UUID-only validation: existing IDs include prefixed identifiers.
- New rows require `workflowVersion = 1`, valid source/date, request key, actor and version. Legacy rows remain version 0 until explicitly reviewed.

### Source configuration

- Source name: trimmed 1–150 characters; technology allowlist: `gravity`, `pumped_grid`, `pumped_solar`, `pumped_generator`, `hybrid`.
- Pump/yield m³/hr and gravity bucket-test values are nullable, finite, non-negative decimals within their existing numeric column precision. Bucket-test litres and seconds must both be supplied and positive when that method is used.
- `regimeHoursPerDay`: explicitly supplied 0–24, not `value || 24`. Zero is valid and yields zero daily capacity when yield is known.
- Yield m³/hr: explicit measured yield, or `(container litres / fill seconds) × 3.6` for the bucket method. If both are entered, require the operator to select the authoritative method; do not silently choose. Store `capacityMethod` (`unknown`, `measured_hourly`, `bucket_test`).
- Daily benchmark = hourly yield × regime hours. Unknown yield/hours means unknown capacity, not 100 m³/day. Display the method and configured inputs.
- Monthly benchmark = daily benchmark × actual days in the selected production month. Existing `practicalCapacityM3Month` stays a deprecated compatibility field; Phase 1 readers must not treat its old 30-day value as authoritative.
- Existing stored capacity values are retained and labelled legacy/unconfirmed until source configuration is reviewed. Add nullable `capacityConfirmedAt` and `capacityConfirmedById`; no automatic acceptance of historical assumptions.
- Source updates cannot reparent a source to another scheme. Lock and check the existing source before update; archive instead of deleting sources. Source configuration changes affect a labelled current-configuration benchmark, not a claim about historical installed capacity. Effective-dated capacity history is deferred.

## 4. Calendar and billing alignment

Source evidence: `lib/billing/period-dates.ts` and `lib/billing/calendar-roll.ts` distinguish the billed month (`billing_period.year/month`) from the next collection month's start/end window.

Proposed rule: production belongs to its own calendar month. Resolve a billing-period link by matching that month's `year/month`, not active status, collection dates, name parsing or today's month. Match exactly one period; more than one is a conflict requiring reconciliation. Do not create or roll a financial period from a production action.

When no matching billing period exists, allow an entered record with `billingPeriodId = null` and show “Billing period not yet available.” Its production month remains known from DATE. Verification is allowed when all production checks pass; lack of a financial period does not prevent daily operations. A new production workspace can show monthly totals by DATE; existing financial comparison reports require a selected real period and use its year/month.

New report queries select records by production DATE within the selected month. The FK is a validated cross-reference, not the sole reporting selector. Ignore a client-supplied mismatch and return a field error; never attach to an unrelated active period. Do not mutate closed/archived billing periods. Recording historical production does not reopen collection or change bills, receipts or balances.

No automatic backfill of ambiguous legacy dates or period assignments. A legacy review action requires explicit date, source and period confirmation, validation and audit; duplicate natural keys must be resolved by a verifier before promotion to workflow version 1.

## 5. IAM and object-level scope

Seed permission definitions idempotently in module `Production`. Do not infer mutation rights from legacy role names, seniority, reports.view or intelligence.view. Existing system-admin capability can be retained explicitly, with the same object and input validation; no other legacy role receives automatic production write rights.

| Code | Capability |
| --- | --- |
| `production.view` | Scoped sources, daily records, period/date filters and production summary |
| `production.create` | Record production; edit own entered/flagged records in scope |
| `production.verify` | Independently verify/flag, revoke verification, void and review legacy records; cannot silently edit measurements |
| `production.sources.manage` | Configure/archive sources in scope |

Mutations require view plus the relevant write grant. Source managers may configure sources without create/verify rights. A verifier must not be the recorder, including administrators; no self-verification override in Phase 1.

Use current resolved grants and existing scope vocabulary: `own`, `scheme`, `area`, `cluster`, `global`. Intersect each permission's scope with assigned hierarchy and organisation through scheme → branch → cluster → organisation. Global means within the user's organisation; cross-organisation access is allowed only for the existing system administrator with no organisation assignment. Missing/contradictory organisational ancestry denies access and returns a configuration error. Never widen scope because a user lacks assignments.

For `own`, list/read own records inside a resolvable assigned hierarchy; allow source/period lookups only for that hierarchy. `own` verification grants cannot approve anyone else's record and must fail closed. Source management requires scheme/area/cluster/global scope. Inherited grants resolve through existing IAM; do not rewrite the IAM resolver as part of this phase.

Existing intelligence readers retain scoped read-only access to the production information already exposed to them. This compatibility path does not grant new mutation capabilities. Compute permitted scheme sets independently for production and intelligence read grants and union only the authorised sets. Production-only viewers must not receive commercial KPIs or findings.

Scope every list, detail, source lookup, period lookup where applicable, mutation target and idempotent retry. A requested scheme must always intersect scope, including scheme-assigned users. Use uniform forbidden/not-found responses that do not disclose foreign-object existence.

Permission rollout: seed definitions only; do not broadly copy existing investigation/report grants. Before enabling operator writes, present and obtain approval for an explicit role-to-grant/scope matrix using existing IAM administration. No new hardcoded role hierarchy. Preserve REA/session configuration.

## 6. Workflow, correction and transaction rules

States: `entered`, `flagged`, `verified`, `void`. A new record is entered, never verified by input payload.

| Operation | Allowed transition / condition |
| --- | --- |
| Edit | Own entered/flagged record; flagged edit returns to entered; increment version |
| Verify | entered → verified; independent verifier; all validation and review warnings resolved |
| Flag | entered → flagged, mandatory reason |
| Revoke verification | verified → flagged, independent verifier and mandatory reason; measurements remain unchanged in this transition |
| Correct revoked entry | Recorder edits flagged → entered; requires another independent verification |
| Void | entered/flagged/verified → void, verifier and reason; terminal; never delete |

Verified measurements cannot be edited directly. Revocation immediately removes the record from official totals and is visible in history. This is a deliberate SWUWS correction policy for approval, not a claim that WATOPS unlocks approved sheets. If permanent approved-record locking is required instead, replace this policy with a reviewed revision design before coding.

Use the existing `audit_log` and `writeAudit(input, tx)` for immutable history; no duplicate history table. Store action, production/source ID, actor, expected/resulting version, state transition, before/after measurement/configuration values and required reason in the same transaction. Audit failure rolls back mutation. Preserve existing audit protections.

Create requires a client UUID `requestKey` retained across retries until success or explicit new entry. Unique `(recordedById, requestKey)` plus a canonical payload fingerprint makes same-key/same-payload retries return the original authorised result; changed payload returns conflict. Fingerprint the normalised client intent (scheme, source, date, decimal values and notes), excluding server-derived billing linkage, actor/state and timestamps. Check an existing key before resolving a newly available period so a later period creation cannot turn an unchanged retry into a conflicting payload. Recheck current scope before revealing that result. A different key for the same active source/day returns duplicate conflict, not a second row.

Updates/transitions use `expectedVersion`; lock/recheck the record, source relationship and eligible state in the transaction, then conditional version update. Repeated transitions with the original expected version return conflict without a second audit event. The UI reloads the latest version. Verification metadata clears on revocation, with the original verifier preserved in audit.

Audit action vocabulary: `production.log.create`, `.edit`, `.verify`, `.flag`, `.revoke`, `.void`, `.legacy_review`; `production.source.create`, `.update`, `.archive`. IDs and actor fields are server-generated. Do not log raw session/token material.

## 7. Database change specification

Proposed next files: `db/migrations/0069_production_integrity.sql` and `0070_production_permissions.sql`. Recheck the latest migration number before implementation. These are planned paths only; neither migration is created or run by this documentation task.

Extend `water_production_log`:

- `productionDate DATE NULL` for legacy compatibility; required on workflow version 1.
- `workflowVersion SMALLINT NOT NULL DEFAULT 0`, constrained to 0/1.
- `version INTEGER NOT NULL DEFAULT 1`, positive.
- `requestKey TEXT NULL`, `requestFingerprint TEXT NULL`; version 1 requires a UUID-format key and SHA-256 fingerprint.
- `verifiedAt TIMESTAMP NULL`, `verifiedById TEXT NULL` referencing user with deletion restricted while referenced.
- Numeric values keep existing PostgreSQL precision. Supplied volume is explicitly nullable with no new implicit zero/default-to-produced behaviour.
- CHECK constraints reject negative/non-finite numeric values and hours outside 0–24. State allowlist includes void; verified requires actor/time and verifier ≠ recorder; other states require current verification fields null.
- Version-1 shape CHECK requires production date, source and recorder. Unique partial `(sourceId, productionDate)` for workflow version 1 where status <> void. Unique `(recordedById, requestKey)` for non-null keys. Add `(schemeId, productionDate, status)` index for monthly selection.
- Add a source `(id, schemeId)` unique key and a composite production `(sourceId, schemeId)` FK, replacing the source-only SET NULL relationship with RESTRICT. This enforces same-scheme ownership and preserves source identity. Preserve legacy null sources until reviewed.
- Preserve production history by changing production scheme deletion from CASCADE to RESTRICT and period deletion from SET NULL to RESTRICT. No scheme/source/period records are deleted by migration.
- DB trigger rejects production hard deletes, unapproved state changes, verified-measurement edits, request-identity/recorder changes after creation, source reparenting when referenced, and update versions other than old+1. It permits the documented revoke/void metadata transition without altering verified measurements. Database functions cannot substitute for authenticated actor/permission checks in actions.
- Cross-table month/date agreement and source activity are checked in actions under transaction locks; do not embed mutable cross-table queries in CHECK constraints. Direct privileged DB operations remain outside the application threat boundary.

Extend `water_scheme_source` with `capacityMethod`, nullable confirmation actor/time and positive `version`; change unknown measurement inputs/derived capacity columns to allow NULL. Retain legacy numeric values without automatic recalculation. Source writes use expectedVersion and audit. Add technology, paired bucket inputs, finite/non-negative numeric and hours checks. Existing practical monthly field remains readable for compatibility but non-authoritative in new production calculations.

Migration preflight on a disposable copy: inventory invalid values/states, foreign relationships, duplicate keys, legacy rows and deletions/FK dependencies. Never delete, coerce or auto-verify historical rows to satisfy constraints. Add applicable checks as NOT VALID, report violations and validate only after an approved remediation; new writes must satisfy them. Block deployment if required constraint validation or trigger preservation fails.

Preserve the existing migration runner and hand-written SQL workflow. Do not edit applied migrations, run schema push, or regenerate stale Drizzle journal/snapshots to imply deployment. Investigate the historical ledger-only entry before rollout. Create normal reviewed backups before eventual production migration; rollback application rollout while retaining added data, not a destructive down migration.

## 8. Reporting contract

- Official production and supplied totals: verified workflow-version-1 records only, selected by DATE month and permitted scheme set. Entered/flagged and legacy totals appear separately as provisional; void excluded. Unknown supplied values must produce “Incomplete supplied data”, not an invented complete total.
- No verified records means unavailable/incomplete, not a measured zero-production month. A verified zero is a real observation. Existing numeric DTOs may retain zero internally for compatibility only with explicit completeness/availability metadata controlling display and derived findings.
- Day coverage: distinct dates containing at least one verified production record / elapsed calendar days in the selected month. Past month denominator is all calendar days; current month through today; future month unavailable. Label this “Days with verified entries”; it does not establish all-source coverage. Multiple sources and duplicate retries cannot inflate day coverage. Record count is a separate metric.
- Portfolio coverage aggregates numerator and denominator over scoped schemes, not rows. Explain that source-level completeness cannot be established without later effective-dated source schedules.
- Capacity uses confirmed current daily configuration × actual month days and is labelled a current-configuration benchmark. Missing/unconfirmed inputs suppress capacity-derived conclusions. Never silently recompute historical installed capacity or use a 30-day cache as evidence.
- Trends compare actual verified totals for the previous calendar month with provenance and coverage. Missing comparator or insufficient coverage suppresses the trend. Zero baseline suppresses percentage change while preserving a valid absolute change. Do not use current × 0.9, current × 0.92 or capacity × 0.75 as observations.
- Use one shared production aggregation service for `runIntelligenceEngine` and `getTrustedPerformanceDataset`; keep existing commercial calculations unchanged. Exports/board packs receive the same eligibility, coverage and benchmark labels as screens.
- Existing intelligence scope filtering is repaired for all its callers, including scheme-mapping approval. This is a security fix, not permission expansion; add regression coverage for the existing callers.

## 9. Frontend and action contracts

Retain `/intelligence` and `/decision-support` and both existing `/schemes/[id]` links. Extract a shared production panel so these paths cannot diverge. Production-only users get a scoped scheme/month selector and production workspace at the existing intelligence landing page; do not fetch commercial data for them. Existing intelligence users keep their dashboard, with a link/section for production. Keep the separate decision-support dashboard behaviour; its layout may admit a production viewer only to the shared scheme detail, while its root keeps its current intelligence gate.

Use server-loaded capability data for controls and independent server checks on every operation. Forms expose production date, source, produced/supplied m³, hours, notes, derived reporting month and optional resolved billing-period label. Show capacity method/confirmation, warnings, verification/provisional states and audit history. Add source create/edit/archive forms and entered/flagged correction controls. Use existing components/toasts; handle loading, forbidden/not-found, validation, empty and retry states without permanent spinners. Prevent double submit, retain retry key and show optimistic-version conflicts with reload.

Actions in `app/actions/intelligence.ts` remain the existing entry points for source/log creation, delegating validation, scope and transactions to a production service. Add production-specific read/workspace/edit/review actions there. Existing `getSchemeIntelligence` is scoped before any detail query; production-only requests use a production DTO and do not call the commercial intelligence engine.

Service operations: `getProductionWorkspace`, `listProductionLogs` (cursor page size 30, hard maximum 100), `getProductionHistory`, `createProductionLog`, `editProductionLog`, `transitionProductionLog`, `reviewLegacyProductionLog`, `saveProductionSource`, `archiveProductionSource`. Responses are a discriminated `{ok:true,data}` / `{ok:false,code,fieldErrors?,message}`; codes: VALIDATION, FORBIDDEN, NOT_FOUND, CONFLICT, DUPLICATE, CONFIGURATION. Unexpected errors use existing system-error handling with sanitised user messages. Revalidate both existing route families after success.

## 10. Exact planned file inventory

Paths below are the implementation change set, not files already modified. New filenames are planned contracts. No package/dependency, financial-schema, receipt or deployment change is required by this design.

| Existing file(s) to modify | Purpose |
| --- | --- |
| `app/actions/intelligence.ts` | Secure existing handlers; add production DTO/workspace/edit/transition/history/legacy-review adapters |
| `lib/permissions/index.ts` | Production capability predicates; existing intelligence view must not authorise mutations |
| `lib/intelligence/scope.ts` | Organisation clamp and requested-scheme intersection for all existing callers |
| `lib/db/schema/intelligence.ts` | Drizzle fields, checks, relationships and indexes matching reviewed SQL |
| `lib/intelligence/engine.ts` | Shared production selection, actual historical data, calendar coverage and confirmed capacity |
| `lib/decision-support/performance-engine.ts` | Same production aggregation/eligibility and coverage; preserve financial arithmetic |
| `lib/intelligence/production.ts`, `lib/intelligence/trends.ts` | Unavailable/zero-baseline handling; no fabricated trend percentages |
| `lib/intelligence/data-quality.ts`, `lib/decision-support/data-validation.ts` | Calendar coverage and missing-data semantics |
| `lib/intelligence/types.ts`, `lib/decision-support/types.ts` | Availability, provisional/verified totals, traceability and coverage DTOs |
| `lib/decision-support/reports.ts`, `lib/decision-support/board-pack.ts` | Preserve report structure and add accurate production eligibility/benchmark labels |
| `app/intelligence/page.tsx` | Existing dashboard plus production-workspace access and production-only rendering |
| `app/intelligence/layout.tsx` | Admit permitted production users while retaining session and maintenance checks |
| `app/decision-support/layout.tsx`, `app/decision-support/page.tsx` | Allow scoped production scheme details without granting decision-support root access |
| `app/intelligence/schemes/[id]/page.tsx`, `app/decision-support/schemes/[id]/page.tsx` | Render shared secured production panel; retain valid existing insights for authorised readers |
| `lib/nav-config.ts` | Permission-consistent production link into existing routes |
| `vitest.config.ts` | Exclude the explicit disposable-database integration file from ordinary unit runs; keep mandatory integration invocation separate |
| `db/migrations/README.md` | Document new migrations, preflight, verification and data-preserving rollback |

| New file(s) | Purpose |
| --- | --- |
| `lib/production/schemas.ts` | Runtime input/response schemas and decimal/date bounds |
| `lib/production/scope.ts` | Permission-specific authorised scheme queries and object assertions using existing hierarchy/IAM |
| `lib/production/service.ts` | Atomic lifecycle, source changes, idempotency, versions and audit |
| `lib/production/reporting.ts` | Shared calendar-period resolution, verified/provisional aggregation and historical comparison |
| `components/production/production-panel.tsx` | Shared source/log/history/review workspace using existing UI primitives |
| `components/production/production-workspace.tsx` | Scoped scheme/month selector for production-only users |
| `db/migrations/0069_production_integrity.sql` | Reviewed additive schema/constraint/trigger migration, subject to sequence recheck |
| `db/migrations/0070_production_permissions.sql` | Permission definitions only; explicit role grants handled by reviewed IAM rollout |

Reuse without planned modification: `lib/audit.ts` transaction support, `lib/session.ts`, `lib/iam/index.ts`, existing hierarchy tables, `lib/billing/period-dates.ts` calendar helpers, generic admin IAM UI and the SQL migration runner. Do not duplicate these services. If implementation reveals a necessary additional file, update this inventory and explain the scope delta before treating it as approved.

## 11. Tests and acceptance evidence

Use synthetic fixtures exclusively. DB integration requires an explicit disposable `PRODUCTION_TEST_DATABASE_URL`: host must be localhost, 127.0.0.1 or ::1 and database name must end in `_production_test`. Compare the parsed host/port/database identity against the application's DATABASE_URL and reject a match even if credentials/query strings differ; never load .env's live connection as fallback. The integration command must fail if the target is missing or unsafe, not silently skip. No production DDL/DML from tests. A disposable PostgreSQL instance has not yet been confirmed; making one available is a prerequisite to claiming integration acceptance, not a reason to substitute the connected business database.

| Test file | Required cases |
| --- | --- |
| New `lib/production/schemas.test.ts` | Blank vs zero, NaN/infinity/exponent/overprecision/overflow, leap days, Kampala rollover, future date, names/enums and paired bucket inputs |
| New `lib/production/scope.test.ts` | Every scope, organisation boundary, conflicting hierarchy, missing ancestry, explicit requested scheme, inherited grants, view-only denial, source reparent/foreign-source rejection, production-only DTO isolation |
| New `app/actions/intelligence.production.test.ts` | Direct action invocation, scoped reads before queries, server-owned actor/state, same/different retry payloads, optimistic conflicts, audit-failure rollback, source ownership, error responses and route revalidation |
| New `lib/production/reporting.test.ts` | Billed month vs collection month, no/duplicate matching periods, verified vs provisional/legacy/void, known zero vs unavailable, null supplied, distinct dates across sources, 28/29/30/31 days, current-month coverage, real previous month and zero baseline |
| New `lib/production/integrity.integration.test.ts` | Real PostgreSQL migration/check/FK/trigger enforcement, concurrent same-source/date creates, concurrent edits/verify, same-key races, atomic audit rollback, verified immutability/revocation/void, legacy preflight violations, restrictive parent deletion, migration rerun and existing protection preservation |
| New `components/production/production-panel.test.tsx` | Permission-gated controls plus server denial, decimal/zero inputs, validation feedback, retained retry key, conflict reload, review warning/reason, source archive, history and error/empty/loading states |
| New `components/production/production-workspace.test.tsx` | Scoped scheme/month selection, production-only rendering, no commercial request and no inaccessible options |
| Existing `lib/permissions/index.test.ts`, `lib/nav-config.test.ts` | New capabilities/nav and no inferred write rights or inaccessible menu links |
| Existing `lib/decision-support/scheme-approval.test.ts` | Shared scope fix preserves legitimate mappings and rejects foreign organisation/scheme |
| Existing `lib/decision-support/excel-benchmark.test.ts` | Retain existing mapping/workbook and 14-slide structural assertions; update only production display expectations justified by new eligibility semantics |

The integration suite uses Vitest's existing configuration with an explicit file selection; no new dependency is planned. Normal unit runs exclude `lib/production/integrity.integration.test.ts`; an explicit environment switch `SWUWS_PRODUCTION_INTEGRATION=1` removes that exclusion. The mandatory integration invocation is `npx vitest run lib/production/integrity.integration.test.ts --no-cache` with that switch and the validated test URL set in the process environment. No real URL is committed. Existing baseline skip remains documented and must not grow through silent integration skips.

Browser acceptance after code approval: operator records explicit zero supplied and zero hours; verifier sees correct pending data and verifies independently; record appears in both reporting paths for the production month; correction revokes official eligibility until reverified; duplicate retry creates one record; forbidden IDs return no data; production-only user never receives commercial data. Use a local/disposable SWUWS environment. Browser automation is for actual workflow verification; REA remains available for bounded WATOPS comparison only when reference evidence is needed.

## 12. Delivery order and approval gates

1. Obtain approval for this specification, especially calendar mapping, source/day granularity, verified-only official totals, revoke-before-correction policy and proposed IAM rollout.
2. Implement security tests and scoped actions first, then validation/transaction behaviour, migration and integration checks, shared UI and reporting.
3. Reconcile preflight anomalies without automatic historic-data rewriting; investigate the ledger-only migration. Obtain the actual operator/verifier/source-manager grant matrix before enabling non-admin write access.
4. Run targeted tests, disposable DB integration, full unit suite, lint, nonincremental typecheck and production build. Explain every changed baseline assertion and any remaining skipped test. Confirm receipt/attachment/audit/Pegasus protection checks on the disposable DB.
5. Review the complete diff, browser acceptance evidence, migration preflight and residual risks. No commit, push or deployment without user authorisation. Deployment and actual database role/grant changes remain separate approvals.

Completion requires the working frontend, server actions, validated database lifecycle, scoped permissions, accurate reports and passing acceptance evidence together. Documentation or a form alone is not Phase 1 completion.
