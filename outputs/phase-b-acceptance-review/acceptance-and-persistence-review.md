# SWUWS Phase B final acceptance and persistence readiness

Recommendation: **NO-GO for Phase B persistence or production activation now. GO for local acceptance of the verified reference arithmetic only.** The existing regression evidence is valid, but it does not establish immutable historical assessments, correct effective-period selection, safe target persistence or complete management-report provenance. Seven additional acceptance probes fail. No fixes or database changes were made during this review.

## Evidence read and scope protected

Read in full: the Phase B implementation report, its validation-summary JSON, the engineering-basis formula-review register and the actual original workbook. All 18 worksheets and every nonempty cell/formula were inspected programmatically. The workbook has 1,555 formulas, 106 external-reference formulas and 19 saved #DIV/0! cells. Its SHA-256 remains `4965cef7c3c02428c8cf6a3af465c68ff2f3ccd56978182af2cbb44eccf6e622`.

Whole-workbook comparison against the original extraction shows zero normalized value/formula differences. The raw comparison initially reports 19 differences because SheetJS represents #DIV/0! as numeric error code 7 and the older evidence stores decoded text. They are the same error cells and formulas, not changes to the workbook. `workbook-verification.json` explains this normalization.

The 17 tracked modifications and four new application source/test files were inspected, along with all 26 other initially untracked review artifacts. All 30 initial untracked files were read; JSON evidence was parsed and traversed. The 48 protected files (17 tracked modifications, 30 untracked files and the external original workbook) retain identical before/after SHA-256 values. No source or earlier output was modified. Review-created documentation, read-only scripts and synthetic tests are confined to this new directory. See `untracked-work-inventory.md`, `preservation-before.json` and `preservation-after.json`.

No SQL, migration, database inventory script, historical capture, Supabase access, commit, push, merge or deployment was executed. Existing proof scripts that use PostgreSQL or configured business credentials were inspected but not run. Application database calls in fresh tests were mocked. A baseline-drift test calls the actual read-only summary function with a synthetic client; it does not connect to PostgreSQL.

## 1. What is implemented, and what is not

| Capability | Verified implementation | Acceptance limit |
| --- | --- | --- |
| MPS inputs | Original G/I/K/O preserved with cells, units and states; K5 override retained | Read-only benchmark inputs; not a newly calculated, approved MPS policy or verified same-period actuals |
| TPS inputs and chain | Explicit original H/J/U/T/R read; L=H×F, M=L−5%L, P=M−25%M, Q=P×U, S=R+Q | Only supported inputs are used; no automatic H uplift, date assignment, live approval or target revision storage |
| Formula provenance | Value/state/unit/source/dependencies/reason/savedValue; workbook hash and historical basis in reference dataset | `AVAILABLE` is a reference-calculation state, not live verification; no persisted immutable provenance contract |
| Error/missing propagation | Missing H27, Excel errors and external lookups block affected calculations; original saved zeroes remain provenance | External caches never establish live arrears or receipts; unverified dates remain unknown |
| Utilisation helper | Original ranges shared; exact 75/85 marked boundary review; stressed 85–95, critical>95 | The Intelligence underused finding still uses a rounded percent and misses 49.999%; attention also depends on sales quality |
| Actuals and estimates | Verified production workflow/date selection retained; balance-derived collections explicitly estimated; report cash/efficiency unresolved | Current source capacity is still a mutable configuration benchmark, not an engineering-history denominator |
| Reports and Board Pack | Existing report functions extended;14 slides retained; dynamic XML escaping and unresolved financial displays tested | Reference targets are not wired into live approved-target reporting; misleading Board headings/action text remain |
| Engineering baselines | Existing source version counter and audit retained | **No immutable assessment application implementation, historical selection, report pinning or baseline table mappings** |
| Live persisted production target | Already queried scheme_target rows now populate the scoped period target when row coverage is complete | Existing flat target table is not original MPS/TPS version/approval storage; nonfinite target values lack rejection |

`formula-comparison.md` gives every implemented business formula, exact workbook source, required inputs, software location, unit and test result. `workbook-and-design-evidence.json` includes each operational L/M/P/Q/S formula and result, not just selected examples.

## 2. Numerical agreement and important distinctions

The local engine reproduces **252 L/M/P/Q values across 63 fully specified schemes with maximum absolute difference 0**. Rushaga remains unresolved. It also reproduces the three supported S demand examples, giving 255 available target formula comparisons in total. Other 61 scheme S results are unresolved. This is agreement with saved workbook values and explicit formula arithmetic; it is not a recalculation by Microsoft Excel or a refresh of external workbooks.

| Example | Inputs | Excel and local result |
| --- | --- | --- |
| Ryakarimira L5 | F5=1694.8561464690495 m3/fixed month; H5=0.6044675925925926 |1024.4856146469049 m3 |
| Ryakarimira M5 | L5−0.05L5 |973.2613339145596 m3 |
| Ryakarimira P5 | M5−0.25M5 |729.9460004359197 m3 |
| Ryakarimira Q5 | P5×U5, U5=2118 UGX/m3 |1546025.6289232778 UGX target billing |
| Katuna L6/Q6 | F6=5184.536891679749; H6=0.9673351046918289; U6=2990 | L6=5015.184536891679 m3; Q6=10684223.75778061 UGX |
| Habutobere S26 | Original explicit R26=0 plus computed Q26 |1405703.3624999998 UGX historical target demand |
| Rushaga L27/M27/P27/Q27 | H27 missing; saved Excel caches zero | Local values null/unresolved; original saved zero retained |

The first source chain remains traceable: KIGEZI!I2/J2=15/22.94=0.6538796861377506 L/s, then×3.6 hourly,×24 daily and×30 fixed-month capacity. GLOBAL SUMMERY!F3 and TARGETS GOLBAL!F5 copy the resulting 1694.8561464690495 number. These copied values do not establish assessment dates or reporting-year links.

Original G5 is the stored combined-period utilisation 0.5044675925925927; K5 remains a different 1,500 benchmark override. Historical July/August production 810/900 and sales 746/823 do not become management targets or independently verified actual logs. The declared target NRW J5=30% differs from the preserved 5%-then 25% chain's28.75%; that disagreement is explicitly diagnostic.

The earlier implementation report's blanket language about unresolved arrears/demand needs this qualification: original R26/R68/R69 are explicit numeric zeroes, permitting three historical S calculations. Their calculation availability does not verify present-day arrears. This review does not edit the earlier report.

## 3. Data integrity and provenance findings

| ID / priority | Finding and exact evidence | Required correction or proof before acceptance |
| --- | --- | --- |
| A1 / blocker | **Historical denominator still drifts.** Same synthetic July 2024, same actual production, current daily source capacity 100→200 changes reported capacity 3100→6200 m3. Actual function `lib/production/reporting.ts:62` uses current active source capacity×calendar days. `saveSource` overwrites current source values and clears monthly capacity at `service.ts:186` | Implement approved immutable assessments and explicit pinned report baseline selection. Never treat current configuration or captured-at date as historical effectivity. New acceptance probe fails |
| A2 / high | **Persisted target nonfinite guard missing.** A synthetic scheme_target value `NaN` reaches `kpis.targetProductionM 3` as NaN; `performance-engine.ts:302` checks only null and `:361` applies Number/sum. Local scheme_target schema/migration has no finite-value CHECK | Validate finite, nonnegative target values and valid scope coverage before using them. Do not replace invalid data with zero. No business NaN record is alleged; this is a reproduced boundary defect |
| A3 / high for persistence | **Availability fails open when omitted.** `displayMeasurement(85,undefined,'percent')` returns 85%; availability is optional in types. Reports mark omitted-flag numerical inputs VALID | Require explicit measurement/estimate/unavailable provenance in persisted/report datasets. Legacy data should remain unresolved unless established. Current live/reference producers do provide flags; this probe exposes compatibility/persistence risk, not evidence that current cash was fabricated |
| A4 / high | **Sales quality suppresses capacity attention.** A fully observed synthetic production/capacity row classifies critical 95.238%, but missing sales makes dataQualityStatus incomplete and `attention-engine.ts:63` emits no capacity item | Separate domain-specific capacity completeness from sales/NRW quality. Preserve the capacity exception with its own confidence and evidence. Fresh probe fails |
| A5 / medium | **Underused boundary uses rounding.** Shared classifier says 49.999% underused; `intelligence/capacity.ts:58` checks displayed 50.0 and emits no underused finding | Apply the same unrounded band in all classification/finding branches. Fresh probe fails; existing pure-helper boundary tests did not cover this consumer |
| A6 / high reporting | **Board slide 4 says Approved TPS Targets** for undated original reference targets, although no live approval or period has been established (`board-pack.ts:111`) | Qualify the heading and retain reference/approval status consistently. The body qualification does not remove the misleading heading. Fresh probe fails |
| A7 / high reporting | **Board slide 12 always says no open management actions**, without querying/passing action-register evidence (`board-pack.ts:141`) | Obtain scoped action-register evidence or report unavailable. This statement is inherited from the existing exporter, not newly introduced by Phase B. Fresh probe fails |
| A8 / medium policy | **An 85% collection benchmark still exists** at `intelligence/commercial.ts:45`, while original workbook T inputs are blank. Collection findings can be critical despite being labelled estimated with MEDIUM confidence | Record this as a pre-existing rule assumption with its approval/source, not an original workbook target or actual collection result. Separate estimate-driven recommendations from verified target achievement. Do not silently change it during this review |
| A9 / medium reporting | Board slide 10's empty-delta fallback says comparison active; slide 11 is generic, not an actual findings list. Reference target examples cover only the first two schemes | These inherited/reporting limitations need clear missing/comparison scope labels and acceptance tests. Fourteen parseable XML slides prove structure, not complete management decision support or visual acceptance |

The controls that **do pass** fresh acceptance probes: absent sales/billing/target records remain unavailable; balance-derived cash 20 is not published as verified cash; explicit recorded zero sales and zero targets remain zero; workbook year remains null, coverage unknown and supply incomplete.

The initial concern that an existing meter/billing aggregate might be null was checked against the declared local schema: meter_reading.consumption/billedAmount and billing_record.billAmount/arrears/totalDue are NOT NULL, and SQL groups arise from matching records. A fabricated null-row scenario is therefore not treated here as a verified live-data discrepancy. `NaN` target handling, missing availability flags and unsupported Board claims are the demonstrated remaining cases.

Actual production, billed consumption and billing demand still come from distinct existing stores. Billing demand is not realised revenue or cash; water sold is billed consumption, not a measured supplied-water record. Balance allocation inference is not receipt reconciliation. Available reference targets are not operational actuals. Numerical compatibility zeroes exist in the dataset but require their availability flags; the fail-open contract must be addressed before history is persisted through it.

## 4. Persistence design: exact objects and approval boundary

See `persistence-inventory.md` for **every proposed column with type/default/nullability, all inline/table constraints, all keys/indexes, all four functions and all eleven trigger definitions**, extracted from the actual unchanged SQL draft. There are 45 proposed columns:23 assessment, 16 baseline and 6 membership.

| Draft object | What would be stored | What remains calculated / historical |
| --- | --- | --- |
| source_capacity_assessment | Source/scheme/version, kind/predecessor, methodology/version, assessment/effective/recorded dates, responsible/capture officers, separate rating/measured/hourly/daily/monthly figures, regime/day convention, active-state snapshot, assumptions/provenance and original legacy row | Immutable historical evidence. Future current configuration is a separate projection. Raw observations, derivation and units must be explicit; no dates inferred |
| scheme_capacity_baseline | Scheme/month/revision/predecessor, fixed/calendar/preserved-report basis, day count, immutable denominator or null, completeness, reviewed roster count, selector/reason/provenance and creation transaction | Historical selected denominator remains a snapshot. Utilisation/NRW/variance can be calculated from appropriately scoped actuals without changing that denominator |
| scheme_capacity_baseline_source | Source membership, selected assessment, immutable period contribution and provenance | Contribution derived once under the approved basis and then snapshotted. Later source changes do not rewrite it |

The draft has 25 CHECK constraints, 9 FKs, 3 primary keys, 6 UNIQUE constraints, 2 named indexes and 9 implied unique indexes. It rejects UPDATE/DELETE/TRUNCATE on history, seals membership after its creation transaction, validates sums and enforces source/scheme identity. Legacy dates remain null; forward new assessments cannot backdate effectiveFrom using the draft writer. These are useful protections, but they do not enforce the full reporting contract.

**No proposed columns are added to existing tables in this draft. No new registered migration or Drizzle mapping exists.** `schema-draft.sql` is additive review DDL only. `legacy-capture-draft.sql` is a separate INSERT SELECT historical initialization draft, not an approved migration and not authorised here. `db/migrate.js` searches db/migrations/*.sql only. Its last production-workflow file remains 0072. Do not move or register these drafts as part of acceptance.

**No concrete Phase B target-version schema has been supplied.** The existing scheme_target stores flat scheme/period targets, not original MPS/TPS inputs, target formula version, source assessment/baseline, approval status, provenance, historical revision or immutable report selection. Column names and migrations for that work cannot be approved when they have not been specified. This review does not invent another target table or duplicate module.

### Persistence blockers found by static inspection

1. **Effective-period eligibility:** baseline membership FKs enforce identity, but no constraint/guard ties assessment.effectiveFrom to baseline.periodMonth. A future-effective assessment must not be selected for a past period merely because source/scheme match. Mid-month policy and any interval weighting also need explicit design. No historical date is inferred here.
2. **Calculation integrity:** total=contributions is enforced, but contribution=approved assessment×documented basis is not. The draft does not verify calendar day count, assessment active/effective selection, units or required evidence keys. Provenance must be substantive, not just a nonempty JSON object.
3. **Assessment lineage:** new assessments do not require a predecessor or unique assessment revision, and there is no explicit self-predecessor or effective-order guard. The sourceVersion uniqueness is limited to legacy snapshots. Required negative tests have not been run under the current no-SQL instruction.
4. **Report pinning absent:** neither the draft nor current report history provides an immutable report-to-baseline FK/association. New metadata describes the unresolved basis but does not pin a denominator. Selecting the latest assessment/revision automatically would defeat preservation.
5. **Target persistence absent:** no reviewed MPS/TPS version/approval/period/source model or target-store migration exists. H policy, collection target policy and exact 75/85 boundary ownership remain business evidence questions.
6. **Permissions not deployment-ready:** REVOKE PUBLIC is present; RLS, actual deployment-role grants, organisation/actor validation and scoped writer/readers are unspecified. Officer FKs identify valid users, not whether those users are authorised for that scheme. Existing Production IAM and verification rules must remain authoritative.

The old 35-check synthetic proof does not test all these guarantees. The old 29 output equalities demonstrate that unused additive tables and unused assessments did not affect then-current outputs; they do not prove a future reader/writer switch or this Phase B revision is safe. The previous PostgreSQL integrity suite remains 27 passed /2 failed /29 total, exit 1. Its user.phone fixture and version-conflict-before-self-approval expectation failures are documented and remain unresolved. **No SQL proof was rerun in this review.**

## 5. Historical records and effective periods

The prior engineering inventory was captured at 2026-10-30T12:38:04.704Z, not during this review. It reported 0 source rows, 0 production logs, 0 report-history rows, 0 scheme mappings and 0 source-capacity audit records, with 64 schemes and 8 billing periods. This remains a historical observation, not a new assertion about the connected database today. No eligible historical backfill was identified, and none is proposed.

The workbook's92 source rows and 64 scheme benchmarks have no confirmed assessment dates or reporting year. Identity review has 54 name/hierarchy candidates, 2 hierarchy conflicts (Mayanga/Itojo) and 8 unmatched schemes. Those candidate identities are not approvals of assessment dates or calendar periods. Existing July/August 2026 billing periods do not date the workbook. Duplicate August period labels do not resolve a missing year or source relationship.

| Historical relationship/data | Verified state | Required treatment |
| --- | --- | --- |
| Workbook source→scheme grouping and copied capacity figures | Original cells and hierarchy preserved; arithmetic can be traced | Keep as historical engineering reference, with unknown effective dates |
| Source→current database source identity | No source records eligible in prior inventory | No automatic source creation/import/backfill |
|54 scheme identity candidates | Names/hierarchy coherent only | Do not approve target/baseline period assignment from identity alone |
| Mayanga/Itojo and 8 unmatched schemes | Conflicts/unresolved identity | Investigation required; no automatic linkage |
| Workbook July/August→calendar billing period | No confirmed year/period mapping | Keep unresolved; do not use filenames, current settings or convenient 2026 periods |
| Original targets, external arrears, tariffs and errors | Reference evidence with limits | Preserve raw values and assumptions; no historical target rewrite or actual production/billing import |

## 6. Impact on existing SWUWS modules

There are no current business-data effects from this review. Source hashes confirm that CRM, billing, receipts, reconciliation, IAM, Production service/workspace and registered migrations were not changed by the review. The inspected Phase B modifications remain exactly as supplied at review start.

The proposed DDL adds no billing/CRM/receipt columns, triggers or recalculation. However ON DELETE RESTRICT on new user/source/scheme relationships would prevent physical deletion once history exists; those deletion/retention flows require acceptance testing. Soft source archiving remains possible, and historical readers must avoid filtering an old roster by current active status. Future baseline integration must preserve Production version checks, atomic audits, independent verification and tenant scope.

Existing source capacity columns round hourly/daily/monthly values to their declared scales. The draft's unscaled numeric columns can retain an exact captured value, but cannot recover precision that was already lost or justify rederiving an old assessment. Preserve existing values verbatim and retain the original workbook's as-written precision separately with its provenance; do not silently substitute a reconstructed value.

Intelligence and Decision Support both use the same current-capacity summary; both require coordinated pinned-baseline integration. New target persistence must not post bills, infer receipts, change tariff billing rules or convert workbook benchmarks into actual production. Board reports require explicit baseline/target revisions and actual-data provenance to be reproducible. Snapshot denominator protection does not by itself freeze later corrections to actuals; full report replay needs an explicit actual-data snapshot/cutoff contract too.

## 7. Regression evidence and new checks

| Scope | Exact evidence reviewed / run | Exit |
| --- | --- | --- |
| Previous final full application regression | Actual tests-final.log:54 suites passed;412 tests passed, 1 skipped, 0 failed;156.67s. Skip is the optional private SMS workbook fixture |0 |
| Previous final full lint | Actual lint-final.log/exit: zero errors/warnings |0 |
| Previous final standalone typecheck | Actual typecheck-final.exit=0; empty diagnostic log |0 |
| Previous final production build | Actual build-final.log/exit: compilation, TypeScript and 12 static pages complete |0 |
| Previous unsuccessful parallel full run | Actual tests.log/exit:408 passed, 4 failed, 1 skipped;3 suites failed. Existing CRM/SMS 5-second timeouts |1 |
| Previous unsuccessful one-worker full rerun | Actual tests-single-worker.log/exit:409 passed, 3 failed, 1 skipped;3 suites failed. Two CRM timeouts and the then-wrong new slide 12 assertion |1 |
| Previous interim targeted run | Actual targeted-final.log/exit:184 passed, 1 failed. Same slide assertion, corrected before the final green run |1 |
| Fresh existing application targeted regression |19 suites;185 passed, 0 failed, 0 skipped;84.70s. Decision Support, Production, Intelligence, scopes and permission tests |0 |
| Fresh acceptance controls and gap probes |11 tests:4 passed, 7 failed, 0 skipped. Failed cases A1–A7 above; actual JSON and log retained |1 |
| Fresh review-harness lint | The three review scripts/tests linted, zero findings; application source untouched |0 |
| Prior synthetic DDL/capture proof | Existing JSON 35/35 passes, not rerun |0 recorded |
| Prior output-invariance evidence | Existing JSON 29/29 equalities, not rerun; unused schema state only |Prior evidence |
| Prior PostgreSQL integrity suite |27 passed, 2 failed, 29 total; not rerun |1 recorded |

Full build/lint/typecheck were not rerun simply to repeat unchanged application checks. Their actual final logs and exit files were inspected, and fresh targeted tests were run where acceptance coverage was missing. A new build would write generated files; this review did not rebuild or restore them. Review scripts are plain JS and add no TypeScript application input. Default application tests exclude outputs/**; the explicit review configuration runs the new probes separately. No test was weakened or skipped to make a failed acceptance criterion pass.

Build warnings remain: deprecated middleware convention; metadataBase unset; Turbopack project-wide file tracing; `/maintenance` dynamic headers during static-render consideration. Exit 0 is verified, but this is not a warning-free or visually accepted production release. No manual browser or PowerPoint visual acceptance was performed. The 11 probe failures/passes should not be merged into the historical 412-test run as if they ran together.

The read-only extraction/appendix harness each initially encountered a local helper error (CommonJS default-import interop; absent formula text on literal Excel error cells). Only new review helpers were corrected; final extraction/appendix runs exited 0. Neither event changed application code, workbook data or database records.

## 8. Approval decision matrix

| Decision area | Recommendation now | Evidence / next approval gate |
| --- | --- | --- |
| Original supported L/M/P/Q arithmetic and three usable S examples | **GO, local reference acceptance** |255 exact saved-value comparisons; preserve historical/reference qualification |
| Missing-input/error/external-reference propagation in the pure calculator | **GO, local reference acceptance** | Rushaga null propagation, explicit zero and external-cache tests pass |
| Utilisation classification and capacity attention in all consumers | **Further fixes/tests required** | A4/A5; confirm 75/85 business policy without guessing |
| Current availability/provenance and target boundaries | **Further fixes/tests required** | A2/A3; make persisted interpretation explicit and reject nonfinite values |
| Fourteen-slide export structure | **GO for local structural preservation only** | XML tests pass; A6/A7/A9 and manual visual acceptance remain |
| Current engineering-history implementation | **NO-GO** | A1 proves historical drift; no immutable service/schema/report integration |
| Additive assessment/baseline schema execution | **Explicit approval required after design revision and isolated tests** | Exact inventory available; effective-period, lineage, derivation and role gaps unresolved |
| Legacy capture/backfill draft | **Do not execute** | Historical population is not authorised; no eligible records identified; no date/period assignment |
| Phase B target-version persistence | **NO-GO for migration approval** | No exact target-version/approval/report-link DDL has been proposed |
| Historical workbook values, targets, billing/CRM/receipts and actual production | **Remain unchanged** | No imports, recalculation of stored values, guessed dates or target replacement |
| External references, original errors, 30/60-day conventions, 5%/25% assumptions and unsupported collection benchmark | **Preserve and investigate** | Supporting evidence/business approval required; no replacements inferred |
| Commit, Supabase migration/data change, deployment | **Not authorised / not performed** | Separate explicit approval required |

For a later GO recommendation, first resolve A1–A7 and the persistence-design blockers in a separately approved scope, publish the precise target/report-link migration proposal, repair the existing SQL test harness expectations, and demonstrate positive and negative effective-period/permission/replay cases in a disposable PostgreSQL environment. That future test authorization must be explicit because this review prohibits all SQL execution. No backfill is part of that recommendation.

**Final decision: NO-GO for Phase B persistence now.** The verified calculator can be accepted locally as reference functionality. Stop and await approval for the next bounded design/fix/validation phase. No historical mutation or deployment is implied by accepting the arithmetic.
