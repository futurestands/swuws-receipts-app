# Implementation Plan: Bulletproof Vercel Auth Origins

This plan makes the authentication system "Environment Aware" to handle Vercel's multiple URL patterns (Production vs. Preview) automatically.

## Proposed Changes

### 1. Hardening Auth Origins

#### [MODIFY] [lib/auth.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/lib/auth.ts)
- **BaseURL Priority**: Restore `process.env.BETTER_AUTH_URL` as the top priority.
- **Wildcard Trust**: Ensure `trustedOrigins` includes:
    1. The manually set `BETTER_AUTH_URL`.
    2. The current deployment `VERCEL_URL`.
    3. The production `VERCEL_PROJECT_PRODUCTION_URL`.
- **Protocol Normalization**: Ensure every URL in the list has `https://` added if it's missing.

## Verification Plan

### Manual Verification
1. Push code to GitHub.
2. Visit **[https://swuws-receipts-app-q2z9.vercel.app/login](https://swuws-receipts-app-q2z9.vercel.app/login)**.
3. **Verify**: Login succeeds.
