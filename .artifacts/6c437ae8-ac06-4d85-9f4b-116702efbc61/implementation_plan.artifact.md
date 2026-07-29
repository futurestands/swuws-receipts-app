# Implementation Plan: Production Reliability & Security Hardening

This plan addresses specific technical risks identified during the third-party forensic audit regarding SSL detection, production file storage, and database connection pooling.

## User Review Required

> [!IMPORTANT]
> **SSL Detection Strategy**: I am switching from substring-matching (`supabase.com`) to a hostname-based check. This ensures that direct Supabase connections (which use `.co`) are correctly recognized as requiring SSL, preventing connection failures in production.
>
> **File Storage Policy**: Local filesystem writes (for logos) will now be **Physically Blocked** in production. This prevents data loss on ephemeral platforms like Vercel and forces the use of a persistent cloud provider (Vercel Blob).

## Proposed Changes

### 1. Database Connection Layer

#### [MODIFY] [lib/db/index.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/lib/db/index.ts)
- **Refined SSL Detection**:
  - Replace `.includes()` check with a hostname check: `url.hostname !== "localhost" && url.hostname !== "127.0.0.1"`.
- **Dynamic Pool Sizing**:
  - Distinguish between **Vercel** and generic production.
  - If `process.env.VERCEL` is present, use `max: 1` (safest for serverless).
  - If production but not Vercel, use `max: 10` (standard for always-on servers).
  - Local development remains at `max: 20`.

### 2. Administrative Settings & Storage

#### [MODIFY] [app/actions/settings.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/settings.ts)
- **Hardened Upload Logic**:
  - In `uploadLogo`, add an explicit check: If `NODE_ENV` is production and `BLOB_READ_WRITE_TOKEN` is missing, throw a fatal error.
  - Remove the "Local Fallback" for production builds to prevent silent data loss.

## Verification Plan

### Automated Verification
- Run `npm run typecheck` to ensure the new environment checks are correctly implemented.

### Manual Verification
1. **SSL Test**: Connect to a non-localhost database. **Verify**: The logs show `(SSL: true)`.
2. **Storage Test**: In a production-simulated environment without a blob token, attempt to upload a logo. **Verify**: The system returns a "Configuration Error" instead of attempting a disk write.
3. **Pooling Test**: Check startup logs in production. **Verify**: The connection max is correctly assigned based on the platform.
