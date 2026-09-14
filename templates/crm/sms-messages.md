# CRM SMS message templates

Editable copy for the CRM message templates. Placeholders use the
`{{variable}}` syntax handled by `lib/templates/template-engine.ts`; an unknown
or empty placeholder renders as an empty string, so keep the sentence readable
even when a value is missing.

Enter the final wording in **Admin → Templates** against the `Code` shown for
each block. Codes already seeded by `seedSystemTemplates()` are marked
*seeded*; the rest are new codes you would need to add.

Keep each message under **160 characters** where possible — longer messages are
billed as multiple SMS by every gateway.

---

## Complaint registered (acknowledgement to the customer)

**Code:** `crm.complaint.registered.sms` *(seeded)*
**Placeholders:** `customer_name`, `ticket_id`, `category`

```
Dear {{customer_name}}, your complaint {{ticket_id}} about {{category}} has been received. We will update you shortly. SWUWS Customer Care.
```

Luganda:

```
Ssebo/Nnyabo {{customer_name}}, okwemulugunya kwo {{ticket_id}} ku {{category}} tukufunye. Tujja kukutegeeza mangu. SWUWS.
```

Runyankore-Rukiga:

```
Omukugu {{customer_name}}, okushaba kwawe {{ticket_id}} aha {{category}} twakutungire. Nitwija kukumanyisa juba. SWUWS.
```

---

## Complaint resolved

**Code:** `crm.complaint.resolved.sms` *(seeded)*
**Placeholders:** `customer_name`, `ticket_id`, `notes`

```
Dear {{customer_name}}, complaint {{ticket_id}} has been resolved: {{notes}} Thank you for your patience. SWUWS Customer Care.
```

Keep resolution notes short if this template is in use — the full note text is
substituted into the message and long notes will split the SMS.

---

## Bill reminder

**Code:** `notif.billing.sms` *(seeded — also used by the billing module)*
**Placeholders:** `customer_name`, `period`, `amount`, `total_due`, `due_date`

```
Dear {{customer_name}}, your water bill for {{period}} is USh {{amount}}. Total due USh {{total_due}}. Please pay by {{due_date}}. SWUWS.
```

This is the template used by **Send Reminders** on a billing import batch.

---

## General broadcast / notice

**Code:** `crm.bulk.general.sms` *(seeded)*
**Placeholders:** `message`

```
SWUWS NOTICE: {{message}}
```

---

## Planned supply interruption

**Code:** `crm.notice.interruption.sms` *(new)*
**Placeholders:** `scheme_name`, `date`, `start_time`, `end_time`

```
SWUWS NOTICE: Water supply in {{scheme_name}} will be interrupted on {{date}} from {{start_time}} to {{end_time}} for maintenance. We apologise for the inconvenience.
```

---

## Disconnection warning

**Code:** `crm.notice.disconnection.sms` *(new)*
**Placeholders:** `customer_name`, `total_due`, `grace_days`

```
Dear {{customer_name}}, your account is in arrears of USh {{total_due}}. Please pay within {{grace_days}} days to avoid disconnection. SWUWS.
```

---

## Payment received confirmation

**Code:** `crm.payment.received.sms` *(new)*
**Placeholders:** `customer_name`, `amount`, `receipt_number`, `balance`

```
Dear {{customer_name}}, we have received USh {{amount}}. Receipt {{receipt_number}}. New balance USh {{balance}}. Thank you. SWUWS.
```

---

## Seasonal greeting

**Code:** `crm.seasonal.greeting.sms` *(new)*
**Placeholders:** `customer_name`, `occasion`

```
Dear {{customer_name}}, SWUWS wishes you a happy {{occasion}}. Thank you for paying your water bill on time.
```
