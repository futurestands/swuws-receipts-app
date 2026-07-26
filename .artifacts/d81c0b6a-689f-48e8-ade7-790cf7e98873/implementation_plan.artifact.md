# Implementation Plan: Audit Remediation (Phase 2)

This plan addresses several low and medium-severity findings from the forensic audit, focusing on data integrity, migration hygiene, and file upload security.

## User Review Required

> [!CAUTION]
> This plan involves renaming existing migration files and updating the database's internal migration tracking table. This is a delicate operation that ensures the repository's health for long-term maintenance. I will use a dedicated script to ensure the database remains in sync with the renamed files.

## Proposed Changes

### 1. Migration Numbering Hygiene
I will re-index all migrations to be strictly sequential (0001 to 0031) and remove all duplicates and sequence gaps.

#### [RENAME] Migrations
- `0011_account_balance_sync.sql` -> `0011_account_balance_sync.sql` (unchanged)
- `0011_receipt_billing_snapshots.sql` -> `0012_receipt_billing_snapshots.sql`
- ... and so on, re-indexing all subsequent files to fill gaps and resolve collisions.

#### [NEW] [sync-migrations.js](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/scripts/internal/sync-migrations.js)
A one-time utility to update the `schema_migrations` table in your database to match the new sequential filenames, preventing the system from trying to re-run old migrations.

### 2. File Upload Security (Magic-Byte Verification)
The audit flagged that we trust the client-declared MIME type for file uploads, which can be spoofed.

#### [MODIFY] [receipts.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/receipts.ts)
Update `uploadReceiptAttachment` to verify the actual file content:
- Read the first 8 bytes of the file buffer.
- Validate signatures for PDF (`%PDF`), PNG (`\x89PNG`), and JPEG (`FF D8 FF`).
- Reject the upload if the content does not match the allowed binary signatures, even if the filename extension is correct.

---

## Verification Plan

### Automated Checks
- **Type Check**: Run `tsc --noEmit` to ensure no imports were broken.
- **Migration Run**: Run `node db/migrate.js` after the sync to verify it reports "All migrations already applied."

### Manual Verification
1. **Upload Spoofing Test**:
   - Create a text file named `fake.jpg`.
   - Attempt to upload it as a receipt attachment.
   - Verify that the system now rejects it with a "File content mismatch" error.
2. **Migration Audit**:
   - List the `db/migrations/` folder and verify a clean, 0001–0031 sequence with no gaps or letter suffixes.
3. **Database Integrity**:
   - Verify that all existing receipts and attachments are still visible and accessible.
