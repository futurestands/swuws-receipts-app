# SWUWS–WATOPS operational gap audit

Audit date: 2026-10-27. Status: planning evidence; implementation not approved.

This is a sanitised summary of the investigation in the project conversation. It contains functional observations, repository references and REA evidence identifiers only. No raw browser capture, customer/staff record, session identifier, cookie, credential, database connection string, private workbook, screenshot or proprietary application source is retained here.

## Evidence boundary

- SWUWS: source, migrations, permissions, tests and read-only database metadata were inspected. Database observations apply only to the connection inspected on the audit date, not every deployment.
- WATOPS: authorised authenticated Chrome session, observed through REA 6.7.0. Navigation was performed; no create, approve, issue, purchase or other business operation was submitted.
- Screen labels establish exposed interfaces and advertised states. Empty lists and approval labels do not establish working backend transitions, stock valuation or accounting behaviour.
- Application code and business data were not changed during the audit. A pre-existing modification to `next-env.d.ts` was left intact.
- The documents added in this follow-up are authorised documentation changes only.

## Baseline

| Check | Independently observed result | Qualification |
| --- | --- | --- |
| Vitest | 45 files passed; 324 tests passed, 1 skipped | `npm test -- --no-cache`; initial sandbox configuration-resolution failure was followed by a successful authorised rerun |
| Lint | Passed | `npm run lint -- --no-cache` |
| Typecheck | Passed | `npx tsc --noEmit --incremental false` |
| Production build | Previously reported successful | Not rerun in read-only audit; generated files would be rewritten |
| Skipped test | Private workbook fixture test | Requires `PEGASUS_SAMPLE_FILE`; no private fixture copied into documentation |

Passing unit/mocked tests does not establish real database constraints, browser workflows or deployment health. Do not report the build as independently verified by this audit.

## Sanitised REA evidence register

These identifiers came from returned REA Evidence records. The raw records were not exported to this repository; an identifier is a provenance reference, not a promise of durable replay or a local evidence bundle.

| Reference | Evidence ID | Observation and limitation |
| --- | --- | --- |
| REA-01 | `ev_d2c4c91fa66a62fc10c860f9e90f2b681af5871edb5fb9911332260fd085351f` | Browser target discovery established an existing WATOPS session. Target IDs, account identity and unrelated tab details intentionally omitted. |
| REA-02 | `ev_0d9f4ead748a6599034693a59cdc8e73022ffcb991d5fefb538cf13198fe3fd6` | Passive inspection of `/work`: operational navigation and request-to-work-order conversion tasks. Individual records intentionally omitted. Attach-window and origin filtering limited coverage. |
| REA-03 | `ev_09ea8154c863e5183117ad6dfe5f2d0f1581fa04957584e67ecd9c8aeea82817` | Declared navigation from My work to production day sheets. URL-only capture; does not itself prove screen contents. |
| REA-04 | `ev_83c48c54e0fd76d57aceba3d00b1e406e3239bfc1fcede35b7604d84e80d3740` | Declared navigation/accessibility observations for production, energy, samples, work orders, stock movements and purchase orders. No transaction submission; network bodies were not requested. The asset step lacked useful text and was followed up. |
| REA-05 | `ev_0945c2055e080de5bbadfe8a57335b3a64f1742ff4cb3b276aae1f389146bd65` | Follow-up confirmed the Asset register heading at `/assets`; detailed lifecycle unverified. |

Reference origin: <https://watops.onworx.info>. REA CLI and authorised loopback Chrome debugging worked during the audit. General REA doctor warnings about unrelated engines/registrations did not prevent the browser observations. No configuration repair, software installation or update was performed.

For future comparisons, reuse the installed CLI and the operator-authorised session when available. Discover the current targets afresh; do not save browser target IDs or authentication material. Use passive observation first and bounded, declared navigation when needed. Recheck availability rather than assuming the session persists. REA is for reference runtime evidence; ordinary repository work uses source tools and tests.

## Existing SWUWS functionality to reuse

- Customers, scheme/branch/cluster/organisation hierarchy and administrative customer activation.
- Billing periods/imports, meter readings, receipts, collections, reconciliation and commercial reports.
- CRM complaints/departments, SMS templates, approval and communications.
- Dynamic IAM grants/scopes, session validation, audit logging and maintenance controls.
- Source configuration, daily production form/history and production/capacity analytics.
- Decision-support findings, management actions, scheme mapping and management/board reports.
- Existing offline receipt and customer-meter-reading workflows; these are not an offline production workflow.

Relevant implementation: `lib/db/schema/intelligence.ts`, `app/actions/intelligence.ts`, both existing scheme pages under `app/intelligence` and `app/decision-support`, `lib/intelligence`, `lib/decision-support`, `lib/permissions`, `lib/scopes`, `lib/iam`, `lib/nav-config.ts` and `lib/audit.ts`.

## Functional gap ledger

| Area | WATOPS observation | SWUWS finding | Confidence / remaining evidence |
| --- | --- | --- | --- |
| Production | `/production/days`: station, in/out m³, internal loss, kWh, open/approval/locked and stores-issue labels | Existing sources/logging/analytics are incomplete, not absent. Needs safe authorisation, validated daily records, reporting alignment, verification/corrections; full station/day-sheet integration later. | Screen observed, REA-04; approval and posting execution untested |
| Energy/fuel | `/energy`: targets, tank dips, deliveries, stock waiting and book/dip differences; readings and power-source navigation | No dedicated energy/fuel/tank/reading workflow or tables in inspected source/database | Screen observed, REA-04; calculations and valuation unverified |
| Water quality | `/quality/samples`: collection, point, laboratory progress, approval, compliance; parameters/standards/plans/results/exceedances navigation | Complaint categories exist; laboratory workflow and data model absent | Screen observed, REA-04; scientific limits and approval behaviour require SWUWS requirements |
| Assets | `/assets`: Asset register; condition/network/preventive-maintenance navigation | Sources/hierarchy exist; general assets, condition history and maintenance plans absent | Register heading observed, REA-05; detailed lifecycle only advertised |
| Work orders | `/work-orders`: priority, assignee, due date, cost, status, completion-confirmation queues; `/work` conversion tasks | Complaints and management actions exist; operational request/order execution lifecycle absent | Screens observed, REA-02/04; transitions unsubmitted |
| Disconnections | Navigation entry; Billing explicitly marked Not switched on | Warning SMS, complaints and customer activation exist; physical disconnection/reconnection lifecycle absent | Navigation only; reference workflow not verified. Do not infer policy or prioritise implementation as verified parity. |
| Inventory | `/inventory/movements`: item, store, quantity, value, originating document, approvals; stocktake/return/reorder navigation | Dedicated stock ledger, stores, reservations, issues and stocktakes absent | Screen observed, REA-04; costing and concurrency behaviour unverified |
| Procurement | `/procurement/orders`: supplier, purpose, expected delivery, total, approval/delivery states; quotations/contracts/receiving navigation | Dedicated supplier/order/receipt/procurement approval workflow absent | Screen observed, REA-04; business transitions and procurement rules unverified |

Negative findings are bounded to the inspected repository and public-schema table inventory. Menu entries alone are not proven complete modules. Payroll, broad accounting, HR and archive navigation do not establish approved SWUWS scope.

## Security and production integrity findings

Priority here is an engineering sequence, not a formal exploit severity score. Source findings were not exploited against live business records.

| ID | Priority | Evidence | Required response |
| --- | --- | --- | --- |
| SEC-01 | First | `getSchemeIntelligence` reads scheme/sources/logs by supplied scheme ID before applying an object-level scope check; source upsert conflicts by source ID without scoped ownership validation | Validate organisation, hierarchy and every referenced object before returning or modifying it |
| SEC-02 | First | `logWaterProduction` uses `canViewIntelligence`; source editing uses investigation permission | Separate production write/configuration/verification grants; read authority must not confer write authority |
| SEC-03 | First | Connected database role has BYPASSRLS, although inspected business tables have RLS enabled | Explicit application scope checks and denial tests are mandatory. Do not silently change credentials, grants or shared IAM behaviour. Least-privilege DB-role work requires its own reviewed operational change. |
| INT-01 | First | Action TypeScript inputs lack runtime schemas; source, scheme and period references are independently accepted | Validate numbers, dates, enums, units, relationships and bounds on the server and in DB constraints |
| INT-02 | First | Existing form omits billingPeriodId; analytics aggregate using it | Make production calendar date authoritative and explicitly map the billed month, not the collection window |
| INT-03 | First | Supplied-volume fallback uses `||`; zero hours become null | Preserve zero; distinguish unknown from measured zero |
| INT-04 | First | No natural duplicate/idempotency control or versioned verification workflow; audit writes occur after mutation | Atomic mutation/audit, durable retry protection, concurrency controls and verified-record protection |
| INT-05 | Next within Phase 1 | Source configuration falls back to 100 m³/day and 30 days; reporting counts rows as days and hardcodes 30 days | Unknown capacity stays unknown; calendar-aware calculation and distinct-day coverage |
| INT-06 | Next within Phase 1 | `lib/intelligence/engine.ts` derives previous production from current × 0.9 / × 0.92 and historical average from capacity × 0.75 | Remove synthetic observations; use actual comparable historical records or omit the comparison |
| SEC-04 | First | `applyIntelligenceSchemeFilter` does not clamp organisation; its scheme-only branch ignores a conflicting requested scheme ID | Repair shared intelligence scope filtering without loosening commercial controls; test all callers |

Additional database observations: production tables exist; the inspected production log held zero rows; migration files through `0068` were applied; no local migration was pending. Ledger-only `0011_receipt_billing_snapshots.sql` needs investigation before migration rollout, not deletion or invented reconstruction. Receipt/attachment/audit/Pegasus triggers were inventoried but their enforcement was not exercised by writes.

## Reconciliation with earlier findings

The immediately preceding audit in this conversation is available and is preserved above. No separate earlier WATOPS gap-analysis document was found in `docs`, `.artifacts`, `scratch`, searched local Codex memories/history, or the targeted filename search recorded in that audit. This follow-up repeated the project/memory text search and found no additional earlier report. These searches are bounded; they do not establish that no report exists elsewhere.

| Earlier available statement | Reconciled disposition |
| --- | --- |
| Production is an incomplete existing feature | Confirmed; extend current tables/actions/routes rather than introduce another production module |
| New logs can be omitted from period totals | Confirmed; additional source review establishes billing month and collection dates can differ, so a naive active-period/date-window fix is unsafe |
| Separate production permissions and verification | Retained as proposed SWUWS design, not claimed as a verified WATOPS permission implementation |
| Initial production phase before other modules | Retained, with synthetic trends and distinct-day coverage added to integrity scope |
| Assets and disconnections are gaps | Retained with confidence limits: assets heading/navigation observed; disconnections only advertised in a switched-off billing module |
| Build successful | Retained as reported, not independently rerun |

Unavailable earlier claims are not imported, accepted or rejected. When the report is provided, record its date, provenance, each claim, corroborating evidence and any resulting scope change before implementing it.

## Staged roadmap

1. Complete and secure existing daily production: [exact Phase 1 specification](phase-1-water-production-spec.md).
2. Add station/bulk-meter day sheets, incident/downtime and energy/fuel records; stores posting depends on inventory.
3. Add sampling/results/standards/compliance with approved scientific rules.
4. Add minimal assets, then work requests/orders and preventive maintenance; link CRM and management actions.
5. Add inventory ledger, stores, issues/returns/reservations and stocktakes with an agreed costing policy.
6. Add procurement requisitions/approvals/orders/receiving, linking receipts to inventory.
7. Schedule disconnection/reconnection only after operational policy and enabled workflow evidence are established.

Each later phase requires its own frontend, backend, database, scope/permission and test specification. Screen parity alone is not an operational requirement. The long-term objective remains complete verified missing capabilities, without rebuilding working SWUWS features.
