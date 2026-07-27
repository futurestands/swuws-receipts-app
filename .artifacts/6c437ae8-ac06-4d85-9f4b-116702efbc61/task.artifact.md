# Tasks: Accurate Top Debtors List

- `[x]` Database Optimization
    - `[x]` Update `customer` table in `lib/db/schema/crm.ts` with balance index
    - `[x]` Create migration `0035_customer_balance_index.sql`
    - `[x]` Run database migrations (`npm run db:migrate`)
- `[x]` Reporting Logic Realignment
    - `[x]` Refactor `getTopDebtors` in `app/actions/reports.ts` to use live balance
- `[x]` Dashboard Interface Enhancement
    - `[x]` Update `app/dashboard/reports/page.tsx` to show top 10 clickable debtors
- `[/]` Verification & Final Walkthrough
    - `[ ]` Run `npm run typecheck`
    - `[ ]` Final walkthrough
