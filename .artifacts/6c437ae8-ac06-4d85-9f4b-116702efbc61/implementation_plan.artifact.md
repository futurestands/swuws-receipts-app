# Phase 11: Enterprise-Scale Hardening (50,000+ Rows)

This phase scales the system's resource governance to handle large-scale population data while closing the final security and notification gaps.

## User Review Required

> [!IMPORTANT]
> **Scaling the Walls**: We are increasing the import limit to **50,000 rows**.
> - To support this, I am raising the server's intake limit to **50MB**.
> - **Recommendation**: For files larger than 50,000 rows, it is best practice to split them into two files to ensure they complete within the 60-second server timeout.

## Proposed Changes

---

### 1. Scaling Resource Governance

#### [MODIFY] [next.config.mjs](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/next.config.mjs)
- Increase `serverActions.bodySizeLimit` from `10mb` to **`50mb`**.
- Why: 50,000 rows of Excel data (including names/addresses) can easily exceed 10MB.

#### [MODIFY] [import-engine.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/lib/import-engine.ts)
- Add a hard limit of **50,000 rows** per import.
- Add an explicit memory-cleanup step to clear the Excel buffer immediately after parsing.

---

### 2. High-Coverage Notifications

#### [MODIFY] [notifications.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/notifications.ts)
- Broaden `createNotification` permissions.
- Allow any user with `branding.manage` (System Admins) or `collection.view` (Finance) to trigger notifications.
- Why: This ensures that when a Regional Manager imports a large file, the correct people are notified across the whole organization.

---

### 3. Identity Injection Protection

#### [MODIFY] [admin.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/admin.ts)
#### [MODIFY] [bootstrap.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/bootstrap.ts)
- **HTML Sanitization**: Add a regex filter to strip HTML tags (`<b>`, `<script>`, etc.) from the user's `name` during creation.
- Why: This prevents an attacker from putting malicious code in their name, which would then be sent to other people's inboxes in your HTML emails.

---

### 4. CI/CD Audit Trail

#### [VERIFY] [.github/workflows/ci.yml](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/.github/workflows/ci.yml)
- Confirm that the math and scope unit tests are part of the automated check.

## Verification Plan

### Automated Verification
- Run `npm run typecheck`.
- Run `npm test`.

### Manual Verification
1. **Stress Test**: Upload a file with 1,000 rows to verify the 50MB intake limit is working correctly.
2. **Security Test**: Create a user with name `<script>alert(1)</script>Mugisha`.
   - **Verify**: The name is stored in the database as `Mugisha`.
3. **Audit Check**: Verify that `tariff.bulk_import` and `system.full_wipe` are recorded correctly.
