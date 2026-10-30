# SWUWS Phase B — controlled local implementation

Status: calculation and presentation changes implemented locally; historical persistence and production activation remain blocked pending database design approval. No commit, deployment, Supabase migration, backfill or production record mutation was performed.

## Phase A prerequisite: incomplete

The prior review's conclusion remains valid: optimistic source-row versioning and audit events are not immutable engineering assessments. Current source configuration still supplies report capacity. The application does not yet persist assessment methodology, responsible officer, effective dates, assumptions and provenance as immutable versions, nor pin a historical report to an approved scheme assessment. Consequently changing source configuration can still affect recalculated historical capacity. This implementation does not claim otherwise.

The existing proposal under `../phase-a-baseline-proposal/` requires three additive entities: `source_capacity_assessment`, `scheme_capacity_baseline`, and `scheme_capacity_baseline_source`. Those drafts were not registered or applied. Existing prior synthetic proof results are not evidence that the application integration is complete. The previous integrity run was 27/29, with two fixture failures; it was not rerun here. Current local permission and Production regression tests pass, but cannot prove absent persistence functionality.

No historical backfill is proposed. The prior read-only inventory found no existing source, production-log, mapping or report-history records eligible for such a backfill. No new inventory or business database connection was made in this continuation. Historical dates remain unknown; the workbook filename and July/August labels do not establish an effective year.

Independent Phase B calculations were implemented without adding persistence. Historical target activation and report-baseline protection remain the first database approval gate.

## Implemented features

- A pure MPS/TPS calculation engine with explicit value, state, unit, source cell, dependencies, reason and original saved value. Missing inputs, Excel errors and unresolved external references propagate instead of becoming calculated zeroes.
- Read-only parsing of the original workbook, with SHA-256 provenance. The reference adapter distinguishes 64 operational schemes, 92 regional technology/source rows and six explanatory legend rows. Operational-area grouping remains intact.
- Original MPS and TPS leaf indicators are retained separately: utilisation, NRW, production, sales, tariff, external arrears and collection target. TPS production, supplied water, sales, billing and demand are calculated only from supported dependencies. Historical MPS values and manually stored TPS utilisation inputs are not rewritten.
- Reference targets appear in the existing monthly report and existing Board Pack. All 14 slides are retained; dynamic XML text is escaped and the exported slides are tested as XML. Reference targets are labelled planning figures, with unknown reporting year and approval status.
- Workbook utilisation bands are shared by Decision Support and Intelligence. Exact 75% and 85% boundaries have an explicit review state because the workbook's printed intervals overlap; no ownership rule was invented. Classification uses the unrounded ratio.
- Missing sales are unavailable rather than measured zero. Signed production-to-sales inconsistencies are retained for investigation; negative NRW does not become an operational leakage finding. A zero production denominator is unresolved, while measured zero production remains an observation.
- Reference fixtures no longer invent 85% collections, supplied water equal to production, a reporting year or 100% completeness. Unknown coverage is labelled unknown. Existing numerical compatibility fields are accompanied by availability flags; updated report/dashboard/export consumers honour those flags.
- Live reports retain existing balance-inferred collection estimates in the dataset but withhold verified cash and collection performance. Intelligence labels these as estimates, reduces confidence and avoids evaluating collection-target achievement from them. Receipt, billing and reconciliation writes are untouched.
- The live performance engine now consumes its already-queried, persisted period production targets; it does not attach or approve workbook targets automatically. A population total target remains unresolved if any scoped scheme lacks its target.
- New report-history metadata records availability, collection basis and the unresolved historical capacity basis. No report-generation action was invoked during validation.

## Calculation evidence and inputs

The authoritative detailed cell/dependency evidence remains in `../phase-a-final-phase-b-proposal/mps-tps-dependency-register.md` and its JSON companion, and `../engineering-basis-review/formula-review-register.md`. The workbook is read, never rewritten. The calculator is an explicit implementation of selected dependencies, not an evaluator of arbitrary Excel formulas.

| Workbook evidence | Meaning and units | Local implementation / database source | Regression evidence |
| --- | --- | --- | --- |
| `TARGETS GOLBAL!F,G,H,I,J,K,O,T,U` per scheme | Fixed-month capacity; MPS/TPS utilisation and NRW fractions; MPS production/sales m3; collection target; tariff UGX/m3 | `excel-reference.ts` creates stateful inputs; `mps-tps.ts` retains them. Reference-only inputs, no database import | Original workbook parsing, Ryakarimira MPS K override, missing collection inputs |
| `Lr=Hr*Fr` | TPS production, m3/target-month | `calculateMpsTps().production`; no persisted target write | All 63 schemes with complete inputs compared against original saved L values |
| `Mr=Lr-0.05*Lr` | TPS supplied water, m3/target-month | `.supplied`; 5% is an explicit original target assumption, not a measured loss | All 63 original M caches replayed |
| `Pr=Mr-0.25*Mr` | TPS sold water, m3/target-month | `.sold`; declared J is deliberately not substituted into this dependency | All 63 original P caches; diagnostic for declared-versus-derived NRW |
| `Qr=Pr*Ur` | Billing target, UGX/target-month | `.billing`; analytical calculation only, never bill posting | All 63 original Q caches, including both original tariff regimes |
| `Rr` external lookup; `Sr=Rr+Qr` | Arrears and total demand, UGX | External caches retained as provenance; `.demand` remains unresolved without verified R | External dependency tests, saved cache retained but unusable |
| `GLOBAL SUMMERY` production G/H/I, sales M/N/O and Q/R/S ratios | Historical month-labelled observations and `(production-sales)/production` | `excel-fixture.ts`, `data-validation.ts`; no actual-record import | Missing September, signed NRW and zero denominator tests |
| `GLOBAL SUMMERY!D79:E83` interpretation legend | Underused <50; healthy 50–75; optimal 75–85; stressed 85–95; critical >95 | `classifyUtilisation`; live numerator remains verified logs, denominator remains current configuration pending Phase A | Twelve boundary/rounding tests plus live classification test |
| Regional source measurements and fixed 30-day scheme capacity | L/s, m3/hour, m3/day, m3/benchmark-month | Existing Production methodologies preserved; no new baseline persistence or source formula changes | Existing Production tests remain; full source-assessment replay/pinning requires Phase A |
| Existing live billing consumption, current demand and balance inference | Actual billed sales m3; billed demand UGX; estimated collections | Existing performance-engine queries retained; flags prevent estimates/missing data becoming verified results | Three mocked live-engine tests; no network database connection |

MPS production K generally references July while MPS sales O generally references August; these are retained as separate historical benchmark inputs, not silently aligned into a single verified period. Ryakarimira K remains its original 1,500 override, rather than July's 810. H contains different manually stored uplifts, not one universal policy. J is a declared TPS NRW indicator; the M/P chain implies 28.75% production-to-sales loss. Diagnostics expose differences rather than silently substituting J.

Analytical arithmetic uses JavaScript numbers, compared with Excel saved values using tolerance in regression tests. It does not create financial ledger entries or redefine financial rounding policy.

## Before and after

| Example | Previous behaviour / risk | Local result |
| --- | --- | --- |
| 63 complete target rows | No complete original target chain in report dataset | L/M/P/Q reproduce every supported saved example; original leaf inputs retained |
| Rushaga H27 missing; L/M/P/Q saved zero | Saved zero can conceal a missing TPS input | H missing, dependent targets unresolved; original saved zero remains provenance |
| Ryakarimira K | Risk of replacing benchmark with current production | Original 1,500 MPS override retained, not replaced by July 810 |
| Workbook R external cache | Cached reference can masquerade as verified arrears | R and dependent S unresolved; saved cache retained separately |
| 95.238% utilisation | Earlier bands could understate severity | Critical >95%, evaluated before display rounding |
| No sales observation | Numerical fallback can imply 100% NRW | Sales and NRW explicitly unresolved |
| Production 100, sold 110 | Negative discrepancy can be clamped away | -10% retained with DATA_INCONSISTENCY, not a leakage diagnosis |
| Balance-derived cash estimate 20 | Could be presented as verified cash | Estimate retained with `balance_inference`; report cash and collection efficiency unresolved |
| Workbook completeness/year | Fabricated 100% coverage and year | Coverage unknown; year null, no inferred effective period |

For the documented Ryakarimira row 5 example, original F = 1,694.8561464690495 m3/benchmark-month and H = 0.6044675925925926. Local results reproduce L = 1,024.4856146469049 m3, M = 973.2613339145596 m3, P = 729.9460004359197 m3, and Q = 1,546,025.6289232778 UGX at U = 2,118 UGX/m3. These remain analytical targets, not generated bills or production observations. R and S remain unresolved.

## Unresolved evidence and remaining work

The workbook still has 106 external-reference formulas and 19 saved error cells. No replacement values were invented. The existing formula-review register remains the location-level record. Rushaga's missing target utilisation and saved errors remain unresolved. The original ISINGIRO Rugaga M10 mixed-unit reference is neither corrected nor imported into a historical baseline.

Live original-target assignment, approvals, immutable target revisions and historical assessment selection are not implemented. Confirmed scheme identity is not proof of historical effective dates: the prior mapping review has 54 coherent candidate identities, two hierarchy conflicts and eight unmatched schemes. None is automatically assigned an assessment or reporting period here.

The reference path can be supplied via `SWUWS_ENGINEERING_WORKBOOK`; otherwise the local original file or same-name project file is used. Deployment needs a deliberately provisioned reference artifact and approval. The application does not import Excel figures into operational production, billing or target tables.

Production, CRM, billing, receipts, reconciliation and IAM source modules were preserved. Current-source capacity selection is unchanged and remains vulnerable to historical recalculation until Phase A is approved and implemented. Existing API consumers outside this repository must honour availability flags rather than interpret compatibility zeroes as measurements. Manual browser acceptance and isolated PostgreSQL integration validation of the future persistence design remain necessary.

The existing management-attention path still has a shared row-quality gate, so incomplete sales can conservatively suppress a capacity attention item even when a classification is displayed. Intelligence's capacity evaluator remains independent of sales. A dedicated per-domain completeness contract is further local work before production acceptance; this continuation does not claim that every report consumer has an immutable assessment or independently verified completeness model.

## Files changed

New source/tests:

- `lib/decision-support/mps-tps.ts`
- `lib/decision-support/display.ts`
- `lib/decision-support/mps-tps.test.ts`
- `lib/decision-support/performance-engine.test.ts`

Modified source/tests:

- `app/actions/decision-support.ts` — report metadata
- `app/decision-support/decision-support-dashboard.tsx` — availability-aware existing displays
- `lib/decision-support/attention-engine.ts`
- `lib/decision-support/board-pack.ts`
- `lib/decision-support/data-validation.ts`
- `lib/decision-support/excel-benchmark.test.ts`
- `lib/decision-support/excel-fixture.ts`
- `lib/decision-support/excel-reference.ts`
- `lib/decision-support/performance-engine.ts`
- `lib/decision-support/reports.ts`
- `lib/decision-support/types.ts`
- `lib/intelligence/capacity.ts`
- `lib/intelligence/commercial.ts`
- `lib/intelligence/engine.ts`
- `lib/intelligence/nrw.ts`
- `lib/intelligence/targets.ts`
- `vitest.config.ts` — excludes review-output artifacts from default discovery; database suites remain opt-in

No new database structures or migrations were created during Phase B. Existing SQL proposals and all earlier review artifacts were preserved. The Git worktree has 17 tracked modifications, four new source/test files and the existing untracked `outputs/` tree, now containing this report. No unrelated local work was reset or overwritten.

## Approval gate

| Work | State / approval required |
| --- | --- |
| Read-only reference calculations and presentation safeguards | Implemented locally; validation below |
| Historical backfill | Not performed; no eligible records identified; no approval requested |
| Immutable assessments, effective-date rules and pinned scheme/report capacity | Incomplete Phase A; approve precise additive persistence design and isolated integration work before activation |
| Persisted MPS/TPS target versions and verified identity/period assignment | Not implemented; database proposal and evidence required first |
| External arrears resolution, collection targets and exact 75/85 boundary policy | Supporting business evidence required; leave unresolved |
| Commit, Supabase changes, deployment | Not performed; separate explicit approval required |

## Validation history

Checks were run locally with mocked business database access. No database integration suite, migration runner or historical import was executed. The full suite excludes opt-in PostgreSQL integration and review-output experiments; a green application suite does not establish Phase A database integrity.

| Run | Result | Exit |
| --- | --- | --- |
| Initial targeted Production/Intelligence/Decision Support/permissions/scope regression | 19 suites, 185 tests passed | 0 |
| Earlier full run before three new live-engine tests | 53 suites, 409 passed, one skipped | 0 |
| Full run with overlapping validation processes | 51 suites passed, three failed; 408 tests passed, four failed, one skipped. Four five-second timeouts in existing CRM rendering and SMS sender tests | 1 |
| First single-worker full rerun, overlapping later checks | 51 suites passed, three failed; 409 tests passed, three failed, one skipped. Two existing CRM timeouts and an incorrect new slide-12 assertion | 1 |
| Interim targeted rerun | 184 passed, one failed: the same incorrect slide assertion. Corrected to slide 13 | 1 |
| Production build before the final historical-reference narrative wording change | Successful, dummy loopback database URL | 0 |
| Final full suite: `npm test -- --maxWorkers=1` | **54 suites passed; 412 tests passed, one skipped, zero failed**; original five-second time limits retained | **0** |
| Final production build: `npm run build` | Successful compilation, TypeScript and 12 static pages, using the dummy loopback database URL | **0** |
| Final lint: `npm run lint -- --no-cache` | Zero errors and zero warnings | **0** |
| Final standalone typecheck: `npx tsc --noEmit --incremental false` | Zero errors, after restoring the generated next-env file | **0** |

The slide assertion error was an implementation-test mistake, not a workbook discrepancy. It was corrected without changing the 14-slide structure. Test limits and unrelated CRM/SMS source were not changed to mask timeouts. Final results follow in `validation-summary.json` and the completion section below.

The one skipped test is an optional private SMS workbook fixture. Final regression duration was 156.67 seconds. Tests reproduce 252 original L/M/P/Q saved-value comparisons across 63 fully specified schemes and verify the unresolved 64th scheme. All Production, IAM, CRM, billing, receipt, reconciliation and offline suites discovered by the application configuration passed in that final run. Receipt and financial test writes use synthetic/mocked stores, not production records.

Full-run logs are retained locally under `.artifacts/phase-b-local-verification/`.

The final build reports the deprecated middleware convention, an unset metadataBase, a Turbopack project-wide file-tracing warning, and a `/maintenance` dynamic-headers diagnostic while considering static rendering. Build exit was 0 and `/maintenance` remains dynamic. These are recorded for release review, not hidden as a clean-warning build. Generated `next-env.d.ts` was restored byte-for-byte to the saved pre-build file (SHA-256 `083e23c4c5e7761db151134ea1ef7896120c86c5888cdc8a861f534f7e86d6fd`). `git diff --check` exited 0; Git printed LF/CRLF conversion notices only. HEAD remains `51d75cc1e1be87e02a7773a52a631751f30c9a53`.

No application source changed after the final full regression run began; subsequent changes were review documentation and restoration of generated next-env bytes. Final lint and typecheck ran after the final build and restoration. The local calculation layer is reviewable, but Phase A protection and full live original-target activation are not complete. Stop here for persistence-design approval; no historical data mutation is authorised or requested by this report.
