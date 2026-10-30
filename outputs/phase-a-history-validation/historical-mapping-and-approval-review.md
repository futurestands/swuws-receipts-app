# SWUWS Phase A: historical mapping and approval review

Review date: 30 October 2026. Git HEAD remains `51d75cc1e1be87e02a7773a52a631751f30c9a53`.

**There are currently no verified, dated historical database mappings eligible for backfill.** The configured business database contains no source rows, production logs, stored scheme mappings, source-capacity audit events or generated report-history rows. The workbook contains substantial engineering evidence, but no assessment date, responsible officer or production reporting year was found. Those gaps cannot be filled from existing billing-period labels.

This finding supersedes the previous proposal's request to initialize snapshots of existing sources. Against the database actually inspected, that initialization would insert **zero records**. Loading the workbook would be a new evidence import/source-registration exercise, not a backfill of existing source records. No such import, registration or historical mutation is authorized or performed here.

## What has actually been implemented

| Item | Actual state |
|---|---|
| Phase A application/schema integration | **Not implemented.** No changes to source services, Drizzle mappings, dashboards, production forms, report consumers or calculation rules. |
| Registered Phase A migration | **None.** Nothing added to `db/migrations/`, its ledger or runner. Existing migrations 0069–0072 predate this Phase A work. |
| Prior schema preparation | `outputs/phase-a-baseline-proposal/schema-draft.sql`: three proposed immutable tables, constraints, functions and triggers. Tested only in disposable PostgreSQL. |
| Prior snapshot preparation | `outputs/phase-a-baseline-proposal/legacy-capture-draft.sql`: verbatim source/version snapshot proposal. No business execution. It cannot populate absent sources or establish historical periods. |
| Prior validation | `validate-draft.mjs`, `isolated-proof-results.json`, `phase-a-proposal-and-safety-proof.md`: 35 synthetic checks and a proposal. These five prior artifacts were retained unchanged. |
| This continuation | Read-only engineering inventory, full workbook mapping registers, eight mapping-evidence tests, thirteen output-invariance tests, exact before/after results and this approval review. |
| Historical database changes | **None.** No backfills, imported workbook records, source creation, inferred dates, report reissues or calculation corrections. |

The earlier source-assessment, utilisation, target-chain and fixture issues remain in the application. Preparation and a successful unused-table proof must not be described as a completed baseline-preservation feature.

## Business evidence inspected without mutation

The configured `DATABASE_URL` / local `.env` connection was inspected using a repeatable-read, explicitly READ ONLY transaction. The client also sets `default_transaction_read_only=on` before connecting. Only engineering, hierarchy, reporting-period, mapping and migration metadata were read. No migration runner or application mutation action was invoked. Credentials and customer/financial data were not exported.

Inventory captured at **2026-10-30 12:38:04 UTC**. A separate read-only visibility check confirmed the configured role can bypass row-level security; the engineering tables' zero counts are not explained by RLS hiding their rows. Findings apply to this configured database at capture time, not every possible deployment or an unprovided external archive.

| Existing table/evidence | Exact observed count | Historical implication |
|---|---:|---|
| `water_scheme` | 64 | Real scheme identities can be proposed for review, but no source identity follows automatically. |
| `branch` / `cluster` | 11 / 4 | Supports hierarchy comparison with the workbook's ten operational areas/four source-assessment sheets. |
| `water_scheme_source` | **0** | No existing source values, confirmation dates, methodologies or officers are available for legacy snapshot initialization. |
| `water_production_log` | **0** | No verified, unverified or legacy production observations exist in this table to associate with a capacity baseline. |
| `decision_support_scheme_mapping` | **0** | No persisted identity approval exists. A name match is a candidate, not an approved mapping. |
| `report_generation_history` | **0** | No retained report-capacity denominator, baseline ID or report-period selection is available here. |
| Source-related `audit_log` entries | **0** | No earlier source-capacity before/after state can be recovered from this audit category. |
| `billing_period` | 8 | Contains one July 2026 period, six August 2026 records and one September 2026 period. These do not prove the workbook's year or assessment validity. |

The migration ledger records 0069, 0070, 0071 and 0072 as applied. Their expected source/log columns are visible. This is a read-only applied-ledger observation; this review did not execute or reinstall those migrations, and ledger presence alone is not a complete trigger certification.

[business-inventory-summary.json](business-inventory-summary.json) preserves the permitted inventory, exact billing-period IDs and recorded migration names. Full engineering-only query results remain in ignored `.artifacts/phase-a-history-review/`, without credentials. No table was populated or changed by these reads.

### Existing periods must not become guessed workbook periods

| Database period ID | Existing label / status | Proposed workbook assignment |
|---|---|---|
| `4da961ac-2328-4750-842e-eba6cbe6b353` | July 2026, closed | None; workbook July has no proven year. |
| `195533ad-90bc-4842-9376-912c29d3c5e8` | August 2026, archived | None. |
| `7f50d059-b251-46b4-b10d-65775b73fd34` | August 2026, archived | None. |
| `a737fc81-4955-42c6-afc8-8ed65662ee8d` | August 2026, archived | None. |
| `b6884aeb-6584-46f9-bfe1-27076e78ae9c` | August 2026, archived | None. |
| `dd8112f3-808f-46f8-856a-5b8d20c67d93` | August 2026, closed | None; closed status does not establish workbook linkage. |
| `ef944f69-df96-4430-8ad8-27f613e0ff51` | August 2026, archived | None. |
| `954e798e-5f58-4ce4-9e39-1782f8ea0bce` | September 2026, active | None; workbook September observations are blank. |

No year is inferred from filenames, external workbook titles, document properties, file timestamps, current settings, fixture defaults, billing-period availability or collection-window dates.

## Exact workbook evidence requiring preservation

Primary source: `C:/Users/MJ/Downloads/global target (1).xlsx`. SHA-256 remains `4965cef7c3c02428c8cf6a3af465c68ff2f3ccd56978182af2cbb44eccf6e622`, matching the original audit. The workbook was reread without recalculation, saving or link refresh.

| Evidence population | Exact population | What is confirmed | What remains unknown |
|---|---:|---|---|
| Regional scheme assessment groups | 64 | Sheet/cell identity, source-row grouping, stored daily/monthly figures, explicit `*30` monthly formulas | Assessment date, effective period, officer and approved live identity/source roster |
| Source/technology rows | 92 | Original names/labels, row membership, raw observations, installed fields, yields, formulas and qualifications | Whether all rows are distinct physical assets, unnamed-eye identity, actual measurement dates, officer and live source IDs |
| July comparison rows | 64 | 61 nonblank production cells, 62 nonblank sales cells, explicit comparison against workbook capacity | Reporting year; no confirmation that capacity assessment was valid throughout that July |
| August comparison rows | 64 | 63 nonblank production cells, 63 nonblank sales cells, explicit comparison against workbook capacity | Reporting year and effective assessment period |
| September comparison rows | 64 | All production and sales input cells are blank | No observations; no zero-volume result and no dated assignment |

These are **192 scheme/month-label relationships**, not 192 confirmed calendar-period baselines. The July/August rows establish how the workbook compared numbers; they do not establish when a field assessment was performed or prove its temporal validity. Genuine entered zeroes are retained separately from blank inputs.

The 92 rows are not claimed to be 92 independently verified physical sources. Continuation rows and source eyes can lack names, and physical identity/shared-source topology requires engineering evidence. Row identifiers therefore use workbook hash, worksheet and row, not fabricated database IDs or assumptions based on scheme numbering.

### Methodology evidence

METHODOLOGY!C5:C8 documents known-volume/timed gravity measurements and the L/s to m³/h conversion. C11:C13 documents pumped bulk-meter dial timing, confirmatory volumetric tests, average operating hours and pump capacities. No assessment-date or responsible-officer field appears in these instructions or the source-sheet headers. A fresh read found no date-typed workbook cells.

The source register classifies the *available formula evidence*, without claiming a field method has been independently verified:

| Formula evidence category | Source rows |
|---|---:|
| Volumetric timing from recorded container/time inputs | 47 |
| Recorded yield/capacity with method unconfirmed | 18 |
| Fill time back-calculated from a recorded yield | 7 |
| Installed rating selected with operating regime | 15 |
| Bulk-meter timing with explicit dial constants | 5 |

All assessment dates, effective dates and original responsible-officer IDs remain NULL in the mapping proposal. Method errors or ambiguous units are flagged; they are not repaired. All 106 external-reference formulas and 19 saved error cells remain untouched.

## Proposed source → scheme → baseline → reporting-period mapping

The exhaustive human-readable [historical-mapping-register.md](historical-mapping-register.md) lists **every one of the 64 scheme relationships and 92 source rows**, including exact proposed live scheme candidates. Its [JSON companion](historical-mapping-register.json) additionally enumerates every one of the 192 period-label relationships, raw cells, formulas, capacities, qualification flags and explicitly NULL date/period/source-ID fields.

The proposed chain is:

`workbook hash + source worksheet/row → workbook scheme assessment group → undated as-written daily/monthly benchmark → explicit July/August/September comparison label → calendar period unresolved`

There is no chain from this evidence to an existing registered source or verified production record, because those tables are empty. The draft schema's source foreign key correctly rejects an assessment for a nonexistent source. Creating a source merely to satisfy that foreign key would be an additional, reviewable registration operation, not safe automatic backfill.

### Representative exact relationships

| Workbook source/group | Recorded capacity and method | Live scheme relationship | Assessment baseline / period proposal |
|---|---|---|---|
| KIGEZI!row2, Nyamabare → D2 Ryakarimira | I2/J2 = 15/22.94 L/s; L2 ×24 = 56.49520488230165 m³/day; N2 = 1,694.8561464690495 m³/30-day benchmark | Candidate `2ffe2035-234d-4810-89a3-c889e78cc21e`, RYAKARIMIRA/KABALE. No source record or stored approval. | Preserve row2 as undated workbook evidence. GLOBAL SUMMERY!row3 July/August comparisons confirmed as written; year, effective date and billing-period ID remain NULL. |
| KIGEZI!rows3–4, Mayengo + Nyakatare → Katuna | Installed pump 7.5 m³/h ×14 plus gravity `(15/19.11)*3.6` ×24; M3 = 172.81789638932497 m³/day; N3 = 5,184.536891679749 m³/30-day benchmark | Candidate `00eab97e-c580-492d-b6c9-bc7a96c7c2cf`, KATUNA/KABALE. Both live source IDs absent. | Preserve two source rows and the one scheme total; do not load the scheme total twice. No dated association. |
| KIGEZI!row12, Nyabishakyi → Karukara | 174.8987854251012 m³/day; 5,246.963562753036 m³/month | No exact scheme match. Investigation-only candidate KARUKARA- HAMURWA `c1bbf563-2ed1-4b7f-b2b9-aab73f34666e`. | No approved identity. Never associate with Karenga-Myambi. Date/period unresolved. |
| RUJUMBURA!row16, Omuribiri → Mayanga | Bulk-meter timing; 60 m³/day, 1,800 m³/month | Same-name candidate `c42d886f-f802-43b2-a56f-7fe1dfbe4010` is KABALE; workbook area is RUKUNGIRI. | Hierarchy conflict; retain workbook hierarchy and current database unchanged. |
| RUJUMBURA!rows24–25, Karagwe borehole + Ngorogoro spring → Itojo | 540.5607476635514 m³/day; 16,216.822429906542 m³/month | Candidate `90b741ba-60f2-45b1-9729-ff04676fbb2d` is RUKUNGIRI; workbook area is NTUNGAMO. | Hierarchy conflict; no baseline-period assignment. |
| ISINGIRO!rows2–3, Kabibi + Kyakabindi → Isingiro T/C & Kyakabindi | 630 m³/day, 18,900 m³/month; one combined workbook scheme | No single exact live match. Candidates ISINGIRO T/C `9f901e2d-2d8b-4edd-b1a4-c6d1b1a36b7f` and KYAKABINDI-KAHIRIMBI `cf65df05-98a4-4902-b65f-1a61fc76f808`. | Do not divide, duplicate or assign the combined capacity to either entity without physical and operational evidence. |
| ISINGIRO!rows10–11, Nyaminyonga + Katojo → Rugaga | As-written M10 = 799.0857142857144 m³/day, N10 = 23,972.57142857143 m³/month; second term has the documented K11/L11 unit conflict | Candidate `041a0904-9eeb-420e-ac6b-cb73ae09ce9e`, RUGAGA/RUGAAGA spelling candidate. No source IDs. | Retain original figure and formula qualification. Any engineering correction is a separate revision, never an automatic replacement. |
| ANKOLE!rows18–19, borehole I + II → Akashayi | Row18 43.2 m³/day, 1,296 m³/month; row19 missing yield and regime produces zero formulas | Candidate `b0f586b7-0ee6-4dbf-9846-65997b595e74`, AKASHAYI/IBANDA | Second-source capacity remains unknown. Formula zero is not an observed zero or a complete assessment. |

### Scheme identity review, not automatic approval

- **54** unique case-insensitive scheme-name candidates have coherent workbook/live hierarchy, including the explicit combined-area and RUGAGA/RUGAAGA interpretation. Their IDs are enumerated in the register. All remain candidates because no stored approval exists and no registered source/date evidence supports a historical capacity assignment.
- **2** hierarchy conflicts: Mayanga and Itojo, above.
- **8** unmatched workbook names, with investigation-only suggestions:

| Workbook scheme | Investigation-only live candidate | Outcome |
|---|---|---|
| Karukara | KARUKARA- HAMURWA | Requires identity/service-area evidence; no approved link. |
| Rushaga | None identified | Remains unmatched. |
| Kakigani | None identified | Remains unmatched; KABINGO must not be substituted merely because it is otherwise unmatched. |
| Isingiro T/C & Kyakabindi | Two separate schemes, listed above | Requires combined/split topology reconciliation. |
| Rwentango | RWENTAGO | Spelling candidate only. |
| Matsyoro | MASTYORO | Spelling candidate only. |
| Kanyarugiri | KANYARUGYIRI | Spelling candidate only. |
| Kisenyi | KISHENYI | Spelling candidate only. |

No scheme, source, branch or approval record was created or updated. The previous exact-name matcher’s hardcoded exclusions were not changed.

## Records that must remain unresolved or unchanged

1. **All 92 source effective dates and original assessing officers:** no supporting field-assessment records exist in the inspected database or workbook date fields.
2. **All 64 historical scheme validity periods:** exact capacity figures are available, but a dated source inventory, selected denominator or original report issue is not.
3. **All 128 July/August calendar-period assignments:** workbook labels have no proven year; matching 2026 database labels is insufficient. Six August records further require explicit period identity, not a first/closed-record shortcut.
4. **All 64 September observation relationships:** retain blanks; no observation or dated backfill is established.
5. **The ten scheme identity cases needing investigation and all source registrations:** named physical-source identity, combined-service areas and operational hierarchy require responsible approval.
6. **Workbook exceptions:** Noozi inconsistent yield inputs, Rugaga mixed units, Rushaga measured-versus-installed selection, unnamed source eyes, Akashayi second borehole, reversed fill-time derivations, rounding differences and saved errors retain the original evidence and issue flags.
7. **Existing MPS/TPS values, utilisation classifications, NRW and collection fixtures:** all remain as implemented and as recorded in the original audit. No verified correction was applied in this validation phase.

## Disposable PostgreSQL migration/backfill demonstration

The previous cluster was restarted only on **127.0.0.1:55473**, database **swuws_phase_a_production_test**, PostgreSQL **17.10**. Tests used fresh random schemas, preserving the prior proof namespaces and local work. The server is stopped after validation. No business connection was used by the test code: its application DB import is mocked and its test target is hardcoded loopback with no dotenv/business fallback.

Two cases were exercised by [outputs-invariance.test.ts](outputs-invariance.test.ts):

1. **Empty engineering state, matching the relevant business inventory.** Synthetic schemes/period exist but no sources/logs exist. The schema draft and the proposed capture run inside a disposable transaction. Capture inserts **0 assessments**; every existing application output is unchanged; the DDL transaction is rolled back.
2. **Populated engineering state, explicitly synthetic.** Three synthetic source rows model the Ryakarimira and Katuna calculation examples. Synthetic dates, confirmation officers, 93 verified source-day records, a legacy log, sales and bills make nonempty reports testable. These are **test fixtures, not discovered historical facts**. The schema draft is applied in a fresh namespace, then three exact-copy snapshots are inserted there. Original business-shaped fixture rows remain identical, and an additional unused assessment leaves outputs unchanged. A nonexistent source-to-assessment link is rejected by the foreign key.

The five prior proposal artifacts were not rerun or overwritten. Their earlier 35-check immutability/rollback proof remains available separately. This continuation adds an actual application-output comparison against the unchanged engines, rather than claiming that database equality alone proves report equality.

### Before/after application outputs

Results: [output-comparison-results.json](output-comparison-results.json). **29 exact comparisons passed** across before/after-schema, after-copy and after-unused-assessment states, plus the empty case and original-row equality.

| Existing component | Evidence compared | Result |
|---|---|---|
| Production | Shared summary, full scoped workspace DTO, existing panel static markup | Unchanged. Panel comparison establishes markup, not a full interactive browser session; existing interaction tests also passed. |
| Intelligence | Actual `runIntelligenceEngine` findings, KPI summary, changes and priorities | Unchanged. |
| Decision Support | Actual trusted performance dataset | Unchanged. |
| NRW | Shared signed-loss validation plus current Intelligence NRW behavior, including a negative-loss example | Unchanged; existing inconsistency between modules is preserved, not fixed. |
| Management reports | All four existing report types, including tables/narrative/methodology | Unchanged. |
| Board Pack | Every uncompressed package part, including all 14 slides | Unchanged. ZIP container timestamps are excluded; generation-time fields use a fixed test clock. |
| Workbook fixture | Current August reference performance dataset | Unchanged, including previously identified fixture assumptions. |
| Existing data | Source, log, target, bill, meter-reading and report-history fixture rows | Identical serialized-row hashes before/after initialization. |

The original-row hash for this continuation's populated fixture is identical before and after: `b414dfac923f73859b062a8f9d293f9d7fc742d63d6f0dd9ee06297fc369e296`.

### Documented examples and unchanged numerical results

| Example | Original workbook evidence | Before / after validation | Interpretation |
|---|---|---|---|
| Ryakarimira source | 56.49520488230165 m³/day; 1,694.8561464690495 m³/30-day month | Workbook cells unchanged; synthetic current projection retains rounded 56.50 m³/day and its saved 1,694.86 monthly field unchanged | Source precision and as-written 30-day benchmark are retained as distinct evidence; no reconstruction of lost DB precision. |
| Ryakarimira current July comparison | Workbook July production 810 m³ | Synthetic verified total **810.00 → 810.00**; existing calendar denominator **1,751.50 → 1,751.50 m³** | Current engine uses 56.50×31. It was not changed to the original workbook's monthly benchmark in this validation-only work. |
| Katuna mixed-source scheme | `(7.5×14)+(15/19.11×3.6×24)` = 172.81789638932497 m³/day; ×30 = 5,184.536891679749 | Workbook cells unchanged; synthetic verified production **4,993.00 → 4,993.00** and current calendar capacity **5,357.42 → 5,357.42** | Rounded synthetic current source capacities 105.00+67.82 use the existing ×31 engine. No silent denominator correction. |
| Rugaga formula exception | ISINGIRO!M10 as-written 799.0857142857144 m³/day | Preserved unchanged; no corrected result assigned to a baseline | The prior diagnostic corrected-unit calculation is not an approved engineering revision. |
| Two populated synthetic schemes, global | Production examples 810+4,993; sales examples 746+2,551 | Produced **5,803 → 5,803 m³**; sold **3,297 → 3,297 m³**; capacity **7,108.92 → 7,108.92 m³**; utilisation **81.6% → 81.6%**; production-to-sales indicator **43.2% → 43.2%** | Confirms populated outputs rather than just empty reports. |
| Supplied observations absent in synthetic logs | Separate produced/supplied meanings | Aggregate numeric supplied remains **0 → 0**, while supplied completeness remains false | Tests retain the existing unavailable-data semantics; they do not certify that numeric aggregate zero as measured supply. |

These comparisons prove that the **current, unintegrated** application ignores the extra proposal tables and that the schema/copy alone changes no existing output. They do not prove the future baseline-aware service/report integration is complete, nor do they certify any real historical reporting period. Correcting the actual selection of historical denominators would require separate approved integration and regression evidence.

## Tests, lint and typecheck

Current combined run:

```
npm test -- lib/production lib/decision-support components/production app/actions/intelligence.production.test.ts outputs/phase-a-history-validation/outputs-invariance.test.ts outputs/phase-a-history-validation/mapping-register.test.ts
```

**11 suites passed; 89 tests passed; exit 0.** This includes 68 unchanged existing tests, 13 new disposable output-invariance tests and 8 new record-level mapping tests. The mapping tests reread the original workbook and verify every source input/formula, source-group coverage, NULL period assignments, candidate-versus-approved identity, blank September data and known ambiguous records. Existing workbook/mapping suites emitted missing `DATABASE_URL` diagnostics; they were not supplied a business URL.

`npx tsc --noEmit --incremental false`: **passed, exit 0**. Final `npm run lint -- --no-cache`: **passed, exit 0, no errors or warnings**. An unused-variable warning in the new mapping-builder script was corrected before the final lint run; application code was not edited.

The prior independent production integrity run remains **27 passed / 2 failed**. It was not rerun or repaired here because no existing source/test changed. Those previously documented failures concern a missing fixture `user.phone` column and a self-approval error-message assertion that encounters the version guard first. The new invariance fixture includes the original 0012 migration rather than changing that existing harness. The prior standalone proof independently confirmed version-correct self-approval rejection.

No full production build or deployed browser test is claimed. Existing unit/interaction tests, actual engine/report comparisons and unchanged source hashes are the evidence for preservation in this validation scope.

## Files and local-work preservation

New files only under `outputs/phase-a-history-validation/`:

- `historical-mapping-and-approval-review.md` — this review and approval matrix.
- `historical-mapping-register.md` and `.json` — all exact source/scheme/month-label records and proposed candidates.
- `business-inventory-summary.json` — permitted read-only evidence, migration ledger and exact period IDs.
- `read-engineering-evidence.mjs` — engineering-only, enforced-read-only inventory reader; no migration or mutation operations.
- `build-mapping-register.mjs` — workbook/candidate mapping builder with no business writes.
- `mapping-register.test.ts` — eight mapping evidence tests.
- `outputs-invariance.test.ts` — thirteen synthetic PostgreSQL and existing output comparisons.
- `output-comparison-results.json` — the 29 equality comparisons, before/after KPIs and fixture-row hashes.
- `preservation-manifest.json` — unchanged HEAD, no tracked diffs, 608 tracked-file count/aggregate hash, selected application-file hashes and hashes of all five retained prior proposal artifacts.

Ignored engineering-only evidence and the existing disposable cluster remain under `.artifacts/`. No old report, proof artifact, local file, Git commit or history was replaced. No new migration was registered. No backfill, extra migration or source write ran against Supabase. All mutation SQL in this continuation was confined to explicitly synthetic disposable schemas.

## Approval matrix and stopping point

| Population / relationship | Verified evidence | Eligible for a future dated historical DB backfill? | Required disposition |
|---|---|---|---|
| 64 workbook scheme capacity groups | Original cells, formulas and as-written figures confirmed | **No dated mapping yet.** Eligible only for preservation as undated workbook evidence, subject to a suitable reviewed archive/import design. | Preserve original values; obtain assessment/report dates and approved identity before assigning periods. |
| 92 source/technology rows | Raw observations, method evidence and workbook grouping confirmed | **No.** No registered source IDs, assessment dates or original officers. | Retain exact row identities and uncertainty; review physical-source inventory. |
| 54 coherent scheme-name/hierarchy candidates | Candidate live scheme IDs and branch relationship documented | **No automatic baseline/backfill approval.** | Eligible for identity-review consideration only; source/date evidence still required. |
| 2 hierarchy conflicts | Mayanga and Itojo conflicts confirmed | **No.** | Investigate historical/current service-area hierarchy; leave existing records unchanged. |
| 8 unmatched identity cases | Suggestions/no-candidate outcomes explicitly listed | **No.** | Investigate spellings, service areas and combined/split schemes; never fuzzy-map automatically. |
| 128 July/August relationships | Month labels and entered volumes confirmed; blanks retained | **No.** Year and temporal validity unknown. | Preserve workbook comparisons without calendar or billing-period assignment. |
| 64 September relationships | Input cells blank | **No.** | Leave blank; do not create observations or zero targets. |
| Existing live source/log/report-capacity records | **Zero records** in inspected tables; no hidden-row explanation from RLS | **No records to backfill.** | Proposed blanket source snapshot is a zero-row operation and is not a reason to request mutation approval. |
| Existing MPS/TPS, NRW/classification/collection behavior and workbook exceptions | Original audit evidence and unchanged output comparisons | **No correction authorized.** | Remain unchanged for later phases. |

**Stop here. No historical mutation is proposed for immediate approval.** The next useful work is evidence/identity reconciliation: dated assessment sheets or signed engineering reports, source identities and roster/topology, approved scheme/hierarchy crosswalks, and dated original management reports that identify their selected capacity denominator. A business owner must then approve the exact eligible record set and period association before any historical mutation. Local simulation results alone cannot supply that missing authority or evidence.
