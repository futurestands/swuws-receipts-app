# CRM Hub templates

Editable starting points for the CRM Hub. Change the wording and sample data
freely — nothing here is read by the application at runtime except by way of
the seed scripts you choose to run.

## 1. SMS contact list (`sms-contact-list.csv`)

Used by **CRM Hub → SMS Communications → Create contact list**.

The importer reads columns **by position, not by name** (`headerMode: "none"`
in `app/actions/crm.ts`). That means:

> **Do not add a header row.** A header row is imported as a real recipient
> and the system will try to text a phone number called
> "Customer Phone number".

| Position | Column | Required | Notes |
|---|---|---|---|
| A | Customer Ref No | no | Account number, for your own traceability |
| B | Phone number | **yes** | Minimum 9 characters |
| C | Customer Name | no | Fills `Dear {name}` in the default message |
| D | Billing Period | no | e.g. `MARCH 2026` |
| E | Outstanding Balance | no | Plain number, no commas or currency symbol |

Save as `.csv` or `.xlsx`; both are accepted. Maximum 50,000 rows per file.

### Phone number format

Write numbers in full international form (`+256770000001`). Local formats like
`0770000001` are accepted by the importer's validation but most gateways
(Africa's Talking, Twilio, Infobip) reject them, so the batch will report
every message as failed.

## 2. SMS message templates (`sms-messages.md`)

Editable copy for each managed SMS template code. Paste the final wording into
**Admin → Templates** against the matching code so it is versioned and
auditable, rather than hardcoding it.

## 3. Department and category seed (`../../db/seeds/0001_crm_bootstrap.sql`)

The CRM ticket form cannot be used until at least one department and one
complaint category exist. Edit the rows in that file to match how SWUWS
organises its service desk, then run it once:

```
psql "$DATABASE_URL" -f db/seeds/0001_crm_bootstrap.sql
```

Alternatively enter the same records by hand through
**CRM Hub → CRM Setup**.
