# Enterprise Forensic Audit Report: SWUWS Collection Portal

**Date:** 2026-07-26
**Auditor:** AI Systems Architect
**Status:** Phase 1-3 Discovery Complete

---

## Phase 1 — System Discovery

### Application Architecture
- **Framework**: Next.js 16.2.10 (Turbopack)
- **Framework Pattern**: App Router with Server Actions
- **Language**: TypeScript 5.7.3

### Component Stack
- **Backend**: Next.js Server Actions & API Routes
- **Frontend**: React 19, Tailwind CSS 4.2.0
- **Database**: PostgreSQL (via Drizzle ORM 0.45.2)
- **Authentication**: Better Auth 1.6.23
- **Component Library**: Radix UI (Base UI), Shadcn UI, Lucide Icons

### Infrastructure & Services
- **Storage**: Vercel Blob (`@vercel/blob`)
- **Analytics**: Vercel Analytics (`@vercel/analytics`)
- **Validation**: Zod 3.24.1
- **File Processing**: SheetJS (`xlsx`)
- **Middleware**: Custom `proxy.ts` handling CSP nonces and auth redirects.

### Environment Configuration
- Uses `.env` for secrets (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BLOB_READ_WRITE_TOKEN`).
- Support for production-specific overrides (`.env.production.example`).

---

## Phase 2 — Module Inventory

### 1. CRM / Customer Management
- **Purpose**: Managing customer profiles, meter references, and account balances.
- **Database Tables**: `customer`
- **Actions**: `searchCustomers`, `createCustomer`, `updateCustomer`, `quickSearchCustomers`.

### 2. Finance / Receipting
- **Purpose**: Issuing immutable payment receipts, tracking history, and print management.
- **Database Tables**: `receipt`, `receipt_print_history`, `receipt_attachment`.
- **Actions**: `createReceipt`, `recordReceiptPrint`, `getReceipts`.

### 3. Billing / Meter Reading
- **Purpose**: capturing field meter readings, calculating bills based on tariffs, and arrears integration.
- **Database Tables**: `meter_reading`, `tariff_configuration`, `billing_period`.
- **Actions**: `submitMeterReading`, `cancelMeterReading`, `upsertTariff`.

### 4. Reconciliation
- **Purpose**: Matching system receipts against external billing system (EBS) reports.
- **Database Tables**: `daily_collection_import`, `daily_collection_record`, `reconciliation_match`, `reconciliation_exception`, `reconciliation_approval`.

### 5. IAM / Security
- **Purpose**: Role-based access control with hierarchical scopes (Branch, Scheme, etc.).
- **Database Tables**: `user`, `iam_role`, `iam_permission`, `iam_role_permission`.
- **Logic**: Centralized in `lib/permissions/` and `lib/scopes/`.

### 6. Templates
- **Purpose**: Managing dynamic HTML/SMS/Text templates with versioning.
- **Database Tables**: `managed_template`, `template_version`.

### 7. Governance & Audit
- **Purpose**: Immutable activity logging.
- **Database Tables**: `audit_log`.

---

## Phase 3 — File System Inventory (High-Level)

### Statistics
- **API Routes**: Auth `[...all]`, Attachments proxy.
- **Server Actions**: Located in `app/actions/` (approx. 10 files).
- **Database Migrations**: 27 SQL files in `db/migrations/`.
- **Middleware**: 1 (`proxy.ts`).

### Complexity Hotspots (Initial Observation)
- `lib/db/schema.ts`: Massive single-file schema (800+ lines).
- `app/actions/receipts.ts`: Complex transactional logic for reconciliation and snapshots.
- `app/actions/billing-engine.ts`: Real-time math and historical rollbacks.
- `components/billing/reading-entry-form.tsx`: Heavy client-side state with printing logic.

---

## Phase 4 — Security Audit (Initial Findings)

### Strengths
- **Immutability**: Audit logs and receipts are designed as append-only.
- **CSP**: Middleware enforces a strict Content Security Policy with nonces.
- **Better Auth**: Modern, secure session management.

### Risks
- **Direct DB Exposure**: Several scripts (`test-db.js`, `clean-db.js`) in root allow direct manipulation outside the ORM/Audit loop.
- **Auth Proxy**: The reliance on `proxy.ts` (instead of standard `middleware.ts` for this version) may bypass certain Next.js optimizations or security headers if misconfigured.
- **Scope Validation**: Complexity in `validateWriteScope` increases risk of privilege escalation if a new module misses a check.

---

*This report is an ongoing forensic audit. Further details for Phases 5-12 will be populated as the investigation continues.*
