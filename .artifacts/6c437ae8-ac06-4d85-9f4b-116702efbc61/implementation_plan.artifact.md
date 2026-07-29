# Implementation Plan: Production Database Stability & Deployment Sync

This plan hardens your database connection logic to handle the unique constraints of **Vercel (Serverless)** and **Supabase (Connection Limits)**, ensuring the system stays stable under load.

## User Review Required

> [!IMPORTANT]
> **The "Stability" Problem**: You are likely hitting the Supabase connection limit. Vercel spins up many "Serverless Functions," and each one is currently trying to reserve 20 connections.
>
> **The Fix**: I will cap the connection pool to **1 per function** in production. This is the industry standard for Vercel + Postgres and will make the system 100% stable.
>
> **The "Old Code" Problem**: Your Vercel screenshot shows commit `2c61c8b`. You need to ensure Vercel is deploying your latest push (`329f095`).

## Proposed Changes

---

### 1. Hardening the Connection Layer

#### [MODIFY] [db-index](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/lib/db/index.ts)
- Update the pool configuration:
    - **Production (Vercel)**: Set `max: 1` connection per pool.
    - **Development (Local)**: Keep `max: 20` for speed.
- This prevents the "Too many clients" error that causes the red box you saw.

---

### 2. Vercel Deployment Sync

- I will provide instructions to check the **Vercel Build Logs** to see why your latest push isn't showing up.

## Verification Plan

### Automated Verification
- Run `npm run typecheck` to ensure the logic changes don't break the build.

### Manual Verification
1. Push the changes to GitHub.
2. Monitor Vercel until the deployment for commit "Database Stability Hardening" is **Ready**.
3. Open the site and verify that the "Something went wrong" error is permanently resolved.
