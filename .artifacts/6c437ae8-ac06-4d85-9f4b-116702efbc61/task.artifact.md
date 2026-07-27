# Tasks: Feature Completion & Hardening (Slow Mode)

- `[/]` 1. Critical Build Fixes
    - `[ ]` Fix mismatched JSX tag in `app/admin/system-reset-panel.tsx`
- `[ ]` 2. Password Reset Repair
    - `[ ]` Wire reset token in `app/login/reset-password/reset-password-client.tsx`
- `[ ]` 3. System Reset Integrity
    - `[ ]` Create bypass migration `0036_maintenance_bypass_trigger.sql`
    - `[ ]` Update `wipeOperationalData` in `app/actions/admin.ts`
- `[ ]` 4. Security & Scoping Hardening
    - `[ ]` Add HTML escaping in `lib/email-service.ts`
    - `[ ]` Add per-row scoping in `app/actions/tariff-import.ts`
- `[ ]` Final Verification
