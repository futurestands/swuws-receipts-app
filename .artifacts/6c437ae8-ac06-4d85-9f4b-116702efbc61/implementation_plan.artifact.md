# Implementation Plan: Database Synchronization Fix

The system is currently crashing on the `/admin` page because the database schema is out of sync with the application code. Specifically, the new columns added in Phase 3 (`billingGraceDays`, `currencyCode`, etc.) do not yet exist in your local/production database.

## User Review Required

> [!IMPORTANT]
> **Migration Execution**: I need to execute the migration runner (`db/migrate.js`) to apply the changes to your database. This will create the missing columns and resolve the "Something went wrong" error.

## Proposed Changes

---

### 1. Database Synchronization

#### [EXECUTE] Run Migration Script
- Command: `npm run db:migrate`
- This will apply `0033_org_settings_generalization.sql` which was created in Phase 3.

---

### 2. Resilience Cleanup (Optional but Recommended)

#### [MODIFY] [app/actions/settings.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/settings.ts)
- Add a defensive check in `getSettings` to ensure that if the query fails, the system returns a safe "Default Settings" object instead of crashing the entire page.

## Verification Plan

### Automated Verification
- Run `npm run db:migrate` and check for the "All migrations applied successfully" message.

### Manual Verification
- Refresh the `localhost:3000/admin` page to confirm the "Something went wrong" boundary is cleared and the settings are visible.
