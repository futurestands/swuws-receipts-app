# External Billing Integration Analysis Report
**Project:** SWUWS Receipt & Payment Tracking System  
**Phase:** 2A.5 (Architecture & Design Review)  
**Status:** Analysis Only - No Code Changes

## 1. Executive Summary
This report outlines the architectural design for integrating confirmed payment data from the External Billing System (EBS) into the SWUWS Receipt & Payment Tracking System. The goal is to establish a robust "Daily Collection Import" engine that serves as the foundation for future financial reconciliation and operational oversight.

## 2. Current Architecture
The SWUWS Receipt System currently operates as an operational tracking tool for cash receipts. 
- **System of Record (Financial):** External Billing System (EBS).
- **System of Engagement (Operational):** SWUWS Receipt System.
- **Integration Point:** Daily confirmed payment report upload.

## 3. Expected Import Workflow (Phase 2B Design)
The proposed workflow for the future Daily Collection Import Engine:
1. **Select File:** User selects the EBS export file (XLSX/CSV).
2. **Validate Structure:** Automated check for file format, required columns, and data encoding.
3. **Preview Summary:** System displays total records, total amount, and date range for user confirmation.
4. **Duplicate Check:** Cross-reference against `businessDate` and `fileHash` of previous imports.
5. **Confirm Import:** Transactional commit of metadata to `daily_collection_import` and detailed records to a future storage table.
6. **Final Report:** Detailed breakdown of successes and skipped rows (if any).

## 4. Proposed File Structure & Mapping
Based on standard utility billing exports, the following field mapping is proposed:

| External Field | Description | Required | Internal Mapping |
| :--- | :--- | :--- | :--- |
| **Account No** | Unique Customer ID | Yes | `customerAccount` |
| **Customer Name** | Full Name for verification | Yes | `customerName` |
| **Amount Paid** | Confirmed collection value | Yes | `amount` |
| **Payment Date** | Actual bank/m-money date | Yes | `businessDate` |
| **External Ref** | EBS Receipt or Transaction ID | Yes | `externalReference` |
| **Channel** | Bank, MM, Agent, Office | Yes | `paymentChannel` |
| **Scheme Name** | Water Scheme label | Optional | `schemeName` |
| **Area/Branch** | Operational hierarchy unit | Optional | `branchName` |

## 5. Validation Strategy
To ensure data integrity, the following rules are proposed for Phase 2B:
- **Strict Format:** Support only `.xlsx` (preferred) and `.csv`.
- **Date Integrity:** Ensure `Payment Date` falls within the active Billing Period.
- **Negative Values:** Block imports containing negative amounts (must be handled as reversals in EBS).
- **Schema Lock:** Reject files with missing mandatory columns.
- **Zero-Sum Check:** Reject imports where the sum of rows does not match the reported total.

## 6. Duplicate Detection Strategy
To prevent double-counting collections, a multi-layered approach is recommended:
- **Level 1 (File Level):** Compare SHA-256 hash of the uploaded file against history.
- **Level 2 (Business Date):** Block uploads for a `Business Date` that already has a "Processed" import (allow override only by System Admin).
- **Level 3 (Transaction Level):** Future check for existing `externalReference` entries.

## 7. Error Handling Strategy
- **Atomic Imports:** Use database transactions. If one row fails validation, the entire file is rejected (prevents partial, "dirty" data).
- **Sanitization:** Auto-trim spaces and normalize casing for Account Numbers.
- **Audit Logging:** Record every failed attempt with the specific reason (e.g., "Invalid Date Format on Row 45").

## 8. Future Database Requirements (Phase 2B/3)
While Phase 2A metadata storage is sufficient for now, the following will be required for functional imports:
- **`daily_collection_record` Table:** To store individual rows from the EBS import (Account No, Amount, Ref, Channel).
- **`reconciliation_match` Table:** To store the mapping between a SWUWS Receipt and an EBS Imported Record.

## 9. Reconciliation Preparation (Phase 3 Concept)
The imported data will be used to perform **One-to-One Matching**:
- **Match Criteria:** `customerAccount` + `amount` + `paymentDate` (within ±1 day window).
- **Output:** A "Reconciled" flag on both the SWUWS receipt and the EBS record.
- **Exception List:** Receipts not found in EBS (Potential Fraud/Delayed Banking) and MM payments not receipted in SWUWS (Unclaimed Revenue).

## 10. Risks & Recommendations
- **Risk:** EBS export format changes without notice.
    - *Recommendation:* Implement a "Mapping Template" feature in Phase 2B to allow Admins to adjust column headers.
- **Risk:** Timezone mismatches between EBS and Receipt system.
    - *Recommendation:* Standardize on UTC for database storage and local timezone for "Business Date" logic.

## 11. Open Questions for Business
1. Does the EBS export provide a unique "Batch ID" for each daily report?
2. Are reversals/refunds included in the daily report, or are they filtered out before export?
3. What is the expected maximum number of rows in a single daily file? (For performance tuning).

---
**Prepared by:** System Architect  
**Date:** 2026-07-18
