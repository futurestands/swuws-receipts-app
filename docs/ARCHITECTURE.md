# SWUWS Technical Architecture

This document provides a high-level overview of the technical design principles of the SWUWS platform for future developers and auditors.

## 1. Data Integrity Model (The "Immutable Record")

Financial integrity is enforced via a **Permanent Snapshot** pattern.
- When a `receipt` is issued, we do not simply link to a customer's current name or address.
- Instead, we snapshot the `orgName`, `orgAddress`, `orgPhone`, and `disclaimer` directly into the receipt row.
- **Enforcement**: Database triggers (`BEFORE UPDATE/DELETE`) prevent any changes to a receipt once it is committed.

## 2. Security Model (Dynamic Scoping)

Authorization is split into two layers:
1.  **RBAC (Identity)**: Uses `better-auth` and a recursive IAM engine to determine *what* a user can do (e.g., `receipts.create`).
2.  **Scoping (Geography)**: Uses a custom Scope Engine (`lib/scopes/index.ts`) to determine *where* a user can do it. 
    - Queries are automatically injected with hierarchy filters (e.g., `WHERE branchId = X`).
    - This ensures absolute data isolation between different Area Offices.

## 3. Financial Logic (The Ledger)

The system maintains a chronological ledger for every customer:
- **Debit (+)**: Monthly bill imports or meter readings increase the `accountBalance`.
- **Credit (-)**: Issued receipts decrease the `accountBalance`.
- **Atomic Transactions**: All balance updates use `SELECT ... FOR UPDATE` row locking to prevent race conditions during high-volume field collections.

## 4. Automation & Verification

- **Linting**: Strict ESLint rules maintain code style.
- **Type Safety**: 100% TypeScript coverage ensures data structure consistency.
- **Testing**: Vitest unit tests verify the billing math and scope generation before any code is deployed to production.

---
*Certified for SWUWS v1.0.0 Readiness*
