# SWUWS Collection Portal: Production Source of Truth

This document serves as the definitive reference for the system's core logic, financial rules, and architectural standards.

## 1. Financial Source of Truth (EBS Integration)

**Rule: The External Billing System (EBS) is the absolute authority for customer balances.**

*   **Receipts**: Issuing a receipt in this portal **does not** immediately decrease the `customer.accountBalance`.
*   **Balance Updates**: Official balance updates only occur during:
    1.  **Monthly Billing Imports**: Overwrites the system balance with the `totalDue` from the Excel file.
    2.  **Daily Collection Sync**: Reconciliation matches bank collections with portal receipts to verify cash flow.
*   **UI Transparency**: Customer profiles show a "Pending Reconciliation" indicator if unverified receipts exist, maintaining transparency without compromising the ledger.

## 2. Hierarchical Governance (IAM & Scoping)

**Rule: Data access is strictly compartmentalized by regional assignment.**

*   **Permissions**: RBAC is managed via the IAM system (Levels 1-10).
*   **Scoping**: Agents are "trapped" in their assigned Branch/Scheme. A Branch Manager cannot see data from a different branch unless granted `global` scope.
*   **Null-Field Safety**: A user with no assigned hierarchy (and no `global` permission) is denied access by default.

## 3. Native & Offline Strategy

**Rule: The Android app is a Hybrid Shell with a "True Offline" safety net.**

*   **Architecture**: The app is a Capacitor wrapper around the remote Vercel production server.
*   **Offline Fallback**: If the server is unreachable, Capacitor automatically serves a bundled `offline.html` emergency dashboard.
*   **SQLite Cache**: Used for field operations (customer lookup and receipt queueing). Sync occurs manually or via periodic foreground checks.

## 4. Technical Standards

*   **Framework**: Next.js 16 (App Router) + TypeScript.
*   **ORM**: Drizzle (PostgreSQL).
*   **Auth**: Better Auth.
*   **Deployment**: Vercel (Web) + Capacitor (Android).

---
*Last Hardened: September 3, 2026*
