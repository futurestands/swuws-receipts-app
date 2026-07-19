# Changes - Collection Period Management & Dynamic IAM

## IAM & Authorization
- **Dynamic Roles**: Roles are now database-managed and hierarchy-aware.
- **Permission Matrix**: Implemented granular capability management with support for Scopes (Own, Scheme, Area, Cluster, Global).
- **Zero-Role Logic**: Replaced all hardcoded role checks with dynamic permission-based authorization.
- **Inheritance Engine**: Added recursive parent-child permission inheritance.
- **Audit Logging**: Fully audited IAM lifecycle (Role creation, Permission changes, Assignments).

## Reconciliation Hub
- **Core Matching (Phase 3A)**: Implemented the deterministic multi-stage matching engine.
- **Exception Management (Phase 3B)**: Created a structured workspace for investigating and resolving unmatched transactions.
- **Approval Workflow (Phase 4B)**: Introduced formal sign-off for reconciliation batches with support for multi-stage reviews (Draft, Pending, Approved).
- **Control Center (Phase 4A)**: Built a centralized Financial Operations Dashboard for real-time monitoring of reconciliation progress, import health, and approval aging.
- **Task Management (Phase 5B)**: Implemented an in-app Notification Center with real-time alerts for failed imports, pending approvals, and unmatched collections.
- **Proactive Governance**: Integrated automated escalations and task assignments to ensure timely resolution of financial discrepancies.

## Executive Reporting
- **Report Catalog (Phase 5A)**: Implemented a centralized hub for generating standardized operational, financial, and governance reports.
- **Scope-Aware Retrieval**: Integrated IAM permission scopes into all reports, ensuring managers only see data for their authorized areas or schemes.
- **Export Framework**: Added one-click PDF printing and high-fidelity Excel (.xlsx) export for all system reports.
- **Governance Documentation**: Created specialized registers for Exceptions and Approvals to support internal and external audits.
- **Audit Traceability**: Automatically logs every report generation event, including the user, parameters, and format used.
