# Implementation Plan: Production Auth & Localhost Stability

This plan addresses two critical issues: the **"Invalid origin"** error preventing production login on Vercel, and the mysterious **404 error** on the localhost dashboard.

## User Review Required

> [!IMPORTANT]
> **Vercel Auth Dynamic Fix**: I am updating the authentication engine to automatically recognize and trust your Vercel deployment URL. This removes the need for manual "Trusted Origin" updates every time the URL changes.
>
> **Localhost 404 Diagnosis**: If a file exists (like `/dashboard/customers/page.tsx`) but returns a 404, it is almost always a **Next.js Cache** or **Dev Server** issue. I will provide a command to "Purge & Restart" your local environment.

## Proposed Changes

---

### 1. Hardening Auth for Vercel

#### [MODIFY] [lib/auth.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/lib/auth.ts)
- Update the `trustedOrigins` logic to automatically include the `VERCEL_URL` and `VERCEL_PROJECT_PRODUCTION_URL` if they are present.
- Ensure the `baseURL` uses the production URL preferentially when deployed.

---

### 2. Localhost 404 Resolution

- To fix the 404 on `localhost:3000/dashboard/customers`:
  1. **Stop the dev server** (Ctrl+C).
  2. **Delete the `.next` folder** (this is where stale cache lives).
  3. **Restart the server**: `npm run dev`.
- I will provide this as a single command for you to run.

## Verification Plan

### Automated Verification
- Run `npm run typecheck` to ensure the auth logic update is safe.

### Manual Verification
1. **Local Check**: Run the "Purge & Restart" command. Verify that `/dashboard/customers` now loads.
2. **Production Check**: Push the code to GitHub. Refresh Vercel. Attempt to sign in.
   - **Verify**: The "Invalid origin" error is gone.
