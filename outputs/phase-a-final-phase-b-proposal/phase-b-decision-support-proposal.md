# SWUWS Phase B: original MPS/TPS decision-support proposal

Status: **design only; no Phase B application code implemented**. Review date: 30 October 2026. Existing Production, Intelligence, Decision Support, NRW and the 14-slide Board Pack are preserved. No migration, historical import, production-data alteration, commit, push, merge or deployment is included.

Phase A application integration is incomplete; see [phase-a-completion-report.md](phase-a-completion-report.md). Original engineering evidence can be modeled and reviewed independently, but production adoption of historical-capacity comparisons must not assume that baseline pinning already works.

## Evidence and dependency register

The primary workbook is `C:/Users/MJ/Downloads/global target (1).xlsx`, SHA-256 `4965cef7c3c02428c8cf6a3af465c68ff2f3ccd56978182af2cbb44eccf6e622`. Its hash remains unchanged. Analysis uses the original formula-review register and a fresh read of the workbook, without saving or external-link refresh.

[mps-tps-dependency-register.md](mps-tps-dependency-register.md) summarizes every scheme. Its [JSON companion](mps-tps-dependency-register.json) records cells E:U for all **64** target rows, their saved values, explicit formula precedents, cross-sheet numeric-copy comparisons, aggregate formulas, six documented examples, all **106** external formulas and all **19** saved error cells. The earlier mapping register retains all **92 source/technology rows** and their scheme ownership/provenance.

The workbook's logical dependencies are not all live Excel links. Regional assessments, GLOBAL SUMMERY and most operational-area target values are connected by copied values and labels, with no internal cross-sheet formulas. The proposed engine must distinguish an explicit formula dependency from a numerically matching copied benchmark. No date, year, officer, approval or historical validity follows from a copy.

MPS and TPS function as historical/existing performance and intended target performance in this model. The workbook does not supply their full acronym expansions. Preserve these labels and confirm their formal business definitions before renaming them.

## Full calculation chain

### Engineering capacity and historical calibration

| Step | Original cell/formula | Dependency / unit / meaning |
|---|---|---|
| Gravity yield | KIGEZI!K2 `=I2/J2` | 15 litres /22.94 seconds → L/s. A field test input pair; measurement date not recorded. |
| Hourly conversion | KIGEZI!L2 `=K2*3.6` | L/s ×3.6 → m³/hour. Conversion factor is a unit conversion, not a management target. |
| Daily capacity | KIGEZI!M2 `=L2*24` | m³/hour ×24-hour assumption → m³/day. Regime assumptions remain explicit. |
| Mixed-source scheme | KIGEZI!M3 `=(L3*G3)+(L4*G4)` | Pump at14 h/day plus gravity at24 h/day; source-specific regimes and membership must be counted once. |
| Pumped bulk-meter assessment | RUJUMBURA!L4 `=(3600*10*0.01)/J4`, L8 `=(3600*10*0.1)/J8` | Timed dial-volume assumptions → m³/hour; preserve dial count and increment calibration separately. |
| Practical monthly benchmark | KIGEZI!N2 `=M2*30`; copied to GLOBAL SUMMERY!F3 / TARGETS GOLBAL!F5 | Fixed 30-day engineering capacity. It is not automatically calendar-month capacity. |
| Historical production | GLOBAL SUMMERY!G3/H3/I3; J3 `=I3+H3+G3` | July/August/September-labeled m³; September inputs are blank. Historical workbook observations are not workflow-verified live logs. |
| Historical daily mean | GLOBAL SUMMERY!K3 `=J3/60` | Combined production /two 30-day months → m³/day. Adding September later without revising the period convention would be inconsistent. |
| MPS utilisation calibration | GLOBAL SUMMERY!L3 `=K3/E3`; TARGETS GOLBAL!G5 stored copy | Historical production rate ÷ daily capacity; fraction. This copy is generally present but is not a formula link. |
| Historical sold volume | GLOBAL SUMMERY!M3/N3/O3; P3 `=M3+N3+O3` | Historical July/August/September sold m³. Missing readings are not observed zeroes. |
| Historical NRW | Q3 `(G3-M3)/G3`, R3 `(H3-N3)/H3`, S3 `(J3-P3)/J3` | Production-to-sales indicator, fraction. Retain signed raw results and denominator limitations. |
| Umbrella utilisation | GLOBAL SUMMERY!G72 `=G71/F71`, H72 `=H71/F71` | Ratio of matching total production to total capacity; not a mean or sum of scheme percentages. |
| Capacity-valued revenue | GLOBAL SUMMERY!F73 `=2118*F71` | Full monthly capacity valued at a single tariff; not actual billing or the complete differentiated scheme target forecast. |

### Target sheet, row 5 as the worked example

TARGETS GOLBAL has two header rows: row3 metric groups and row4 MPS/TPS labels. E/F are capacity benchmarks; G/H utilisation; I/J NRW; K/L production; M supply; N mains extension; O/P sales; Q billing; R arrears; S demand; T collection; U tariff.

| Field | Original input/formula | Meaning and qualification |
|---|---|---|
| E5 / F5 | Stored 56.49520488230165 /1,694.8561464690495 | Daily and fixed-month capacity benchmarks, copied from assessment/summary evidence. |
| G5 MPS utilisation | Stored 0.5044675925925927 | Generally copies historical two-month utilisation; fraction, not a 0–100 percentage. |
| H5 TPS utilisation | Stored 0.6044675925925926 | Management target input, not a formula. Across the workbook there are 51 observed +10 percentage-point uplifts, six +0.5-point, six +0.1-point and one missing target. Do not manufacture a universal target-setting rule from these patterns. |
| I5 MPS NRW | Stored 0.35 | Ryakarimira exception: differs from historical aggregate S3 ≈0.08245614. Preserve the explicit input as an unexplained override. |
| J5 TPS NRW | Stored 0.30 | Declared scheme NRW target. It is **not used** by the target-sales formula. Most other J values are five percentage points below I, but are stored inputs, not formulas. |
| K5 MPS production | Stored 1,500 | Exception: historical July G3 is810. Other K rows generally copy July production. Keep this benchmark exception separate from actual production. |
| L5 TPS production | `=H5*F5` | Utilisation target ×fixed-month capacity → target m³/month. |
| M5 target supply | `=L5-(5%*L5)` | 95% of target production. The 5% allowance is a fixed original planning assumption, not measured supplied water. |
| N5 mains extension | Blank | km/year target not provided. A total of blank cells does not establish a zero target. |
| O5 MPS sold volume | Stored823 | Copies August sold N3, while K generally uses July production. The MPS production/sales columns therefore do not establish a matched water-balance period. |
| P5 TPS sold volume | `=M5-(0.25*M5)` | 75% of target supply → target sales m³/month. Original chain implies `0.95×0.75=0.7125` sale fraction, or **28.75%** production-to-sales loss. |
| Q5 target billing | `=P5*U5` | Target sales ×tariff UGX/m³ → target UGX/month; U contains2118 or2990 per scheme. |
| R5 arrears | `=VLOOKUP([1]Arrears!B42,[2]Sheet1!$1:$1048576,7,FALSE)` | External lookup-key workbook plus external exact-match table, column7. Saved6,617,806 UGX is a historical cache, not current verified debt. |
| S5 total demand | `=R5+Q5` | Cached arrears plus forecast billing. Not collected cash, current-bill cash or a receipt total. |
| T5 collection efficiency | Blank | There is no calculable collection target/result from this workbook cell. Do not default to85%,0% or100%. |
| U5 tariff | Stored2118 | Dated/provenance-qualified planning tariff assumption, not permission to rewrite current customer tariffs. |

### Scheme → area → umbrella reporting

Operational-area sheets repeat the target rows mostly as stored values. Q/R/S retain billing, external lookup and demand formulas. Their copied values must remain tied to the workbook version; changing the global target sheet does not automatically change all area inputs.

TARGETS GOLBAL!F74/K74/L74/M74/O74/P74/Q74/R74/S74 sum capacities, benchmarks, targets, billing and arrears. The saved principal totals are:

- Capacity F74: **406,230.3519990392 m³/30-day benchmark month**.
- Target production L74: **259,201.72417681228 m³**.
- Target supply M74: **246,241.63796797162 m³**.
- Target sales P74: **184,681.22847597877 m³**.
- Target billing Q74: **436,435,193.0745685 UGX**.
- Cached arrears R74: **1,098,675,917 UGX**, unrefreshed external evidence.
- Demand S74: **1,535,111,110.0745683 UGX**, dependent on that external cache.

M77 `=(L74-M74)/L74` confirms the5% supply allowance. P77 `=(L74-P74)/L74` confirms28.75% production-to-sales loss, independent of the scheme-specific J targets. T74 and N74 are sums of blank collection/extension inputs and evaluate to0 without establishing actual data or approved targets.

P79 `=(Q74-287393820)/Q74` and P81 `=(L74-245640.1)/L74` compare target values with fixed historical amounts and divide by the **target**, not the old amount. Their saved results are34.14971465% and5.23207329%. Preserve those exact definitions for replay; do not silently call them conventional old-base growth rates. The fixed billing comparator's source is unresolved.

KABALE!L15 `(L12-P12)/L12` and L16 `=L12/F12` provide area target loss and utilisation. RUGAGA!G10:J10 instead SUM ratio columns, producing misleading aggregate percentages; approved operational aggregates should use matching sums of underlying quantities, while the original cells remain retained as evidence.

## Separate data meanings

The engine design must retain these categories, units and states explicitly:

| Category | Examples | Allowed use |
|---|---|---|
| Original engineering benchmark | Regional source observations, daily capacities, 30-day monthly figures | Reproduce original model; dated operational selection requires Phase A baseline identity and evidence. |
| Historical workbook observation | July/August production and sales | Undated-year benchmark context; never manufacture verified daily logs or live workflow approvals. |
| Management target / assumption | H/J target ratios, 5%/25% allowances, tariff, explicit K/I overrides | Planning calculations with version and approval provenance; not actual measurements. |
| Verified actual performance | Existing verified workflow-version-1 DATE-based logs; appropriately sourced sales/bills/payment allocations | Actual-versus-target comparisons only when identity, boundaries and reporting period match. Last inspected engineering tables are empty; do not substitute workbook observations to populate them. |
| External saved evidence | Arrears lookup caches | Replay evidence with freshness/verification qualification; no automatic current-debt assertion. |
| Missing / error / ambiguous | Blank T/N, Rushaga H, saved errors, unknown source dates, negative target NRW | Explicit unavailable/diagnostic state with the cause and dependency trail. Preserve genuine numeric zero independently. |

The original source-assessment date and reporting year remain unresolved. All 64 scheme/year and92 source/date associations remain unapproved; the prior full mapping register supplies exact candidate IDs and conflicts. No new mapping is approved in this proposal.

## Utilisation interpretation

| Range as printed in workbook | Workbook meaning | Current Decision Support matrix / Intelligence |
|---|---|---|
| <50% | Assets underused; high unit cost | Matrix Watch <75%; Intelligence emits underutilised below50% when produced>0 and day coverage≥50%. |
| 50–75% | Healthy; room for growth | Matrix Watch below75%; no matching healthy band in Intelligence. |
| 75–85% | Optimal; efficient asset use | Matrix Healthy75–95%. |
| 85–95% | Stressed; little buffer | Matrix still Healthy75–95%; Intelligence stress begins only above95%. |
| >95% | Critical; reliability concern | Matrix Stressed; Intelligence high-severity stressed, not workbook critical wording. |

Evidence: GLOBAL SUMMERY!D79:E83 and TARGETS GOLBAL!D87:E91 versus `lib/decision-support/performance-engine.ts:251–255`, `lib/intelligence/capacity.ts` and `attention-engine.ts`.

The printed adjacent intervals do not fully specify ownership of exactly75/85/95. Proposed convention for review: `<50`, `50≤u<75`, `75≤u<85`, `85≤u≤95`, `u>95`. This is a **proposal**, not an approved correction or a current code change. Tests must compare unrounded ratios at thresholds, then round presentation. Stress classification must remain distinct from exceeding a management utilisation target: exceeding a TPS percentage is not automatically good if reliability is critical.

## Fabricated and overconfident values: current-code comparison

| Current source | Finding | Proposed treatment after approval |
|---|---|---|
| `excel-fixture.ts:174–178` | Global cash and current-cash allocation are set to85% of estimated billing; global efficiency85%. The workbook has64 missing T inputs. | Remove invented actuals from reference-to-actual outputs. If a scenario requires85%, make it an explicit scenario assumption with approval; no default from this workbook. |
| `excel-fixture.ts:66,132,181` | Logged days are manufactured as full month for every scheme; completeness100%, including September's blank observations. | Missing observation coverage remains unknown. Historical monthly totals do not prove daily/source completeness. |
| `excel-fixture.ts:165` | Supplied water is set equal to produced water. | Retain actual supply as unavailable unless measured. The target M column is95% of forecast production, a different data meaning. |
| `excel-fixture.ts:161` | Reporting year2026 is hardcoded without a workbook year field. | Keep undated reference period labels; require evidence for a real reporting-year mapping. |
| `excel-reference.ts` numeric coercions | Missing inputs become0; six utilisation legend rows are called reference source rows. | Preserve states and row roles. Keep64 schemes,92 source/technology rows and explanatory legend separately. |
| `excel-fixture.ts` billing / per-scheme collections | Sold×reference tariff is presented as current billed; scheme cash uses T target×billing if present, while global uses85%. Below-target utilisation can be labelled “On Track.” | Distinguish replay forecast, historical estimate and actual bills/cash. Reconcile global/scheme metrics from matching inputs; target achievement status must not reverse the shortfall meaning. |
| Live `performance-engine.ts` financial queries | Cash is inferred from arrears+billAmount−totalDue, then allocated by balance arithmetic, rather than independently summed receipt/payment allocations. | This is **an inference**, not evidence of a fixed fabricated85%. Reconcile adjustments, credits, write-offs, reversals, cutoff and receipt allocations before describing it as fresh cash. Label the existing basis accurately until separately approved. |
| Live `reports.ts:46–51` | Sales, bills, cash, efficiency and arrears rows are marked VALID unconditionally; totalDue is labelled live arrears. | Add financial coverage/provenance and distinguish opening/remaining arrears, unpaid current charges and total demand. Do not treat missing records as validated zero. |
| Live `reporting.ts` / engines | Verified scheme-day coverage is real, but can be100% with only one of several sources observed. Global availability requires only one scheme; suppliedComplete ignores schemes without production. | Keep the observed-day metric, add source-roster coverage and prevent unsupported confidence. Do not relabel day coverage as full dataset completeness. |
| `intelligence/commercial.ts` |85% collection evidence baseline is a hardcoded rule reference, alongside other fixed thresholds. | Treat as an unverified policy default, not an actual observation or a workbook T target. Obtain policy approval/provenance before unifying rules. |
| `intelligence/engine.ts:281` | Passes all cash into the `cashToArrearsUgx` input. The current commercial evaluator does not use that field. | Retain the real split in a future adapter; document the latent semantic defect without claiming this unused input currently computes a recovery KPI. |
| Live target reads | Decision Support fetches scheme targets as a fourth Promise result but destructures only three results; Intelligence selects/evaluates only production and collection targets. | A future explicit target dataset must carry actual approved values and variances. Merely storing other target columns or claiming targets exist in slide4 is insufficient. |

No fabricated fixture value, live formula, threshold or label was changed in this work. The production-to-sales NRW equation remains the existing equation; changes to the Intelligence clamp/negative-loss diagnostics require their own reviewed acceptance tests, rather than being hidden inside target restoration.

## Proposed transparent calculation engine

This is a contract and workflow design, not runtime code.

### Inputs and provenance

Use one immutable workbook/reference version identified by hash and a separately selected approved operational target revision. Every input carries a stable metric key, scheme/source reference, optional real ID, value/state, unit, original fraction-versus-percent representation, formula/cell provenance, period label, confirmed year/effective dates if available, input meaning, approval/freshness and evidence qualifiers.

Sources of truth remain separate: engineering assessments and pinned capacity; original historical observations; target assumptions; verified production/supplied observations; sales/billing/payment evidence. Do not merge target and actual values in a single field or use an actual as fallback for a missing target.

### Evaluation and trace

1. Resolve identity, period/basis and required-data states before business calculation. No implicit name match, “latest active period” assignment for undated history, calendar substitution for a fixed30-day benchmark, or current-source fallback for historical capacity.
2. Use named, versioned calculation definitions and decimal arithmetic with explicit units. Preserve original formula text for provenance; do not execute arbitrary workbook formula text or external links in a live service.
3. Evaluate an inspectable dependency graph: selected monthly capacity → explicit H target → L production →95% supply →75% sales →scheme tariff→billing →qualified arrears→demand. I/J NRW targets remain separate declared measures; their disagreement with the derived loss is a visible diagnostic.
4. Each result returns value/unit, status, basis, dependency IDs, input states, calculation version and explanation. Missing/zero-denominator, saved error, stale/unverified external cache, period mismatch and conflicting assumptions remain distinct. Do not blanket-convert them to0 or clamp signed source evidence.
5. Retain an **original-as-written replay result** and a separate **management-usable result**. For Rushaga H27 is missing: Excel cached L/P/Q zeroes are preserved in replay evidence, but do not become a validated0 target in the management view. A cached external lookup can be displayed for historical replay without being certified as current debt.
6. Aggregate matching volumes and money, then calculate ratios. Never sum or mean scheme percentages without their quantity weighting. A total with missing members is explicitly partial/unavailable; present observed subtotals and coverage separately.
7. Apply approved classification and target-achievement policies separately from arithmetic. Retain policy/version identifiers so a threshold change does not silently rewrite an earlier report.
8. The eventual existing report adapters expose benchmark, target, verified actual, variance, basis, period and coverage. They must pin report inputs/cutoff and baseline versions. Keep the14-slide exporter and all existing workspaces; no replacement UI.

No storage implementation is mandated in Phase B's first step. A reviewed offline/reference calculation layer can operate on the evidence register before any database proposal. Production integration depends on the remaining prospective Phase A work and explicit target/policy approval. This avoids adding a migration just to store guessed historic years or approval states.

### Reproducible workbook examples

| Scheme / cells | Exact original chain to reproduce | Qualification |
|---|---|---|
| Ryakarimira, row5 | F=1694.8561464690495; H=0.6044675925925926 → L=1024.4856146469049 → M=973.2613339145596 → P=729.9460004359197 → ×2118 gives Q=1546025.6289232778 | J=30% differs from derived28.75%; MPS I/K overrides retained; no dated/live approval. |
| Katuna, row6 | F=5184.536891679749; H=0.9673351046918289 → L=5015.184536891679 → M=4764.425310047095 → P=3573.318982535321 → ×2990 gives Q=10684223.75778061 | Shows the0.1-percentage-point uplift and scheme-specific tariff; do not replace it with+10 points. |
| Migyera, row15 | H=0.8783028806584361 → L=3889.3412300683367 → M=3694.8741685649197 → P=2771.1556264236897 → Q=5869307.616765374 | Shows the0.5-point uplift. |
| Banyara, row23 | J=-0.002864746487856444; original chain P=3588.317437499999, Q=7600056.332624998 | Negative declared NRW remains a diagnostic; it does not replace P's fixed allowance formula. |
| Rushaga, row27 | F=3150; H missing; I/J saved errors; formula caches L/M/P/Q=0 | Preserve raw caches; management target chain unavailable. No manufactured H=0 approval. |
| Endiizi, row56 | J=-0.06724797145163341; L=2356.3, M=2238.485, P=1678.86375, Q=5019802.6125 | Retain signed original evidence and flag inconsistency; no automatic repair. |

These examples were independently checked as analysis arithmetic against workbook caches, not implemented as a Phase B application engine. Their original production year and assessment dates remain unknown. Decimal replay comparisons should use unit-specific tolerances against Excel's saved floating-point caches and round only for presentation or explicitly approved currency storage.

## Workbook errors and external dependencies

The full earlier formula-review register remains authoritative. Principal decision blockers:

- ISINGIRO!M10 mixes L10 m³/hour with K11 L/s in the daily sum. Preserve799.0857142857144 m³/day as original evidence; do not substitute a corrected value or propagate it through old targets without a separately approved revision.
- KIGEZI!I9/J9/K9/L9 for Noozi disagree; several other yields are rounded/stored constants and some fill times are reconstructed. Do not “repair” them by assuming every adjacent input was independently measured.
- Rushaga installed21 versus measured16.4 m³/hour and its missing H27 require explicit assessment/target decisions. Akashayi's second borehole lacks yield/regime; zero formulas do not establish a measured zero.
- ANKOLE!K16/K17/K20/K21 have four division errors. GLOBAL SUMMERY has eleven saved division errors; TARGETS GOLBAL!I27/J27 and the area copy have four saved error values. Total19.
- The106 external lookup formulas reference `Commercial  Reports FY 2025-2026_REMIS-UPMIS.xlsx` and `FINAL BILLING REPORT JUNE 2026 (1).xlsx`. Their files, keys, column7 meaning, uniqueness and freshness were not verified. There are53 target-sheet formulas and53 area repetitions. These filenames do not establish the workbook's production year.
- The separate TPS NRW targets and fixed sales chain disagree; K5/I5 override their apparent historical sources; source/summary rounding differs; aggregate percentage sums and target-denominator “improvements” need explicit definitions.

External caches, blanks, original formula defects and subsequent corrections need distinct evidence/version states. An approved correction must be append-only and reproducible; it must not overwrite the original workbook or masquerade as a verified measurement.

## Phased, non-destructive implementation plan

| Stage | Proposed scope after approval | Exit evidence / approval boundary |
|---|---|---|
| A remaining | Complete prospective assessment versions and report baseline pinning in existing services/UI; no historical import | Scoped writes, immutable history, measured/rated separation and replay tests. Database validation requires separately permitted disposable migration execution. No Supabase rollout implied. |
| B0 definitions | Sign off MPS/TPS meaning, period/basis conventions, source identities, target approval model, classification boundaries, allowance-versus-NRW conflict and collection numerator | Written decision register. Unknown facts stay unknown; no inferred dates. |
| B1 reference arithmetic | Implement a typed, traceable reference/target engine behind a non-production adapter | Golden examples, all64 scheme dependency/state checks, original/usable result distinction, errors/external caches preserved. No actual-production import. |
| B2 validated targets/policy | Add explicitly approved target revisions and classification policy to that engine | Current-versus-original comparison; boundary tests; no universal invented uplift or collection target. Preserve existing behavior until deliberate policy activation. |
| B3 existing dataset adapters | Integrate approved target/benchmark outputs with verified actual data in current Intelligence/Decision Support services | Matching identity/period/unit/roster; permissions; missing-versus-zero; no fallback to fixture observations. Preserve live NRW formula until a separately approved diagnostic change. |
| B4 existing reports | Feed original benchmark/target/actual/variance/provenance into current monthly, capacity, loss and commercial reports and existing14-slide Board Pack | Golden report tables and all slide parts; no extra production workspace; report revision/baseline IDs pinned. |
| B5 fixture and data-quality cleanup | Replace fabricated reference actuals with explicit missing states or labelled approved scenarios; address finance inferences and quality labels | Old fixture changes reviewed as intentional; receipt reconciliation and reporting confidence supported; regressions documented. |
| Later deployment | Review local diffs, any proposed schema change, rollout/rollback and actual dataset readiness | Separate authorization. No commit/push/merge/deploy or Supabase migration is authorized by this proposal. |

### Proposed test matrix

| ID | Case | Required outcome |
|---|---|---|
| B01 | Gravity15/22.94 and dial-volume examples | Correct units/precision;30-day benchmark remains distinct from calendar capacity. |
| B02 | Katuna/Rwene/Kitojo multi-source assessment | Each source counted once; aggregate hourly cells not duplicated; source regimes retained. |
| B03 | Ryakarimira target chain | Exact documented L/M/P/Q within tolerances; I/K overrides visible. |
| B04 | Katuna and Migyera uplifts | Explicit0.1/0.5-point targets retained, no hardcoded+10-point rule. |
| B05 | Fixed5% then25% allowances | Derived loss28.75%; changing J alone does not change original-as-written P. |
| B06 | Missing H27 | Raw Excel zero cache retained separately; usable production/sales/billing target unavailable. |
| B07 | Missing/zero/error inputs | Distinct statuses; valid zero retained; no `value || default` replacement. |
| B08 | External arrears unavailable/stale/duplicate key | Billing target can stand alone; demand remains qualified/unavailable; no0-debt invention. |
| B09 |2118/2990 tariff mix | Billing sums per-scheme products, not a global default tariff; missing tariff propagates. |
| B10 | Signed Banyara/Endiizi evidence | Negative raw values retained and flagged; no silent clamp/target repair. |
| B11 |50/75/85/95 thresholds and nearby values | Approved endpoint convention on unrounded values; arithmetic and policy versions separate. |
| B12 | Target achievement versus stress | Target exceeded is not automatically healthy; shortfall not labelled “On Track.” |
| B13 | July/August/September/year | No convenient2026 mapping; September blank; differing MPS periods explicitly identified. |
| B14 | Scheme/area/umbrella aggregation | Ratio of sums; completeness preserved; no sum of ratios or subtotal double-counting. |
| B15 | M77/P77/P79/P81 | Original allowance and target-denominator improvement definitions reproduced and labelled. |
| B16 | Collection T blank | No85%/0% default actual or target; total demand never presented as cash. |
| B17 | Current cash/arrears splits, credits/write-offs/reversals | Monetary comparisons use declared numerator, denominator and cutoff; current payments not arrears recovery. |
| B18 | Source-day coverage | One of several sources logged daily cannot establish full-source completeness; absent sales/finance do not become VALID. |
| B19 | Verified/provisional/legacy logs | Existing eligibility unchanged; workbook figures never become actual logs by reference import. |
| B20 | Later assessment/edit/archive | Earlier report baseline and input cutoff remain pinned; explicit revision needed to reissue. |
| B21 | Identity/hierarchy/combined schemes |54 candidates not treated as approved;2 conflicts/8 unmatched stay unresolved; no combined-capacity duplication. |
| B22 | Source/assessment/target IAM scopes | Cross-scheme/tenant access denied; independent verification preserved; planning/reference access does not grant writes. |
| B23 | Management reports/Board Pack | Existing entry points and14 slides retained; complete provenance/availability; compare every package part and key table. |
| B24 | Reference fixture replacement | No fabricated cash, supply, year or coverage; scenarios isolated from actual dashboards; updated expectations reviewed. |
| B25 | Idempotency/audit failure/concurrency | Atomic assessment/target writes and audit; retry identity preserved; immutable earlier versions. |
| B26 | Original workbook preservation | Hash unchanged; original errors/caches/input overrides retained; no external refresh or history overwrite. |

## Decisions required before implementation

1. Approve the remaining **prospective** Phase A integration scope and its validation boundary. No historical backfill is included.
2. Confirm formal MPS/TPS definitions and approve original-as-written replay as distinct from management-usable calculations.
3. Decide whether a future live planning chain retains the5%/25% allowances, uses scheme-specific J NRW in a separately revised model, or supports both as explicitly named approved alternatives. Do not silently connect J to P.
4. Approve utilisation endpoint ownership and interpretation across Intelligence, matrix, attention and reports.
5. Confirm the collection metric numerator/denominator/cutoff and how unknown T inputs remain unavailable. An85% target needs independent policy evidence, not the workbook.
6. Confirm any intended correction of specific original errors, dated external arrears evidence and historical identity/period assignments separately. Until then preserve original evidence and uncertainty.

The present continuation does not implement any of these decisions. Wait for approval before prospective Phase A integration or Phase B implementation, and for separate authorization before any database migration or historical/production data mutation.
