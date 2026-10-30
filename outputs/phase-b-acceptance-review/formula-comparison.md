# Implemented calculation and workbook comparison

Read-only acceptance review. No source, workbook or database values were changed. `workbook-and-design-evidence.json` contains the original formulas, inputs, units, local results and differences for every operational target row. `workbook-verification.json` records normalized whole-workbook agreement and the numerical replay totals.

## Scope that is actually implemented

`lib/decision-support/mps-tps.ts` is a downstream target calculator. `excel-reference.ts` reads the original F/G/H/I/J/K/O/R/T/U inputs, preserves source cells and missing/error/external states, then calls that calculator. It does not automatically calculate a new management policy for H, rederive original source engineering, approve targets, assign an effective year, or persist target versions.

G, I, J, K and O remain independent historical reference inputs. The software correctly does not force K/F to equal G, make July K and August O into one verified reporting period, or replace the original K5 = 1,500 with July's 810. `AVAILABLE` in the reference model means mathematically usable historical evidence; it does not mean verified operational data or an approved live target.

## Every implemented business calculation

All row references `r` below mean the matching operational scheme row in TARGETS GOLBAL. Blank separator rows and totals are not operational schemes.

| Workbook reference | Required inputs and calculation | Output unit | Software location | Actual verification |
| --- | --- | --- | --- | --- |
| `Lr=Hr*Fr` | Explicit original TPS utilisation H and fixed-month engineering benchmark F | m3/target-month | `lib/decision-support/mps-tps.ts:53` | 63 original L values agree exactly; missing H27 propagates unresolved |
| `Mr=Lr-(5%*Lr)` | Calculated L; original literal 5% target assumption | m3/target-month | `mps-tps.ts:54` | 63 M values agree exactly; no supplied-water actual inferred |
| `Pr=Mr-(0.25*Mr)` | Calculated M; original literal 25% supply-to-sales assumption | m3/target-month | `mps-tps.ts:55` | 63 P values agree exactly; original J deliberately not substituted |
| `Qr=Pr*Ur` | P and the scheme's original tariff U, including 2,118 and 2,990 regimes | UGX/target-month | `mps-tps.ts:56` | 63 Q values agree exactly; analytical targets only, no bill posting |
| `Sr=Rr+Qr` | Mathematically usable original R and computed Q. External or absent R blocks S | UGX | `mps-tps.ts:57` | S26, S68 and S69 agree exactly; all three have explicit original R = 0. Other 61 operational S results unresolved. Existing synthetic-zero and external-dependency tests pass |
| Diagnostic derived from `Lr` and `Mr` | `(L-M)/L`; requires a nonzero L | fraction | `mps-tps.ts:58` | Ryakarimira gives 0.05; zero denominator remains unresolved. This is a diagnostic derived from the original formulas, not a new workbook cell |
| Diagnostic derived from `Lr` and `Pr` | `(L-P)/L`; requires a nonzero L | fraction | `mps-tps.ts:59` | Ryakarimira gives 0.2875. Difference from original J=0.30 is exposed, not corrected |
| Aggregate concept: e.g. original target totals L74/M74/P74/Q74 | Sum of supplied stateful metrics only if every member is available; empty or incomplete population stays unresolved | Input unit | `mps-tps.ts:67`, `sumEngineeringMetrics` | Pure sum/missing/zero/empty tests pass. This helper is not wired as a claim that original workbook totals or hierarchy rollups have been reimplemented |
| `GLOBAL SUMMERY!Lr`, plus monthly production/capacity ratios | Actual recorded production / selected capacity ×100; reference monthly observations use original fixed-month capacity. Original combined-period L uses `(J/60)/E`, not July alone | percent | `data-validation.ts`, `performance-engine.ts`, `excel-fixture.ts`; `intelligence/capacity.ts` | Existing ratio tests pass. Original G inputs are read, not recalculated from the live calendar. Current configuration still changes past denominators: acceptance failure |
| `GLOBAL SUMMERY!Q/R/S` production-to-sales ratio | `(produced-sold)/produced` ×100, displayed to one decimal; missing sales and zero denominator are unavailable; negative result preserved | percent | `data-validation.ts`, `intelligence/nrw.ts` | 100 produced /110 sold gives -10%, DATA_INCONSISTENCY and a data-quality finding. Existing missing-sales tests and fresh acceptance controls pass |
| Difference supporting the same ratio | `produced-sold`, preserving sign | m3 | `data-validation.ts`, `intelligence/nrw.ts` | Negative discrepancy regression passes; no clamping to a fabricated zero loss |
| Original fractions G/H/I/J/T | Multiply usable stored fraction by 100 when exposing legacy percentage fields | percent | `excel-reference.ts:171` and following fields | Inputs retain source states; all 64 collection inputs T are missing and are not replaced by 85% |
| `GLOBAL SUMMERY!D79:E83` printed utilisation ranges | <50 underused; 50–75 healthy; 75–85 optimal; 85–95 stressed; >95 critical. Exactly 75/85 deliberately boundary-review | category | `mps-tps.ts:74`, shared consumers | Twelve helper boundary tests and stress/critical tests pass. Intelligence underused finding still checks a rounded value: 49.999% fails the new consistency probe |
| No original workbook coverage formula | Recorded scheme-days / expected scheme-days ×100, capped 100. This is day coverage, not measured all-source completeness | percent | `data-validation.ts`; existing `production/reporting.ts` | Unknown historical coverage is flagged, not fabricated 100%. Domain-specific completeness and attention gating remain incomplete |
| Existing `scheme_target` period selection; not workbook target assignment | Sum stored targetProductionM 3 only if target-row coverage matches scoped schemes | m3/reporting period | `performance-engine.ts:302`, `:361` | Existing period-target and missing-target tests pass. Explicit zero is retained. A synthetic persisted `NaN` target reaches the KPI: fresh acceptance failure |
| Existing balance-inference queries; not a verified workbook cash formula | Inferred cash = current allocation estimate + arrears allocation estimate; efficiency = inferred cash/current billed ×100, rounded 1dp | UGX, percent | `performance-engine.ts` commercial query and aggregate; `intelligence/commercial.ts` | Inferred 20 against billed 100 remains an estimate; verified report cash/efficiency is unresolved. Fresh controls pass. This is not receipt reconciliation |

The reference reader rejects direct Excel error cells, external formulas and nonfinite inputs before using them in the target calculator (`excel-reference.ts:57`, `:60`; `mps-tps.ts:12`, `:17`). It does not refresh external links. It is not an arbitrary Excel formula evaluator. Raw saved Rushaga zeroes are retained as provenance even though L/M/P/Q are unresolved locally.

The unchanged live balance-inference arithmetic is applied per billing record before aggregation: let A=stored arrears, B=current bill and D=total due. X=max(0,A+B−D); inferred arrears allocation=min(max(0,A),X); inferred current allocation=min(B,max(0,X−inferred arrears allocation)). Their sums form estimated cash. Collection efficiency divides that estimate by current billed demand, not by verified receipts; arrears recovery divides the inferred arrears allocation by arrears billed. Zero denominators still have compatibility numeric zeroes, but verified collection displays are explicitly unavailable. These calculations are retained estimates, not newly verified workbook collection formulas. Actual receipt/allocation reconciliation remains separate work.

## Traceable numerical examples

### Ryakarimira, TARGETS GOLBAL row 5

| Cell | Original evidence / operation | Excel saved result | Local engine |
| --- | --- | ---: | ---: |
| F5 | Historical fixed-month capacity input | 1694.8561464690495 | 1694.8561464690495 |
| H5 | Explicit TPS utilisation fraction | 0.6044675925925926 | 0.6044675925925926 |
| L5 | H5×F5 | 1024.4856146469049 | 1024.4856146469049 |
| M5 | L5−0.05L5 | 973.2613339145596 | 973.2613339145596 |
| P5 | M5−0.25M5 | 729.9460004359197 | 729.9460004359197 |
| U5 | Original tariff, UGX/m3 | 2118 | 2118 |
| Q5 | P5×U5 | 1546025.6289232778 | 1546025.6289232778 |
| R5 | External VLOOKUP cache | 6617806 | Unresolved external; cache retained |
| S5 | R5+Q5 | Original cache retained in model | Unresolved dependency |

The upstream original engineering evidence is KIGEZI!I2=15 litres, J2=22.94 seconds, K2=I2/J2=0.6538796861377506 L/s, L2=K2×3.6=2.353966870095902 m3/h, M2=L2×24=56.49520488230165 m3/day and N2=M2×30=1694.8561464690495 m3/benchmark-month. That last number is copied into GLOBAL SUMMERY!F3 and TARGETS GOLBAL!F5; the copied values are not date-bearing relational links.

GLOBAL SUMMERY!G3=810 and H3=900, with September I3 absent. J3's saved sum is 1710; K3=1710/60=28.5 m3/day; L3=28.5/56.49520488230165=0.5044675925925927. TARGETS GOLBAL!G5 stores that fraction, while K5 is a separate 1,500 management benchmark override. July sales M3=746, August N3=823; original combined NRW S3=(1710−1569)/1710=0.0824561403508772. Target I5=0.35 and J5=0.30 are different original planning inputs. They were not silently replaced by historical ratios.

### Katuna, TARGETS GOLBAL row 6

The mixed-source original capacity is KIGEZI!M3=(7.5 m3/h×14 h)+(2.8257456828885403 m3/h×24 h)=172.81789638932497 m3/day; N3=M3×30=5184.536891679749 m3/benchmark-month. With original H6=0.9673351046918289 and tariff U6=2990, Excel and local calculations agree: L6=5015.184536891679; M6=4764.425310047095; P6=3573.318982535321; Q6=10684223.75778061 UGX. R6 remains external and S6 unresolved.

### Habutobere, Kazinga and Kisenyi demand

R26, R68 and R69 contain explicit historical numeric zeroes, not blank cells or external formulas. The local engine therefore reproduces S26=1405703.3624999998, S68=2895179.6249999995 and S69=1252099.8750000002 UGX. These are historical target-demand calculations, not verified present-day arrears, revenue or receipts. The global reference fixture correctly keeps live arrears availability false.

### Rushaga, TARGETS GOLBAL row 27

F27=3150 m3/benchmark-month, H27 missing, I27/J27 saved #DIV/0!. Excel saved L27/M27/P27/Q27 are zero. The local model retains those original saved zeroes but reports all four calculations unavailable because the required H27 is missing. No TPS utilisation, collection efficiency or effective year is invented.

## Existing source assessment functions retained, not completed by Phase B

The current source writer at `lib/production/service.ts:181` implements bucket hourly yield `(litres/seconds)*3.6`, or accepts `measured_hourly` through the legacy installed-capacity field, then multiplies by supplied regime hours for daily capacity. It resets current stored monthly capacity to null. The existing source schema permits unknown, measured_hourly and bucket_test; it does not reconstruct the original bulk-meter dial test or independently distinguish installed rating from measured yield in new immutable assessments.

RUJUMBURA!L4=(3600×10×0.01)/37.5=9.6 m3/h and L8=(3600×10×0.1)/309=11.650485436893204 m3/h remain original engineering examples, not new live dial-test features. KIGEZI!M31 uses installed 21×5=105 m3/day despite separately stored measured 16.4 m3/h; ISINGIRO!M10 retains its original mixed-unit K11 reference and saved 799.0857142857144 result. No correction or import was performed. The prior 35-check PostgreSQL proof exercised synthetic examples; it does not establish these as implemented immutable application assessments.

JavaScript numbers are used for analytical target replay. The original 255 available L/M/P/Q/S results agree with saved values with maximum absolute difference 0 in this workbook. This is not independent Excel recalculation, financial rounding approval, effective-period evidence or live database validation.
