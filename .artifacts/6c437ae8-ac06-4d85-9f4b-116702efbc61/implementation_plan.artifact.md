# Implementation Plan: Fix Build Failure (Red Cross on Preview)

This plan addresses the CI/CD build failures that are preventing the "Preview" deployment from updating. This will resolve the "red cross" in the GitHub UI and ensure that updates are pushed to the mobile app (which loads from the deployment URL).

## Analysis of Failure
The build failed due to:
1. **Type Error:** `AlertCircle` was not defined in the project's `IconName` union. (Fixed).
2. **Lint Errors:** Unescaped characters and unused imports in the newly created `Billing Exceptions` page and updated components.
3. **Lint Errors:** Use of `any` types in server actions which violate the strict TypeScript linting rules.

## Proposed Changes

### System Configuration

#### [MODIFY] [eslint.config.mjs](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/eslint.config.mjs)
- Add `android/**` to the ignore list to prevent ESLint from scanning Capacitor build artifacts, which are currently causing numerous warnings/errors.

### Billing Module

#### [MODIFY] [billing-engine.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/app/actions/billing-engine.ts)
- Fix lint errors (unused imports and `any` types).

#### [MODIFY] [billing.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/app/actions/billing.ts)
- Fix lint errors (unused imports and `any` types).

#### [MODIFY] [page.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/app/dashboard/billing/exceptions/page.tsx)
- Remove unused imports (`ShieldAlert`, `History`).
- Escape single quotes in the text content to satisfy React linting rules.

#### [MODIFY] [reading-entry-form.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/components/billing/reading-entry-form.tsx)
- Remove unused imports and state variables.
- Fix `any` types or use `@ts-expect-error` where appropriate to match the existing codebase style while satisfying the build check.

## Verification Plan

### Automated Tests
- Run `npm run typecheck` to ensure all type errors are resolved.
- Run `npm run lint` to ensure no build-blocking lint errors remain in the modified files.

### Manual Verification
- Once pushed, verify that the GitHub Actions "Preview" job turns green (check for a green checkmark instead of a red cross).
- Verify the mobile app loads the new version.
