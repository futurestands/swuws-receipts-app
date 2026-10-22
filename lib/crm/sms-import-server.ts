import "server-only"
import { createHash } from "crypto"
import { and, eq, inArray, or } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/lib/db"
import { customer, managedTemplate, templateVersion, waterScheme } from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { canCreateSmsBatch, canViewAllData, hasPerm } from "@/lib/permissions"
import { applyCustomerScope, validateWriteScope } from "@/lib/scopes"
import { renderTemplate } from "@/lib/templates/template-engine"
import { parseSmsContacts, type SmsContact } from "./sms-import"
import { SMS_IMPORT_MAX_BYTES, SMS_PURPOSES } from "./sms-import-constants"

const optionsSchema = z.object({
  name: z.string().trim().min(1, "SMS list name is required").max(120),
  category: z.enum(SMS_PURPOSES),
  schemeId: z.string().trim().min(1).default("all"),
  messageMode: z.enum(["template", "custom"]).default("template"),
  templateId: z.string().trim().max(100).optional(),
  manualMessage: z.string().trim().max(1600).optional(),
  onlyWithBalance: z.boolean(),
})
export type SmsImportPreview = {
  previewKey: string
  format: string
  sheetName: string
  columns: { label: string; source: string }[]
  counts: { total: number; ready: number; invalid: number; duplicates: number; outsideScope: number; withoutDebt: number; unlinked: number; alreadyContacted: number; thanked: number }
  recipients: (SmsContact & { linked: boolean; message: string })[]
  issues: { rowNumber: number; reference: string; customerName: string; reason: string }[]
  issueCount: number
  issueLimit: number
}

const DEFAULT_MESSAGES = {
  "Bill Reminders": "Dear {{customer_name}}, your water account for {{period}} has an amount due of UGX {{balance}}. Please pay promptly. SWUWS.",
  "Seasonal Greetings": "Dear {{customer_name}}, season's greetings from SWUWS. Thank you for being our valued customer.",
  "Alerts": "Dear {{customer_name}}, please contact SWUWS regarding your water account {{account}}.",
}
// A Pegasus balance export contains no due date or current-bill amount.
// Do not select the meter-reading template, which requires those other fields.
const DEFAULT_CODES = { "Bill Reminders": "crm.import.balance.sms", "Seasonal Greetings": "crm.import.greeting.sms", "Alerts": "crm.import.alert.sms" }

/** One server-owned pipeline for both preview and commit. No client-validity flags are trusted. */
export async function prepareSmsImport(formData: FormData) {
  const user = await requireUser()
  if (!canCreateSmsBatch(user)) throw new Error("Forbidden")
  const file = formData.get("file")
  if (!(file instanceof File) || !file.size) throw new Error("Choose a Pegasus CSV or Excel file")
  if (!/\.(csv|xlsx)$/i.test(file.name)) throw new Error("Choose a .csv or .xlsx file")
  if (file.size > SMS_IMPORT_MAX_BYTES) throw new Error("Maximum file size is 10 MB")
  const options = optionsSchema.parse({
    name: formData.get("name"), category: formData.get("category"),
    schemeId: formData.get("schemeId") || "all", messageMode: formData.get("messageMode") || "template",
    templateId: formData.get("templateId") || undefined, manualMessage: formData.get("manualMessage") || undefined,
    onlyWithBalance: formData.get("onlyWithBalance") === "true",
  })
  if (options.messageMode === "custom" && !options.manualMessage) throw new Error("Enter your custom SMS message")
  if (options.schemeId !== "all") {
    const permission = hasPerm(user, "crm.sms.create") ? "crm.sms.create" : hasPerm(user, "crm.sms.approve") ? "crm.sms.approve" : "crm.sms.send"
    const [scheme] = await db.select({ id: waterScheme.id, active: waterScheme.active }).from(waterScheme).where(eq(waterScheme.id, options.schemeId)).limit(1)
    if (!scheme?.active || !await validateWriteScope(user, permission, { schemeId: options.schemeId })) {
      throw new Error("The selected water scheme is unavailable or outside your permitted area")
    }
  }

  const bytes = await file.arrayBuffer()
  const parsed = parseSmsContacts(bytes)
  const references = [...new Set(parsed.rows.filter(r => r.status === "ready").map(r => r.contact!.reference))]
  const matches = new Map<string, { id: string; active: boolean }[]>()
  // Pegasus MeterRef is an external customer reference, not a meter serial number.
  // Existing installations may store it in either exact identifier column. Ambiguous matches are rejected.
  for (let i = 0; i < references.length; i += 1000) {
    const chunk = references.slice(i, i + 1000)
    const found = await db.select({ id: customer.id, account: customer.customerAccount, meterRef: customer.meterRef, active: customer.active })
      .from(customer).where(and(
        or(inArray(customer.customerAccount, chunk), inArray(customer.meterRef, chunk)),
        canViewAllData(user) ? undefined : applyCustomerScope(user),
        options.schemeId === "all" ? undefined : eq(customer.waterSchemeId, options.schemeId),
      ))
    for (const row of found) {
      for (const reference of new Set([row.account, row.meterRef].filter((v): v is string => !!v))) {
        const group = matches.get(reference) || []
        if (!group.some(c => c.id === row.id)) group.push({ id: row.id, active: row.active })
        matches.set(reference, group)
      }
    }
  }

  let content = options.manualMessage || ""
  if (options.messageMode === "template") {
    const [template] = await db.select().from(managedTemplate).where(options.templateId ? eq(managedTemplate.id, options.templateId) : eq(managedTemplate.code, DEFAULT_CODES[options.category])).limit(1)
    if (template && template.type !== "SMS") throw new Error("Choose an SMS message template")
    const [version] = template?.activeVersionId ? await db.select().from(templateVersion).where(and(eq(templateVersion.id, template.activeVersionId), eq(templateVersion.templateId, template.id))).limit(1) : []
    if (options.templateId && !version) throw new Error("This SMS template has no published content. Choose another template")
    content = version?.content || DEFAULT_MESSAGES[options.category]
  }
  const allowedTokens = new Set(["customer_name", "name", "account", "customer_reference", "meter_ref", "bill_number", "period", "balance", "total_due", "amount"])
  for (const token of content.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)) {
    if (!allowedTokens.has(token[1])) throw new Error(`The message uses an unsupported field: {{${token[1]}}}. Choose another template or write a custom message using {{name}}, {{account}}, {{bill_number}}, {{period}} and {{balance}}`)
  }
  const counts = { total: parsed.rows.length, ready: 0, invalid: 0, duplicates: 0, outsideScope: 0, withoutDebt: 0, unlinked: 0, alreadyContacted: 0, thanked: 0 }
  const issues: SmsImportPreview["issues"] = []
  const eligible: { contact: SmsContact; customerId: string | null; message: string }[] = []
  for (const row of parsed.rows) {
    const reject = (reason: string) => issues.push({ rowNumber: row.rowNumber, reference: row.reference, customerName: row.customerName, reason })
    if (row.status === "invalid") { counts.invalid++; reject(row.issues.join("; ")); continue }
    if (row.status === "duplicate") { counts.duplicates++; reject(row.issues.join("; ")); continue }
    const contact = row.contact!
    const group = matches.get(contact.reference) || []
    if (group.length > 1) { counts.invalid++; reject("Customer reference matches more than one customer. Resolve the reference before importing"); continue }
    if (group[0] && !group[0].active) { counts.outsideScope++; reject("Customer is inactive"); continue }
    if (!group.length && (options.schemeId !== "all" || !canViewAllData(user))) {
      counts.outsideScope++; reject("No matching customer in the selected or permitted water schemes"); continue
    }
    if (options.onlyWithBalance && contact.balance <= 0) { counts.withoutDebt++; reject("Zero balance or credit: excluded by the amount-due filter"); continue }
    const money = contact.balance.toLocaleString("en-UG", { maximumFractionDigits: 2 })
    const message = renderTemplate(content, { customer_name: contact.customerName, name: contact.customerName, account: contact.reference, customer_reference: contact.reference, meter_ref: contact.reference, bill_number: contact.billNumber, period: contact.billingPeriod, balance: money, total_due: money, amount: money })
    if (!message.trim() || /\{\{/.test(message)) throw new Error("The message has unresolved fields. Review the message template")
    if (message.length > 1600) throw new Error("A completed SMS is longer than 1,600 characters. Shorten the message template")
    if (!group.length) counts.unlinked++
    eligible.push({ contact, customerId: group[0]?.id ?? null, message })
  }
  counts.ready = eligible.length
  const previewKey = createHash("sha256").update(new Uint8Array(bytes)).update(JSON.stringify(options)).update(JSON.stringify(eligible)).digest("hex")
  const preview: SmsImportPreview = {
    previewKey, format: parsed.format, sheetName: parsed.sheetName, columns: parsed.columns,
    counts, recipients: eligible.slice(0, 10).map(r => ({ ...r.contact, linked: !!r.customerId, message: r.message })),
    issues: issues.slice(0, 100), issueCount: issues.length, issueLimit: 100,
  }
  return { user, options, eligible, preview }
}
