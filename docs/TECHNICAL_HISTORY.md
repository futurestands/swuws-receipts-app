# SWUWS Technical Security History

This document tracks all formal security remediations and structural hardening performed on the platform to satisfy enterprise audit requirements.

## 2026-07-26: Phase 1 & 2 Hardening

### 1. IAM & Authorization
- **Cycle Detection**: Implemented recursive role inheritance protection in `lib/iam/index.ts` to prevent infinite loops (DOS risk) in the permission resolver.
- **Hierarchy Scoping (Data Isolation)**: 
    - Implemented `applyUserScope` to ensure Branch Managers can only see/manage agents within their own Area.
    - Standardized `validateWriteScope` to strictly enforce branch/scheme boundaries for Customer and Agent creation.
- **Dead Permissions Activated**:
    - `customers.delete`: Implemented as a logical deactivation (`active` boolean) to preserve financial history.
    - `receipts.void`: Implemented as a financial reversal transaction (restores customer balance) while respecting the database's strict immutability rules.

### 2. Infrastructure Hardening
- **Content Security Policy (CSP)**: Added a strict policy to `next.config.mjs` to mitigate XSS and injection attacks.
- **Magic-Byte Verification**: Upgraded file upload security in `receipts.ts` to inspect raw file headers (PDF, PNG, JPEG) instead of trusting client-supplied MIME types.
- **Rate Limiter "Fail Closed"**: Enhanced `lib/rate-limit.ts` to support strict enforcement on system entry points (Login/Verify) during database interruptions.
- **Template Sanitization**: Implemented HTML escaping in `lib/templates/template-engine.ts` to prevent stored XSS from admin-authored communications.

### 3. Database Integrity
- **Customer Lifecycle**: Added `active` column to the `customer` table via migration `0032`.
- **Immutability Enforcement**: Re-verified that `receipt` and `audit_log` tables are protected by DB-level triggers and privilege revocation.

---
*End of Record*
