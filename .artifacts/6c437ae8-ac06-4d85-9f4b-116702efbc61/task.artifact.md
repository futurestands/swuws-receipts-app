# Tasks: Phase 11 - Enterprise-Scale Hardening (50,000+ Rows)

- `[x]` 1. Scaling Resource Governance
    - `[x]` Increase body size limit to 50MB in `next.config.mjs`
    - `[x]` Add 50,000 row limit to `lib/import-engine.ts`
- `[x]` 2. High-Coverage Notifications
    - `[x]` Broaden `createNotification` permissions in `app/actions/notifications.ts`
- `[x]` 3. Identity Injection Protection
    - `[x]` Add HTML name sanitization in `app/actions/admin.ts`
    - `[x]` Add HTML name sanitization in `app/actions/bootstrap.ts`
- `[x]` 4. CI/CD Audit Trail
    - `[x]` Verify `.github/workflows/ci.yml` includes all tests
- `[/]` Final Verification
    - `[ ]` Run `npm run typecheck`
