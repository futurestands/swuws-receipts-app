# Manual payment due date for SMS uploads

The original Pegasus CSV/XLSX columns remain unchanged. The upload form accepts an optional date using a native date picker (DD/MM/YYYY guidance, ISO YYYY-MM-DD transport). It applies to that uploaded list.

Default bill reminders append a payment deadline when supplied. Managed/custom templates can place `{{due_date}}` themselves; if used, a valid date is required by server-side validation. Custom messages without that placeholder are left unchanged. Automatic payment-appreciation messages do not receive an appended demand. No date is inferred from the imported billing period.

Preview and save share the same date formatter. The ISO date is saved on `crm_sms_batch.dueDate` and in the import audit metadata. Each rendered SMS body contains its final deadline and the sender continues to use that saved body. Dates are formatted in UTC as, for example, 31 October 2026.

## Deployment prerequisite

Apply `db/migrations/0068_sms_batch_due_date.sql` before deploying this code. It adds a nullable date column and leaves historical messages unchanged. All batch reads selecting the full schema need this column, so deploying code first can break CRM queries. Test the migration in staging and confirm its presence in production through the normal migration process. This change does not apply a production migration or send messages.

Verify an original Pegasus upload with no deadline, with a deadline, with a custom due-date placeholder and with a required date left blank. Compare draft Details with the composition preview. Confirm approval and sending retain the saved date, and directory-based list creation remains unchanged. Other forensic-audit findings are not repaired by this feature.
