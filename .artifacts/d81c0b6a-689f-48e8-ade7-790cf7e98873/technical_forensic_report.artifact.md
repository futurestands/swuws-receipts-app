# Technical Forensic Report: SWUWS Collection Portal

## Phase 1 — Repository & Architecture Discovery

### System Architecture
- **Framework**: Next.js 16.2.10 (App Router, Turbopack)
- **Runtime**: Node.js v20+ (Target)
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Better Auth (configured in `lib/auth.ts`)
- **Security Middleware**: `proxy.ts` (manages CSP nonces and redirects)

### Core Stack Evidence
- `package.json`: Lists `next`, `drizzle-orm`, `better-auth`, `pg`, `zod`.
- `next.config.mjs`: Configures `turbopack.root` and `serverActions` payload limits.

---

## Phase 2 — Module & Workflow Analysis

### 1. Finance & Receipting
- **Purpose**: Issuance of immutable, sequenced payment receipts.
- **Evidence**: `app/actions/receipts.ts` -> `createReceipt` uses `FOR UPDATE` lock and `db.transaction`.
- **Integrity**: `receipt_seq` ensures chronological numbering; snapshots store customer name and branding at the time of issuance.

### 2. Billing & Meter Reading
- **Purpose**: Field consumption capture and Demand Note generation.
- **Evidence**: `app/actions/billing-engine.ts` -> `submitMeterReading` calculates bills using `calculateBill` (`lib/billing/math.ts`).
- **Traceability**: `meter_reading` table includes `previousBalanceSnapshot` and `totalDueSnapshot`.

### 3. Automated Reconciliation
- **Purpose**: Alignment with External Billing System (EBS) reports.
- **Evidence**: `app/actions/reconciliation.ts` -> `runReconciliation` implements 3-stage matching:
  - Stage 1: Exact Reference Match (100% confidence)
  - Stage 2: Customer + Amount + Date (95% confidence)
  - Stage 3: Customer + Amount + Channel (90% confidence)

---

## Phase 3 — IAM & Security Forensic

### Permission Engine
- **Logic**: Recursive resolution in `lib/iam/index.ts`.
- **Scopes**: Supports `own`, `scheme`, `area`, `cluster`, `global`.
- **Protection**: `validateWriteScope` enforces organizational isolation during create/update actions.

### Vulnerability Inspection
- **Authorization**: `requireUser()` is pervasive in server actions.
- **Input Validation**: Zod schemas are used in every critical action (e.g., `createReceiptSchema`).
- **Audit Logging**: `writeAudit` is integrated into all transactional workflows.

---

## Phase 4 — Database Forensics

### Statistics
- **Total Tables**: 33
- **Primary Schema**: `lib/db/schema.ts` (858 lines)
- **Financial Consistency**: Foreign keys use `onDelete: "restrict"` for critical links (e.g., `billing_period` -> `billing_run`).

### Snapshot Tables
- `receipt`: Snapshots `orgName`, `disclaimer`, `logoUrl`, `amountDue`.
- `meter_reading`: Snapshots `customerAccount`, `phone`, `totalDue`.

---

## Phase 5 — Technical Debt Register

| ID | Module | Severity | Description | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| TD-01 | DB | Medium | Monolithic schema file. | `lib/db/schema.ts` |
| TD-02 | System | High | Root-level scripts bypass audit. | `RECEIPT/clean-db.js`, `RECEIPT/test-db.js` |
| TD-03 | Billing | Low | Logic duplication in import parsers. | `app/actions/billing.ts` vs `app/actions/customer-import.ts` |
| TD-04 | IAM | Medium | Complex recursive loops in permission check. | `lib/iam/index.ts#resolvePermissions` |

---

## Phase 6 — Forensic Conclusion
The system is engineered with a "security-first" mindset. The reliance on database-level snapshots and atomic transactions provides a high degree of confidence in the financial reports. The primary technical risk is the maintainability of the large single-file schema and the presence of administrative scripts that bypass the established security middleware.
