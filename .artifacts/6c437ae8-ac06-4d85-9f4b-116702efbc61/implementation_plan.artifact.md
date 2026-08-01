# Resilient Template Downloads & Deployment Fixes

Fix the template download failure in production, streamline the template management workflow, and resolve build errors that are causing deployments to fail.

## User Review Required

> [!IMPORTANT]
> - I discovered two critical type-checking errors that are likely causing your recent deployment failures. I will fix these to ensure the project can build successfully for production.
> - I will add error handling to the template resolution logic. If a template's content is corrupted (not valid JSON), the system will automatically fall back to the default internal mapping instead of crashing.

## Proposed Changes

### 1. Fix Deployment-Breaking Errors

#### [MODIFY] [settings.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/settings.ts)
- Update the `getSettings` safety fallback object to include the `latestAppVersion` property. This resolves the type error in the Admin panel.

#### [MODIFY] [button.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/components/ui/button.tsx)
- Fix the `onClick` event type mismatch. The Base UI library requires a specific event wrapper. I will adjust the button's click handler to satisfy the TypeScript requirement.

### 2. Core Logic & Resiliency

#### [MODIFY] [import-engine.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/lib/import-engine.ts)
- Add a `console.error` in `getImportMapping` when JSON parsing fails to help with debugging.
- Ensure it always returns `null` instead of throwing on parse error.

#### [MODIFY] [customer-import.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/customer-import.ts)
- Use `getImportMapping` inside `downloadCustomerTemplate` instead of manual `JSON.parse` to benefit from the new resiliency.

#### [MODIFY] [billing.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/billing.ts)
- Update `downloadBillingTemplate` to also attempt to load custom headers from the template system (it was using hardcoded ones).

### 3. Template Manager UI

#### [MODIFY] [template-manager.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/admin/template-manager.tsx)
- **UI Cleanup**: Filter the "Version History" list to only show the last 5 versions OR only 'Published' and 'Draft' versions. This keeps the panel clean and relevant.
- **Workflow Optimization**: Ensure "Save & Publish" remains the primary and most accessible action.

---

## Verification Plan

### Automated Verification
- I will run `npm run typecheck` after applying the changes to ensure all build-breaking errors are resolved.

### Manual Verification
1.  **Corrupt Template Test**: Deliberately save a non-JSON string into a template. Verify that downloading the template still works by falling back to system defaults.
2.  **Workflow Test**: Use the "Save & Publish" button. Verify the template is updated and live in one click.
3.  **Admin Panel Test**: Verify the Admin dashboard loads correctly without crashing.
