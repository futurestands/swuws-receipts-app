# Pegasus SMS list import

The old SMS uploader interpreted every file as five positional columns without headers. A Pegasus export has six headed columns, so BillNumber shifted the customer name, period and balance into the wrong fields. The new importer maps column names and requires a server-generated review before saving a draft.

This change targets main at `91e40ef12fbcc316ac5625a55be6f90c8dd1c6c3`. It preserves the customer-directory list builder, creator/approver permissions, draft approval workflow, active-period contact protection, and default thank-you rule below UGX 1,500. It does not update customer balances, create bills, approve lists, or send SMS during import.

| Pegasus column | Displayed field | Handling |
| --- | --- | --- |
| MeterRef | Customer reference | Exact identifier; leading zeros retained when stored as text |
| Phone | Phone number | Full numeric spreadsheet values supported; normalized to +256; SWUWS phone and placeholder rules retained |
| BillNumber | Bill number | Retained separately; optional |
| CustomerName | Customer name | Used in the message and retained on the SMS record |
| Period | Billing period | `202607` becomes `July 2026` |
| AccountBalance | Amount due (UGX) | Grouped monetary values and up to two decimals supported |

CSV and XLSX are supported, up to 10 MB and 50,000 rows. The first worksheet is read. Named columns can be reordered; legacy five-column headerless lists remain supported. Scientific-notation *text* is rejected rather than guessing lost digits. Numeric Excel cells that merely display scientific notation remain usable when their underlying value is complete.

## User flow

1. Open `/dashboard/crm/sms` and select **Import Pegasus file**. **From customer directory** remains a separate entry point.
2. Choose a file, message purpose, optional scheme and template/custom message. The zero/credit-balance exclusion is optional and off initially.
3. Select **Review import**. Review mapped columns, counts, the first ten recipients and their completed messages. Exclusions show source row numbers and reasons; the first 100 issues are displayed.
4. Acknowledge any exclusions, then **Save draft SMS list**. The server rechecks the original file, permission scope, profile matches, template content and active-period contact history. A stale review cannot be saved.
5. Inspect **Details**, then use the existing submit/approve workflow when the list has been reviewed by the responsible operator.

References match customerAccount or meterRef exactly. Ambiguous matches and inactive customers are excluded. Restricted staff cannot import unlinked customers or customers outside their permitted schemes. Global users may retain unlinked recipients when no specific scheme is selected; the review makes this visible. Imported names, references, bill numbers, periods and balances are saved as SMS snapshots, with joined customer details retained as a fallback for older records.

Default billing messages do not invent a due date, since the export has none. Existing managed templates that require unavailable fields produce a clear error. Default greetings and alerts follow the selected purpose. Default billing reminders retain the existing below-1,500 thank-you behavior; the sample message shows the final content.

## Verification on 22 October 2026

The supplied `katagata.xlsx` was read without modification: 154 customer rows, all six expected headers, all rows structurally valid, complete Uganda phone numbers and July 2026 periods. This establishes file compatibility; actual eligible counts still depend on the operator's scope, selected scheme and database contact history. The workbook and its customer data are excluded from git.

| Check | Result |
| --- | --- |
| Parser, server preview/commit, policy and trigger SSR tests | 42 passed, including the supplied workbook |
| ESLint across all changed TypeScript files | Passed, no errors or warnings |
| Production Next.js build | Passed with placeholder public auth URLs; no live database/provider configured |
| Disposable PostgreSQL migration check | Passed twice; existing rows, nullable snapshots, decimal amounts, legacy fallback and queued-message counts verified |
| Full suite on feature branch | 187 passed, 7 failed, 1 skipped |
| Full suite on unchanged main | 145 passed, the same 7 failed, 1 skipped |
| Full TypeScript check | Same 9 pre-existing errors in `lib/ebs/ebs-security.test.ts` on main and feature branch; no additional errors |
| Interactive browser, live database and SMS delivery | Pending; Chromium installation failed in this environment; no live actions performed |

The seven baseline test failures are in `lib/decision-support/excel-benchmark.test.ts` and `lib/decision-support/scheme-approval.test.ts`; they expect the unavailable `global target.xlsx` reference dataset. These and the EBS test typing errors remain merge blockers for a fully green repository check.

Targeted command (the private workbook is optional for ordinary CI):

```sh
PEGASUS_SAMPLE_FILE=/absolute/path/to/katagata.xlsx npx vitest run lib/crm/sms-import.test.ts lib/crm/sms-import-server.test.ts components/crm/pegasus-sms-import-modal.ssr.test.tsx
```

## Before merging/deployment

| Area | Exact acceptance check |
| --- | --- |
| Database | Apply `db/migrations/0068_sms_recipient_snapshots.sql` to the staging database before starting this version. It adds five nullable columns only. Confirm the deployment database is already current through migration 0067. |
| Real export | Restart the feature-branch dev server. Import the original katagata workbook; confirm 154 source rows, correct six-column mapping, July 2026, full +256 phones and exact source amounts. Check actual exclusion reasons against staging data. |
| Review | Confirm reordered headers and the downloadable sample work; malformed/missing headers fail clearly; duplicates/conflicts and scientific-notation text show the correct source rows. Edit the file/options and confirm re-review is required. |
| Draft behavior | Save a staging draft. Confirm recipient snapshots and messages match the review; customer balances/bills remain unchanged; no gateway request occurs. Confirm exclusions require acknowledgement. |
| Roles/scope | Test a creator, an approver, a view-only user and restricted scheme staff. Confirm creator-only users can save drafts, viewers cannot import, unknown/out-of-scope customers are excluded for restricted staff, and saving a draft does not bypass approval. |
| Regression | Open the customer-directory builder, select area/scheme, verify audience counts and save a draft. Confirm submission/rejection/approval controls still follow existing permissions. Verify zero/credit filtering, default thank-you messages and already-contacted exclusions. |
| SSR/dialogs | Both SMS trigger labels must be present before hydration. Open/close both dialogs with mouse and keyboard; check desktop/mobile layout, scrolling, sample-message selection and browser console for hydration errors. |
| CI | Resolve or explicitly account for the baseline reference-workbook test failures and EBS test typing errors; run full tests, typecheck and production build against the merge candidate. |

The original CRM settings hydration PR is separate. This change uses native dialog triggers for its two SMS entry points and does not modify shared trigger components.
