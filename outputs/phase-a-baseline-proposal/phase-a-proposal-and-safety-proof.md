# Phase A: precise baseline-preservation proposal and isolated safety proof

Status: **approval gate reached; application implementation has not started**. Prepared on 30 October 2026 against repository HEAD `51d75cc1e1be87e02a7773a52a631751f30c9a53`.

The requested preservation needs an initial copy of existing source-capacity values. Although the proposed copy changes no existing value, it populates historical snapshot records and therefore falls under the user's explicit instruction: **“Stop for approval if a migration requires changing or backfilling historical values.”** This document and the SQL drafts make that decision concrete. No skill or inferred policy introduced this gate.

The schema and initialization drafts have been tested only on synthetic data in a newly initialized, isolated PostgreSQL 17.10 cluster. No connected Supabase database was read, modified or migrated. No registered migration, application source, existing regression test, workbook or database configuration was changed. No commit, push, merge or deployment occurred.

## Proposed database changes

Authoritative, executable review drafts:

- [schema-draft.sql](schema-draft.sql): additive DDL only; creates three tables, their indexes and constraints, four functions and eleven triggers. No existing table is altered and no data is initialized.
- [legacy-capture-draft.sql](legacy-capture-draft.sql): separate, approval-gated `INSERT … SELECT` of exact existing source values. It is not included in the schema draft.

These files deliberately reside under `outputs/`, outside `db/migrations/`. The normal migration runner cannot discover or execute them. They are not application-ready migrations; the source service, report integration, deployment role checks and Drizzle mappings remain to be implemented after approval.

### 1. `source_capacity_assessment`

One immutable record per assessment or preserved legacy source version. Capacity numerics use PostgreSQL `numeric` without a fixed scale, so this new store does not impose the current source table's early two-decimal rounding. Existing rounded values are still copied exactly as stored; lost precision is not reconstructed.

| Columns | Exact purpose |
|---|---|
| `id`, `sourceId`, `schemeId`, `sourceVersion` | Stable assessment identity and link to existing source/scheme. Composite source/scheme foreign key prevents cross-scheme association. Version is the source version observed, not an invented measurement version. |
| `assessmentKind` | `legacy_snapshot` or `new_assessment`. A legacy snapshot is preservation evidence, not a newly verified engineering test. |
| `supersedesId` | Optional immutable predecessor, constrained to the same source/scheme. A predecessor may have only one successor. Old records are never updated to close or replace them. |
| `methodology`, `methodologyVersion` | Recorded method and derivation version. Examples include bucket timing, bulk-meter dial timing, installed-rating selection and an explicitly unknown legacy method. Raw observations/formulas/calibration assumptions are retained in provenance and assumptions. |
| `assessedAt`, `effectiveFrom`, `recordedAt` | Assessment time, effective date and database capture time are separate. Legacy assessment/effective dates remain NULL. New assessments cannot be backdated by this workflow or claim a future measurement time. |
| `responsibleOfficerId`, `capturedById` | Original assessor/confirmation officer, where known, versus the officer preserving/recording the evidence. New assessments require a responsible officer; legacy NULL stays unknown. Both are restricted user foreign keys; no placeholder officer is invented. |
| `recordedInstalledPumpCapacityM3Hr`, `measuredCapacityM3Hr` | Separately recorded rating and measured yield, both m³/hour. Legacy installed-field contents are copied under a deliberately qualified name because that old field has been used for measured yield as well. They are not promoted to verified installed ratings. |
| `regimeHoursPerDay`, `capacityM3Day` | Assumed production regime in hours/day and resulting practical capacity in m³/day. Finite, nonnegative values; regime ≤24. NULL remains unknown. |
| `benchmarkCapacityM3Month`, `benchmarkDays` | Original monthly figure and its documented day assumption. Initialization copies the existing monthly figure but leaves the day assumption NULL; it does not assume all database rows came from a 30-day workbook baseline. |
| `sourceWasActive` | Source's captured activation state. An archived source remains in the evidence store. |
| `assumptions`, `provenance` | JSON objects holding basis, units of observations, formula/conversion version, evidence location, workbook hash/sheet/cells where applicable, measurement-versus-assumption distinctions and known limitations. No external formula refresh or missing-value replacement. |
| `originalSourceRow` | Exact JSON representation of a legacy source row, including all old values, NULLs, dates, confirmation officer and version. New assessments use their explicit observations instead. |

Uniqueness prevents duplicate legacy snapshots for the same source/version. Source/scheme and predecessor foreign keys use `ON DELETE RESTRICT`. UPDATE, DELETE and TRUNCATE are rejected by database triggers. New assessments append records; they never replace stored legacy evidence.

The initial capture deliberately does not derive measured yield, an original assessment date, an effective date or a benchmark day count from nearby values or `updatedAt`. Those facts are not established by the existing source row.

### 2. `scheme_capacity_baseline`

A pinned scheme/month denominator with an explicit calculation basis and revision. It represents the capacity selected for a report, separately from current source configuration and actual production.

| Columns | Exact purpose |
|---|---|
| `id`, `schemeId`, `periodMonth`, `revision` | Stable baseline identity. Month is its first calendar day; scheme/month/revision is unique. |
| `supersedesId` | A correction is an explicit consecutive revision for the same scheme/month. A prior baseline cannot fork into competing successor revisions. |
| `basis`, `dayCount` | `original_fixed_days`, `calendar_days` or `preserved_report`. Fixed/calendar bases require an explicit day count. A preserved report may retain a known denominator without inventing an unknown day convention. |
| `capacityM3`, `completeness` | Denominator in m³. `complete` requires a known total matching all source contributions; `incomplete`/`unknown` require a NULL headline denominator. A measured zero is distinct from unknown. |
| `expectedSourceCount` | Explicit reviewed source roster count, including sources relevant to that baseline. It must match committed membership. This constraint cannot itself prove the real-world source inventory is complete. |
| `selectedById`, `recordedAt`, `reason` | Responsible selecting officer, database capture time and selection/revision explanation. |
| `assumptions`, `provenance` | Original period/basis evidence, workbook or prior-report references and any documented qualification. |
| `creationTransactionId` | Database-set transaction identity; permits contribution insertion only in the same transaction that creates the baseline. |

There is no migration-time population of this table. Assigning an existing snapshot to a past month requires verified original report/assessment evidence and a separately reviewed association. The source row's present configuration does not prove what denominator was used in July or August.

### 3. `scheme_capacity_baseline_source`

| Columns | Exact purpose |
|---|---|
| `baselineId`, `schemeId`, `sourceId`, `assessmentId` | Immutable source membership and chosen assessment. Composite foreign keys enforce the same source/scheme and a primary key prevents counting a source twice. |
| `contributionM3` | Source contribution to that selected period baseline, in m³; NULL denotes unknown. |
| `provenance` | Derivation/selection evidence, including any original-as-written exception. |

Deferred database constraints require all members to be inserted atomically, compare known contributions with the complete scheme total, and reject incomplete rosters. Membership becomes sealed when the creation transaction commits. A later INSERT cannot silently change the denominator even though the baseline header itself is immutable.

All three tables revoke PUBLIC access. Deployment permissions and service-only access must be reviewed against the actual application role. No broad client grants, grants to Supabase roles or changes to existing IAM permissions are proposed or executed. Existing scope checks in `lib/production/scope.ts` must be reused by the future service.

## Exact initialization proposed for approval

The capture draft copies **all existing source rows**, including inactive sources and unknown values, under a source-table share lock and one transaction. Capture must be performed by an identified, authorized global preservation officer, supplied as a transaction-local setting. It does not invent that officer's identity or grant the executing user broader IAM privileges.

1. Deterministic snapshot ID: `legacy-source:<sourceId>:v<sourceVersion>`.
2. Copy existing current daily capacity, stored practical monthly capacity, regime and installed-field value without recalculation or rounding.
3. Copy the full original row into `originalSourceRow`, including raw confirmation metadata.
4. Keep unknown original responsible officer NULL; capture officer identifies the act of preservation only.
5. Keep `assessedAt`, `effectiveFrom`, `measuredCapacityM3Hr` and `benchmarkDays` NULL for legacy captures.
6. Set neither production workflow status nor any target, report or billing value.
7. Verify every copied source/version exactly matches the original row and capacity fields. Any conflict aborts the transaction. A repeat with identical source/version values inserts no duplicate.
8. Create **no scheme/month assignment** and **no change to an old report**.

This is a new snapshot backfill, not a correction of old values. It must be approved before being promoted into an application migration or initialization workflow. Approval here would authorize only local implementation/testing; the user's prohibition on applying anything to connected Supabase remains in force.

## Why the existing tables alone are insufficient

The audit and current implementations were rechecked: `lib/production/{service,reporting,schemas,scope}.ts`, `lib/db/schema/intelligence.ts`, source/log guards 0069–0072, `lib/intelligence/engine.ts`, `lib/decision-support/{performance-engine,reports,types,board-pack,excel-reference}.ts`, actions and the existing Production workspace/panel plus Intelligence and Decision Support page/report consumers.

- `saveSource` currently updates one source row and clears `practicalCapacityM3Month`. A version counter and audit before/after records do not provide a stable report denominator by themselves.
- `loadProductionSummary` sums **today's active confirmed** source daily values and multiplies by the selected month's calendar days. Archiving or editing a source can therefore change a rerun of an earlier month.
- Both analytics engines consume that shared summary. Correcting only a dashboard label would not preserve the denominator.
- Report history currently contains only selected metadata/KPIs, not the complete chosen capacity baseline and source membership. An old capacity cannot be recovered from those fields where it was never retained.
- The old hourly field has mixed measured/installed semantics. Existing data cannot safely be reinterpreted without provenance.

The formula-review register remains the source for original assumptions and anomalies. The design retains as-written original results and any later approved correction as separate revisions. No original formula or error cell was fixed in this work.

## Application integration after approval

These changes are specified, **not implemented**:

1. Add Drizzle mappings for the three tables to the existing schema export. Register the reviewed DDL only after capture approval; do not run the business migration runner during development.
2. Extend `productionService.saveSource` to append an assessment and update the existing current-configuration projection in one transaction, with the same source locks, source version, IAM scope and audit. Keep measured yield separate from recorded installed rating. Do not clear preserved monthly evidence. Extend the existing source form with assessment/effective date, methodology evidence and assumptions; derive the capture actor from the authenticated user. Reuse the Production workspace.
3. Read historical reporting capacity from an explicitly pinned scheme/month baseline. Preserve the existing current-configuration value as a separately named operational metric. Do not silently fall back from an unavailable historical baseline to today's source configuration.
4. Pin report metadata to immutable baseline IDs and the report generation cutoff for every included scheme. Old generated reports retain their pinned revisions. Corrected baselines require explicit reissue/revision metadata; selecting “latest” when regenerating an old report must not silently reinterpret the old report.
5. Keep verified, provisional and legacy actual production exactly as the current log workflow defines them. New source assessments update engineering/configuration evidence, never actual m³ or old review states.
6. Propagate baseline identity, basis and availability through the existing shared summary into Intelligence, Decision Support, management reports and Board Pack. Preserve NRW formulas, utilisation classifications, collection fixtures and MPS/TPS calculations in Phase A.
7. Add application-level regression tests for source-assessment writes, atomic audit failure, concurrent source versions, scoped baseline selection, report pinning/replay, source archive and no-baseline availability. The current proof validates the database proposal; it does not substitute for those future integration tests.

A baseline month is a reporting selection, not a guessed measurement date. New assessments may influence a new planning/reporting baseline when explicitly selected, while the earlier month's selected baseline remains unchanged. Phase A must not invent source-effective dates to make historical reports appear complete.

## Isolated migration safety evidence

Proof runner: [validate-draft.mjs](validate-draft.mjs). Machine-readable successful result: [isolated-proof-results.json](isolated-proof-results.json).

- PostgreSQL **17.10**, new workspace-local cluster, loopback **127.0.0.1:55473**, database **swuws_phase_a_production_test**.
- The proof has a hardcoded loopback test target, no dotenv import, no application module import and no business-URL fallback. All records are synthetic. A fresh unique schema is used per run.
- Existing repository migrations through 0072 were applied only to that isolated synthetic namespace. Both the additive draft and its rollback were tested there. Existing integration tests used a different fresh namespace in the same isolated database, without the proposed tables.
- **35 checks passed**. Coverage includes exact-copy initialization, no changes to existing row values, NULL/archived sources, responsible-officer provenance, idempotency, rollback, immutability, sealed memberships, source/scheme FKs, mismatched/incomplete totals, no backdating, nonfinite rejection and stability after current-source changes and new assessments.
- The original-row JSON comparison includes source rows, production logs, scheme targets, report history, water schemes and users. SHA-256 before initialization and after initialization are identical: `63bc5b04bd166e40753ee14bf0f8af938209065c019ba5bc6f339e249122f7e5`.
- The proof deliberately edits **synthetic** source rows only after that equality check to demonstrate that a pinned baseline remains unchanged. It does not claim that current configuration becomes immutable.
- No claim is made that a real business dataset has passed preflight. Actual applied migrations, row counts, anomalies and historical evidence require a separately authorized inventory/export. Nothing in the local proof establishes a production migration is ready to execute.

### Documented workbook regression examples

| Original workbook example | Verified result and interpretation |
|---|---|
| KIGEZI!K2:N2 | 15 L / 22.94 s → 0.6538796861377506 L/s → 2.353966870095902 m³/h → 56.49520488230165 m³/day → 1,694.8561464690495 m³ per **30-day baseline**. PostgreSQL numeric agrees within documented float-cache tolerance; no forced calendar substitution. |
| RUJUMBURA!L4/L8 | `3600*10*0.01/37.5` → 9.6 m³/h; `3600*10*0.1/309` → 11.650485436893204 m³/h. Dial increment/count assumptions remain explicit. |
| KIGEZI!M3:N3, Katuna | Pump 7.5 m³/h ×14 h/day plus gravity `(15/19.11*3.6)` ×24 h/day → 172.81789638932497 m³/day → 5,184.536891679749 m³ per 30 days. Each source contributes once. |
| KIGEZI!H31/L31/M31, Rushaga | Installed 21 and measured 16.4 m³/h are retained independently. As-written selected installed rating ×5 hours gives 105 m³/day; no silent substitution of the measured value. |
| ISINGIRO!M10, Rugaga | As-written reference gives 799.0857142857144 m³/day. A diagnostic corrected-unit result is computed only in the isolated test to assert it is **different**, not to replace the saved baseline. |

### Exact validation results

| Command / scope | Result |
|---|---|
| `node outputs/phase-a-baseline-proposal/validate-draft.mjs` | **35/35 passed**, exit 0, including an independent version-correct direct SQL self-approval rejection test. |
| `npm test -- lib/production lib/decision-support components/production app/actions/intelligence.production.test.ts` | **9 suites passed, 68 tests passed**, exit 0. Existing workbook tests still preserve their original assertions; no fixture values were changed. Missing `DATABASE_URL` diagnostic warnings occurred in workbook/mapping suites; no Supabase URL was supplied. |
| Existing `lib/production/integrity.integration.test.ts`, with `SWUWS_PRODUCTION_INTEGRATION=1` and explicit loopback `PRODUCTION_TEST_DATABASE_URL` | **27 passed, 2 failed, 29 total**, exit 1. These failures occur without the proposed schema installed in that suite's namespace. |
| `npm run lint -- --no-cache` | Passed, exit 0, no lint findings. |
| `npx tsc --noEmit --incremental false` | Passed, exit 0, no type errors. |

The two existing PostgreSQL integration failures remain unmodified:

1. `scopes finding updates, validates transition grants and persists real dynamic evidence`: the fixture's migration list omits migration 0012, so the current schema's user selection fails with `column "phone" does not exist`. This is a test schema setup gap; the proposed baseline tables are not involved.
2. `enforces universal database-level self-approval prevention on new and direct updates`: the direct UPDATE omits the version increment, so the pre-existing trigger raises `Production version conflict` before the expected `Self-approval is forbidden`. The proposal proof separately exercises a version-correct UPDATE and confirms self-approval is rejected. The underlying protection was not disabled or changed.

These are not a fully green integration result. Fixing the existing harness/assertion should be scoped explicitly with the forthcoming implementation tests; no unrelated source/test repair was made before the user's approval gate.

## Files prepared and changes withheld

New review artifacts only:

- `outputs/phase-a-baseline-proposal/phase-a-proposal-and-safety-proof.md` — this proposal, exact scope, safety evidence and approval gate.
- `outputs/phase-a-baseline-proposal/schema-draft.sql` — additive schema draft.
- `outputs/phase-a-baseline-proposal/legacy-capture-draft.sql` — approval-gated verbatim snapshot initialization draft.
- `outputs/phase-a-baseline-proposal/validate-draft.mjs` — isolated proof and workbook-example regression runner.
- `outputs/phase-a-baseline-proposal/isolated-proof-results.json` — final 35-check results, target identity, comparison hashes and calculated examples.

Local ignored support data: `.artifacts/phase-a-postgres-20261030/` contains the disposable cluster and its server log. It is not part of the application or a business backup. The temporary server is stopped at completion.

No tracked application file or registered migration was modified. The previous audit artifacts remain unchanged. There is no new production UI. Phase A functionality is not yet wired into the running application, so the audit's existing historical-report vulnerability still exists until implementation is approved and completed.

## Remaining risks and proposed next step

1. Original figures already overwritten before capture cannot be recovered by a migration. Preserve existing audit records and report artifacts; reconcile those sources before assigning historical scheme/month baselines.
2. A source row's current value does not establish all its historical effective periods. Do not use an initial snapshot to fill every past month. Old reports without capacity evidence must explicitly remain unresolved rather than receive invented denominators.
3. The original workbook has 106 external-reference formulas and 19 saved error cells. These remain original evidence. No linked-workbook balance, missing input, tariff, MPS/TPS value or collection percentage was repaired or invented.
4. Database-owner credentials can bypass triggers through DDL; actual application-role grants and service scope enforcement need deployment review. This proof tests ordinary SQL DML protections, not resistance to a database administrator changing the schema.
5. Source-roster completeness requires engineering review. A correctly summed but incomplete source inventory is still incomplete evidence.
6. UI/API/schema/report changes and real report replay tests remain to be implemented after approval. There is no automatic transition to latest assessment or latest baseline revision in the proposed reporting contract.

**Approval requested:** authorize the exact-copy legacy source snapshot initialization described above as part of local Phase A implementation, with no historical date/period assignment, no recalculation or overwrite of old values, and no Supabase execution. If approved, complete the service/schema/UI/report integration and regression tests described here. Any later historical scheme/month assignment or correction requiring additional evidence remains separately reviewable.

After Phase A, propose Phase B for original utilisation interpretation and MPS/TPS target-chain restoration, followed by separately scoped collection-fixture corrections and external-reference/error reconciliation. None of those calculations changes in Phase A.
