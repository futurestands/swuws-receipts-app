"use server"

import { db } from "@/lib/db"
import {
  crmDepartment,
  crmComplaintCategory,
  crmComplaint,
  crmSmsBatch,
  crmSmsRecord,
  customer,
  user as userTable,
  branch,
  waterScheme,
  billingRecord,
  billingPeriod,
  billingRun,
  managedTemplate,
  templateVersion
} from "@/lib/db/schema"
import { eq, and, desc, asc, sql, or, ilike, count, getTableColumns, gte, lte, inArray, ne, isNull, isNotNull } from "drizzle-orm"
import { requireUser } from "@/lib/session"
import {
  canViewCrm,
  canManageComplaints,
  canAssignComplaints,
  canSendBulkSms,
  canConfigureCrm
} from "@/lib/permissions"
import { applyCustomerScope, applySmsBatchScope, validateWriteScope } from "@/lib/scopes"
import { canViewAllData } from "@/lib/permissions"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { writeAudit } from "@/lib/audit"
import { createNotification } from "./notifications"
import {
  smsImportSchema,
  smsImportMapping,
  COMPLAINT_PRIORITIES,
  type ComplaintPriority,
} from "@/lib/crm-schemas"
import { processExcelImport } from "@/lib/import-engine"
import { sendSMS } from "@/lib/sms-service"
import { sendOperationalEmail } from "@/lib/email-service"
import { renderTemplate } from "@/lib/templates/template-engine"
import { normalizeSendablePhone } from "@/lib/phone"
import { z } from "zod"

/**
 * Resolves an SMS template's active content, falling back to the supplied
 * default when the template or its active version is missing. Keeps message
 * wording in the managed-template system (versioned, auditable) rather than
 * hardcoded at the call site.
 */
async function resolveTemplateContent(code: string, fallback: string) {
  const [template] = await db.select().from(managedTemplate).where(eq(managedTemplate.code, code)).limit(1)
  if (!template?.activeVersionId) return fallback

  const [version] = await db.select().from(templateVersion).where(eq(templateVersion.id, template.activeVersionId)).limit(1)
  return version?.content || fallback
}

/** Old CRM: remaining balance below this is treated as paid — thank, do not remind. */
const THANKS_BALANCE_THRESHOLD = 1500
const DEFAULT_BILLING_REMINDER =
  "Dear {{customer_name}}, your water bill for {{period}} is due. Balance: USh {{balance}}. SWUWS."
const DEFAULT_PAYMENT_THANKS =
  "Dear {{name}}, thank you for paying your water bill. Your account is in good standing. SWUWS."

function isThanksBalance(balance: number) {
  return Number.isFinite(balance) && balance < THANKS_BALANCE_THRESHOLD
}

const BILL_REMINDER_CATEGORY = "Bill Reminders"
const ALREADY_MESSAGED_ERROR = "Already messaged this billing period"
const CONTACTED_THIS_PERIOD = ["queued", "sent", "delivered"] as const

async function getActiveBillingPeriod() {
  const [period] = await db
    .select({
      periodName: billingPeriod.periodName,
      startDate: billingPeriod.startDate,
      endDate: billingPeriod.endDate,
    })
    .from(billingPeriod)
    .where(eq(billingPeriod.status, "active"))
    .limit(1)
  return period ?? null
}

/**
 * Accounts (or phones) that already have a bill-reminder SMS queued or sent
 * in the active billing period. Failed sends are left out so they can be retried.
 */
async function loadAlreadyContactedThisPeriod(input: {
  category: string
  period: { startDate: Date; endDate: Date } | null
  customerIds: string[]
  phones: string[]
  exceptBatchId?: string
}) {
  const contactedCustomerIds = new Set<string>()
  const contactedPhones = new Set<string>()
  if (input.category !== BILL_REMINDER_CATEGORY || !input.period) {
    return { contactedCustomerIds, contactedPhones }
  }

  const until = new Date(input.period.endDate.getTime() + 24 * 60 * 60 * 1000)
  let window = and(
    eq(crmSmsBatch.category, BILL_REMINDER_CATEGORY),
    inArray(crmSmsRecord.status, [...CONTACTED_THIS_PERIOD]),
    gte(crmSmsRecord.createdAt, input.period.startDate),
    sql`${crmSmsRecord.createdAt} < ${until}`,
  )
  if (input.exceptBatchId) {
    window = and(window, ne(crmSmsRecord.batchId, input.exceptBatchId))
  }

  const CHUNK = 500
  const pull = async (extra: ReturnType<typeof inArray>) => {
    return db
      .select({
        customerId: crmSmsRecord.customerId,
        phoneNumber: crmSmsRecord.phoneNumber,
      })
      .from(crmSmsRecord)
      .innerJoin(crmSmsBatch, eq(crmSmsRecord.batchId, crmSmsBatch.id))
      .where(and(window, extra))
  }

  for (let i = 0; i < input.customerIds.length; i += CHUNK) {
    const chunk = input.customerIds.slice(i, i + CHUNK)
    if (chunk.length === 0) continue
    const rows = await pull(inArray(crmSmsRecord.customerId, chunk))
    for (const row of rows) {
      if (row.customerId) contactedCustomerIds.add(row.customerId)
      if (row.phoneNumber) contactedPhones.add(row.phoneNumber)
    }
  }

  const leftoverPhones = input.phones.filter((p) => !contactedPhones.has(p))
  for (let i = 0; i < leftoverPhones.length; i += CHUNK) {
    const chunk = leftoverPhones.slice(i, i + CHUNK)
    if (chunk.length === 0) continue
    const rows = await pull(inArray(crmSmsRecord.phoneNumber, chunk))
    for (const row of rows) {
      if (row.customerId) contactedCustomerIds.add(row.customerId)
      if (row.phoneNumber) contactedPhones.add(row.phoneNumber)
    }
  }

  return { contactedCustomerIds, contactedPhones }
}

function wasContactedThisPeriod(
  contacted: { contactedCustomerIds: Set<string>; contactedPhones: Set<string> },
  customerId: string | null | undefined,
  phone: string,
) {
  if (customerId && contacted.contactedCustomerIds.has(customerId)) return true
  return contacted.contactedPhones.has(phone)
}

function escapeEmailHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

async function notifySenderOfUndeliveredSms(
  user: Awaited<ReturnType<typeof requireUser>>,
  batch: { id: string; name: string },
  failed: Array<{ phoneNumber: string; error: string | null }>,
) {
  if (failed.length === 0) return

  const reportable = failed.filter((row) => row.error !== ALREADY_MESSAGED_ERROR)
  if (reportable.length === 0) return

  const shown = reportable.slice(0, 200)
  const extra = reportable.length - shown.length
  const rows = shown
    .map(
      (row) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-family:monospace">${escapeEmailHtml(row.phoneNumber)}</td><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${escapeEmailHtml(row.error || "Not delivered")}</td></tr>`,
    )
    .join("")

  try {
    await sendOperationalEmail({
      to: user.email,
      subject: `SWUWS SMS: ${reportable.length} not delivered — ${batch.name}`,
      html: `
        <p>Hello ${escapeEmailHtml(user.name)},</p>
        <p>List <strong>${escapeEmailHtml(batch.name)}</strong> finished sending. ${reportable.length} number(s) were not delivered (invalid, disconnected, or rejected by the gateway).</p>
        <table style="border-collapse:collapse;font-size:14px">
          <thead><tr><th align="left" style="padding:6px 8px;border-bottom:2px solid #0f172a">Number</th><th align="left" style="padding:6px 8px;border-bottom:2px solid #0f172a">Reason</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${extra > 0 ? `<p>${extra} more not shown. Open the list in the portal for the full log.</p>` : ""}
        <p>SWUWS Collection Portal</p>
      `,
    })
  } catch (err) {
    console.error("[CRM SMS] Could not email undelivered digest:", err)
  }

  try {
    await createNotification({
      userId: user.id,
      type: "crm.sms.undelivered",
      title: `${reportable.length} SMS not delivered`,
      message: `List "${batch.name}" had ${reportable.length} number(s) the gateway could not deliver. A copy was sent to ${user.email}.`,
      relatedEntityType: "crm_sms_batch",
      relatedEntityId: batch.id,
    })
  } catch (err) {
    console.error("[CRM SMS] Could not create undelivered notification:", err)
  }
}

/**
 * Walk-in tickets have no customer row, so customer-table scope cannot
 * see them. Keep them inside the caller's territory via the branch/scheme
 * stamped on the ticket at registration.
 */
function walkInComplaintScope(user: Awaited<ReturnType<typeof requireUser>>) {
  if (user.clusterId) {
    return or(
      inArray(crmComplaint.area, sql`(SELECT id FROM branch WHERE "clusterId" = ${user.clusterId})`),
      inArray(
        crmComplaint.schemeId,
        sql`(SELECT id FROM water_scheme WHERE "branchId" IN (SELECT id FROM branch WHERE "clusterId" = ${user.clusterId}))`,
      ),
    )
  }
  if (user.branchId) {
    return or(
      eq(crmComplaint.area, user.branchId),
      inArray(crmComplaint.schemeId, sql`(SELECT id FROM water_scheme WHERE "branchId" = ${user.branchId})`),
    )
  }
  if (user.schemeId) {
    return or(
      eq(crmComplaint.schemeId, user.schemeId),
      eq(crmComplaint.area, sql`(SELECT "branchId" FROM water_scheme WHERE id = ${user.schemeId})`),
    )
  }
  return sql`false`
}

/**
 * Linked ticket (customer in scope) OR walk-in filed in this territory.
 * Callers must leftJoin customer so the customer-scope fragment is valid.
 */
function applyComplaintListScope(user: Awaited<ReturnType<typeof requireUser>>) {
  if (canViewAllData(user)) return undefined

  const customerScope = applyCustomerScope(user)
  const linked = customerScope
    ? and(isNotNull(crmComplaint.customerId), customerScope)
    : undefined
  const walkIns = and(isNull(crmComplaint.customerId), walkInComplaintScope(user))
  return linked ? or(linked, walkIns) : walkIns
}

/**
 * Loads a complaint and confirms the caller is allowed to act on it.
 *
 * canManageComplaints only answers "may this user touch the complaints
 * module", not "may this user touch *this* complaint". Without the scope
 * check a regional user could mutate any ticket org-wide by guessing ids.
 * Walk-ins are visible when their area/scheme falls in the caller's
 * territory — not only when a customer record is attached.
 */
async function requireComplaintInScope(user: Awaited<ReturnType<typeof requireUser>>, id: string) {
  if (canViewAllData(user)) {
    const [existing] = await db.select().from(crmComplaint).where(eq(crmComplaint.id, id)).limit(1)
    if (!existing) throw new Error("Complaint not found")
    return existing
  }

  const [existing] = await db
    .select(getTableColumns(crmComplaint))
    .from(crmComplaint)
    .leftJoin(customer, eq(crmComplaint.customerId, customer.id))
    .where(and(eq(crmComplaint.id, id), applyComplaintListScope(user)))
    .limit(1)

  if (!existing) throw new Error("Forbidden: complaint is outside your assigned scope")
  return existing
}

/**
 * Best-effort SMS to the complainant. Never allowed to fail the surrounding
 * action: a ticket must still be registered or resolved when the gateway is
 * down, and sendSMS() already audit-trails every attempt.
 */
async function notifyComplainant(
  templateCode: string,
  fallback: string,
  data: Record<string, string | number | null | undefined>,
  phone: string,
  userId: string,
) {
  try {
    const content = await resolveTemplateContent(templateCode, fallback)
    await sendSMS(phone, renderTemplate(content, data), userId, { auditAction: "crm.sms_sent" })
  } catch (err) {
    console.warn(`Failed to send ${templateCode} to ${phone}:`, err)
  }
}

/**
 * First-open seed so the ticket form is usable even if migration 0053 has
 * not been applied yet. Same stable ids as db/migrations/0053_crm_bootstrap_seed.sql
 * so the two paths cannot create duplicate rows.
 */
const CRM_DEPARTMENT_SEED = [
  { id: "dept-technical",  name: "Technical & Field Operations", description: "Pipe bursts, leakages, supply interruptions, meter installation and repair." },
  { id: "dept-commercial", name: "Commercial & Billing",         description: "Meter reading, bill preparation, tariffs, new connections and disconnections." },
  { id: "dept-finance",    name: "Finance & Revenue",            description: "Payment posting, receipting, refunds and account reconciliation." },
  { id: "dept-callcenter", name: "Customer Care / Call Center",  description: "First-line contact, ticket capture, follow-up and customer feedback." },
  { id: "dept-quality",    name: "Water Quality",                description: "Water safety, colour, taste, odour and contamination reports." },
  { id: "dept-admin",      name: "Administration",               description: "Staff conduct, general inquiries and anything not owned by another team." },
]

const CRM_CATEGORY_SEED = [
  { id: "cat-burst",        name: "Pipe Burst / Leakage",         description: "Visible burst or leaking pipe on the network or at the connection.", defaultHandlerDepartmentId: "dept-technical" },
  { id: "cat-no-water",     name: "No Water Supply",              description: "Customer has no water at all.",                                      defaultHandlerDepartmentId: "dept-technical" },
  { id: "cat-low-pressure", name: "Low Water Pressure",           description: "Water flows but pressure is too low to use.",                        defaultHandlerDepartmentId: "dept-technical" },
  { id: "cat-meter-fault",  name: "Faulty / Stuck Meter",         description: "Meter not turning, broken glass, or reading implausibly.",            defaultHandlerDepartmentId: "dept-technical" },
  { id: "cat-illegal",      name: "Illegal Connection Report",    description: "Report of an unauthorised connection or tampering.",                  defaultHandlerDepartmentId: "dept-technical" },
  { id: "cat-no-reading",   name: "Meter Not Read",               description: "Meter was skipped during the reading cycle.",                         defaultHandlerDepartmentId: "dept-commercial" },
  { id: "cat-no-bill",      name: "Bill Not Received",            description: "Customer did not get a bill or demand note for the period.",          defaultHandlerDepartmentId: "dept-commercial" },
  { id: "cat-wrong-bill",   name: "Wrong / Disputed Bill",        description: "Customer disputes the consumption or amount charged.",                defaultHandlerDepartmentId: "dept-commercial" },
  { id: "cat-new-conn",     name: "New Connection Request",       description: "Application for a new water connection.",                            defaultHandlerDepartmentId: "dept-commercial" },
  { id: "cat-reconnect",    name: "Disconnection / Reconnection", description: "Request or complaint about disconnection or reconnection.",           defaultHandlerDepartmentId: "dept-commercial" },
  { id: "cat-payment",      name: "Payment Not Reflected",        description: "Customer paid but the account balance has not been updated.",         defaultHandlerDepartmentId: "dept-finance" },
  { id: "cat-receipt",      name: "Receipt Not Issued",           description: "Payment made without a receipt, or receipt details are wrong.",       defaultHandlerDepartmentId: "dept-finance" },
  { id: "cat-quality",      name: "Water Quality Concern",        description: "Dirty, coloured, smelly or bad-tasting water.",                       defaultHandlerDepartmentId: "dept-quality" },
  { id: "cat-conduct",      name: "Staff Conduct",                description: "Complaint about the behaviour of staff or an agent.",                 defaultHandlerDepartmentId: "dept-admin" },
  { id: "cat-inquiry",      name: "General Inquiry",              description: "Questions about tariffs, offices, procedures or anything else.",      defaultHandlerDepartmentId: "dept-callcenter" },
]

const CRM_SMS_TEMPLATE_SEED = [
  {
    code: "crm.complaint.registered.sms",
    name: "Complaint Registration Confirmation",
    content: "Dear {{customer_name}}, your complaint {{ticket_id}} about {{category}} has been received. We will update you shortly. SWUWS Customer Care.",
  },
  {
    code: "crm.complaint.resolved.sms",
    name: "Complaint Resolution Notification",
    content: "Dear {{customer_name}}, complaint {{ticket_id}} has been resolved: {{notes}} Thank you for your patience. SWUWS Customer Care.",
  },
  {
    code: "crm.bulk.general.sms",
    name: "General Purpose SMS (Broadcast)",
    content: "SWUWS NOTICE: {{message}}",
  },
  {
    code: "crm.notice.interruption.sms",
    name: "Planned Supply Interruption",
    content: "SWUWS NOTICE: Water supply in {{scheme_name}} will be interrupted on {{date}} from {{start_time}} to {{end_time}} for maintenance. We apologise for the inconvenience.",
  },
  {
    code: "crm.notice.disconnection.sms",
    name: "Disconnection Warning",
    content: "Dear {{customer_name}}, your account is in arrears of USh {{total_due}}. Please pay within {{grace_days}} days to avoid disconnection. SWUWS.",
  },
  {
    code: "crm.payment.received.sms",
    name: "Payment Received Confirmation",
    content: "Dear {{customer_name}}, we have received USh {{amount}}. Receipt {{receipt_number}}. New balance USh {{balance}}. Thank you. SWUWS.",
  },
  {
    code: "crm.payment.thanks.sms",
    name: "Payment Appreciation (balance below USh 1,500)",
    content: "Dear {{name}}, thank you for paying your water bill. Your account is in good standing. SWUWS.",
  },
  {
    code: "crm.seasonal.greeting.sms",
    name: "Seasonal Greeting",
    content: "Dear {{customer_name}}, SWUWS wishes you a happy {{occasion}}. Thank you for paying your water bill on time.",
  },
]

async function seedCrmSmsTemplatesInternal(userId: string) {
  for (const item of CRM_SMS_TEMPLATE_SEED) {
    const [exists] = await db.select({ id: managedTemplate.id }).from(managedTemplate).where(eq(managedTemplate.code, item.code)).limit(1)
    if (exists) continue

    const tId = randomUUID()
    const vId = randomUUID()
    await db.transaction(async (tx) => {
      await tx.insert(managedTemplate).values({
        id: tId,
        code: item.code,
        name: item.name,
        category: "CRM",
        type: "SMS",
        activeVersionId: null,
      })
      await tx.insert(templateVersion).values({
        id: vId,
        templateId: tId,
        versionNumber: 1,
        content: item.content,
        status: "published",
        changelog: "Initial CRM template",
        createdById: userId,
        publishedAt: new Date(),
      })
      await tx.update(managedTemplate).set({ activeVersionId: vId }).where(eq(managedTemplate.id, tId))
    })
  }
}

/**
 * Makes the CRM usable on first open: departments, categories, and SMS
 * templates. Safe to call on every CRM page — it is a no-op once rows exist.
 */
export async function seedCrmReferenceData() {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  const [dept] = await db.select({ id: crmDepartment.id }).from(crmDepartment).limit(1)
  if (!dept) {
    const now = new Date()
    await db
      .insert(crmDepartment)
      .values(CRM_DEPARTMENT_SEED.map((row) => ({ ...row, active: true, createdAt: now, updatedAt: now })))
      .onConflictDoNothing()
  }

  const [cat] = await db.select({ id: crmComplaintCategory.id }).from(crmComplaintCategory).limit(1)
  if (!cat) {
    const now = new Date()
    await db
      .insert(crmComplaintCategory)
      .values(CRM_CATEGORY_SEED.map((row) => ({ ...row, active: true, createdAt: now, updatedAt: now })))
      .onConflictDoNothing()
  }

  await seedCrmSmsTemplatesInternal(user.id)
  return { ok: true }
}

/**
 * SMS templates CRM staff may pick when creating a contact list.
 * listTemplates() is gated on system-admin, which call-centre users do not have.
 */
export async function listCrmSmsTemplates() {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  await seedCrmSmsTemplatesInternal(user.id)

  return db
    .select({
      id: managedTemplate.id,
      code: managedTemplate.code,
      name: managedTemplate.name,
      category: managedTemplate.category,
    })
    .from(managedTemplate)
    .where(eq(managedTemplate.type, "SMS"))
    .orderBy(asc(managedTemplate.category), asc(managedTemplate.name))
}

/**
 * DEPARTMENTS
 */
/**
 * Active departments only by default, since the ticket form should never
 * offer a retired team. CRM Setup passes includeInactive so a department
 * that has been switched off is still listed there and can be switched back
 * on — previously it vanished from the only screen able to edit it.
 */
export async function listCrmDepartments(options: { includeInactive?: boolean } = {}) {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  const query = db.select().from(crmDepartment)
  if (!options.includeInactive) {
    return query.where(eq(crmDepartment.active, true)).orderBy(asc(crmDepartment.name))
  }
  return query.orderBy(asc(crmDepartment.active), asc(crmDepartment.name))
}

/**
 * AREAS / BRANCHES
 */
export async function listCrmAreas() {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  const conds = [eq(branch.active, true)]
  if (!canViewAllData(user)) {
    if (user.clusterId) conds.push(eq(branch.clusterId, user.clusterId))
    else if (user.branchId) conds.push(eq(branch.id, user.branchId))
    else if (user.schemeId) {
      conds.push(inArray(branch.id, sql`(SELECT "branchId" FROM water_scheme WHERE id = ${user.schemeId})`))
    } else {
      return []
    }
  }

  return db.select().from(branch).where(and(...conds)).orderBy(asc(branch.name))
}

/**
 * Account / name / phone lookup used by the ticket registrar so staff do
 * not retype a customer that is already on file.
 */
export async function lookupComplaintCustomer(query: string) {
  const user = await requireUser()
  if (!canManageComplaints(user)) throw new Error("Forbidden")

  const q = query.trim()
  if (q.length < 3) return []

  const customerScope = applyCustomerScope(user)
  const pattern = `%${q}%`
  const search = or(
    ilike(customer.customerAccount, pattern),
    ilike(customer.name, pattern),
    ilike(customer.phone, pattern),
    ilike(customer.meterRef, pattern),
  )

  const conds = [eq(customer.active, true), search]
  if (customerScope) conds.push(customerScope)

  return db
    .select({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      customerAccount: customer.customerAccount,
      waterSchemeId: customer.waterSchemeId,
      branchId: waterScheme.branchId,
      schemeName: waterScheme.name,
    })
    .from(customer)
    .leftJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
    .where(and(...conds))
    .orderBy(asc(customer.name))
    .limit(8)
}

/**
 * USERS BY AREA
 */
export async function listUsersByArea(branchId: string) {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  return db
    .select({
      id: userTable.id,
      name: userTable.name,
      role: userTable.role
    })
    .from(userTable)
    .where(and(
      eq(userTable.branchId, branchId),
      eq(userTable.active, true)
    ))
    .orderBy(asc(userTable.name))
}

/**
 * ALL CRM-ASSIGNABLE STAFF (org-wide, respects hierarchy scope)
 * Used by the complaints filter bar's "Staff Assigned" dropdown, which
 * needs a full list up front rather than one scoped to a single area.
 */
export async function listCrmStaff() {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  const conds = [eq(userTable.active, true)]
  if (!canViewAllData(user)) {
    if (user.branchId) conds.push(eq(userTable.branchId, user.branchId))
    else if (user.clusterId) conds.push(eq(userTable.clusterId, user.clusterId))
  }

  return db
    .select({ id: userTable.id, name: userTable.name })
    .from(userTable)
    .where(and(...conds))
    .orderBy(asc(userTable.name))
}

/**
 * SCHEMES BY AREA
 */
export async function listSchemesByArea(branchId: string) {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  return db
    .select()
    .from(waterScheme)
    .where(and(
      eq(waterScheme.branchId, branchId),
      eq(waterScheme.active, true)
    ))
    .orderBy(asc(waterScheme.name))
}

export async function upsertCrmDepartment(data: { id?: string; name: string; description?: string; active?: boolean }) {
  const user = await requireUser()
  if (!canConfigureCrm(user)) throw new Error("Forbidden")

  const id = data.id || randomUUID()
  await db
    .insert(crmDepartment)
    .values({ id, ...data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: crmDepartment.id,
      set: { ...data, updatedAt: new Date() }
    })

  revalidatePath("/dashboard/crm")
  return { ok: true }
}

/**
 * CATEGORIES
 */
/**
 * Mirrors listCrmDepartments: active-only for the ticket form, everything
 * for CRM Setup. Previously this always returned inactive categories too,
 * so switching a category off had no effect on what agents could pick.
 */
export async function listCrmComplaintCategories(options: { includeInactive?: boolean } = {}) {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  const query = db.select().from(crmComplaintCategory)
  if (!options.includeInactive) {
    return query.where(eq(crmComplaintCategory.active, true)).orderBy(asc(crmComplaintCategory.name))
  }
  return query.orderBy(asc(crmComplaintCategory.active), asc(crmComplaintCategory.name))
}

export async function upsertCrmComplaintCategory(data: { id?: string; name: string; description?: string; defaultHandlerDepartmentId?: string | null; active?: boolean }) {
  const user = await requireUser()
  if (!canConfigureCrm(user)) throw new Error("Forbidden")

  const id = data.id || randomUUID()
  await db
    .insert(crmComplaintCategory)
    .values({ id, ...data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: crmComplaintCategory.id,
      set: { ...data, updatedAt: new Date() }
    })

  revalidatePath("/dashboard/crm")
  return { ok: true }
}

/**
 * COMPLAINTS
 */
/**
 * Server-side contract for a new ticket. The register dialog validates the
 * same shape client-side, but a server action is a public HTTP endpoint —
 * it cannot rely on the browser having done so.
 */
const registerComplaintSchema = z.object({
  customerId: z.string().trim().min(1).nullish(),
  customerAccount: z.string().trim().optional(),
  complainantName: z.string().trim().min(2, "Complainant name is required"),
  complainantPhone: z.string().trim().min(9, "A contact phone number is required"),
  complainantEmail: z.string().trim().email("Invalid email address").optional().or(z.literal("")),
  complainantAddress: z.string().trim().optional(),
  area: z.string().trim().optional(),
  schemeId: z.string().trim().min(1).nullish(),
  categoryId: z.string().trim().min(1, "Category is required"),
  details: z.string().trim().min(10, "Please describe the issue in more detail"),
  language: z.string().trim().optional(),
  priority: z.enum(COMPLAINT_PRIORITIES).optional(),
  assignedToId: z.string().trim().nullish(),
  assignedDepartmentId: z.string().trim().nullish(),
})

type RegisterComplaintInput = z.input<typeof registerComplaintSchema>

/**
 * Builds a unique complaint reference.
 *
 * complaintNumber is UNIQUE, and the previous timestamp-plus-random scheme
 * had no retry — two registrations in the same millisecond surfaced a raw
 * Postgres unique violation to the agent and lost the ticket. A short retry
 * loop against the real table is cheap and removes that failure mode.
 */
async function generateComplaintNumber(attempt = 0): Promise<string> {
  const stamp = Date.now().toString().slice(-6)
  const suffix = Math.floor(Math.random() * 100000).toString().padStart(5, "0")
  const candidate = `COMP-${stamp}-${suffix}`

  const [clash] = await db
    .select({ id: crmComplaint.id })
    .from(crmComplaint)
    .where(eq(crmComplaint.complaintNumber, candidate))
    .limit(1)

  if (!clash) return candidate
  if (attempt >= 5) throw new Error("Could not allocate a complaint reference, please retry")
  return generateComplaintNumber(attempt + 1)
}

export async function registerComplaint(input: RegisterComplaintInput) {
  const user = await requireUser()
  if (!canManageComplaints(user)) throw new Error("Forbidden")

  const parsed = registerComplaintSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid complaint details")
  }
  const data = parsed.data

  const assignedToId = data.assignedToId && data.assignedToId !== "unassigned" ? data.assignedToId : null
  const schemeId = data.schemeId || null
  const area = data.area || undefined

  // HIERARCHY SCOPING: a ticket must be filed inside the caller's own
  // territory. Without this an area-level user could log complaints against
  // any other area by posting a different branch id.
  //
  // Bypassed for global-data users so writes match reads: everywhere else in
  // this module canViewAllData means "the whole organisation", and an HQ
  // user who can see every ticket must be able to log one anywhere.
  if ((area || schemeId) && !canViewAllData(user)) {
    const allowed = await validateWriteScope(user, "crm.complaints.manage", {
      branchId: area ?? null,
      schemeId,
    })
    if (!allowed) throw new Error("You are not authorized to register tickets for that area or scheme")
  }

  let customerId = data.customerId || null
  const customerScope = applyCustomerScope(user)

  // Resolve / verify the customer inside the caller's hierarchy. An unscoped
  // account lookup used to attach tickets to customers in other areas.
  // Unknown accounts stay walk-in — staff still log the visit instead of
  // being blocked because the person is not yet on the customer file.
  if (!customerId && data.customerAccount) {
    const accountConds = [eq(customer.customerAccount, data.customerAccount)]
    if (customerScope) accountConds.push(customerScope)
    const [c] = await db
      .select({ id: customer.id })
      .from(customer)
      .where(and(...accountConds))
      .limit(1)
    if (c) customerId = c.id
  } else if (customerId) {
    const idConds = [eq(customer.id, customerId)]
    if (customerScope) idConds.push(customerScope)
    const [c] = await db
      .select({ id: customer.id })
      .from(customer)
      .where(and(...idConds))
      .limit(1)
    if (!c) throw new Error("Customer not found or you are not authorized to file a ticket for this account")
  }

  const id = randomUUID()
  const complaintNumber = await generateComplaintNumber()

  // Find category to get default department if not provided
  const [category] = await db.select().from(crmComplaintCategory).where(eq(crmComplaintCategory.id, data.categoryId)).limit(1)
  if (!category) throw new Error("Selected category no longer exists")
  if (!category.active) throw new Error("Selected category is no longer in use")

  const deptId = data.assignedDepartmentId || category.defaultHandlerDepartmentId

  const status = assignedToId ? "assigned" : "open"
  const priority = data.priority || "medium"

  await db.insert(crmComplaint).values({
    id,
    complaintNumber,
    customerId,
    complainantName: data.complainantName,
    complainantPhone: data.complainantPhone,
    complainantEmail: data.complainantEmail || null,
    complainantAddress: data.complainantAddress,
    area,
    schemeId,
    categoryId: data.categoryId,
    details: data.details,
    language: data.language || "English",
    // priority was previously omitted from this insert, so every ticket
    // saved as the column default regardless of what the agent selected.
    priority,
    assignedDepartmentId: deptId,
    assignedToId,
    status: status,
    updatedAt: new Date()
  })

  // Acknowledge to the customer. The template has existed since the CRM was
  // built but nothing ever sent it, so complainants received no confirmation.
  await notifyComplainant(
    "crm.complaint.registered.sms",
    "Dear {{customer_name}}, your complaint {{ticket_id}} about {{category}} has been received. We will update you shortly. SWUWS Customer Care.",
    { customer_name: data.complainantName, ticket_id: complaintNumber, category: category.name },
    data.complainantPhone,
    user.id,
  )

  // Create notification for assigned person if any
  if (assignedToId) {
    try {
      // Complaint priority ("low"|"medium"|"high"|"critical") and notification
      // priority ("low"|"normal"|"high"|"critical") are different vocabularies --
      // map explicitly rather than passing complaint priority straight through
      // (the previous code passed it through raw, which doesn't compile since
      // "medium" isn't a valid notification priority).
      const notificationPriority = priority === "medium" ? "normal" : priority
      await createNotification({
        userId: assignedToId,
        type: "crm_complaint_assigned",
        title: "New Complaint Assigned",
        message: `You have been assigned complaint ${complaintNumber}: ${data.details.slice(0, 50)}...`,
        priority: notificationPriority,
        relatedEntityType: "crm_complaint",
        relatedEntityId: id
      })
    } catch (err) {
      console.warn("Failed to create assignment notification:", err)
    }
  }

  await writeAudit({
    user,
    action: "crm.complaint.register",
    entityType: "crm_complaint",
    entityId: id,
    details: { complaintNumber, assignedToId, priority }
  })

  revalidatePath("/dashboard/crm/complaints")
  if (customerId) revalidatePath(`/dashboard/customers/${customerId}`)
  return { ok: true, complaintNumber }
}

export async function listComplaints(params: {
  page: number;
  limit: number;
  status?: string;
  priority?: string;
  search?: string;
  departmentId?: string;
  categoryId?: string;
  area?: string;
  staffId?: string;
  from?: string;
  till?: string;
  complaintNumber?: string;
  excludeClosed?: boolean;
}) {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  const offset = (params.page - 1) * params.limit
  const conds = []

  if (params.status === "working") {
    conds.push(inArray(crmComplaint.status, ["assigned", "in_progress"]))
  } else if (params.status && params.status !== "all") {
    conds.push(eq(crmComplaint.status, params.status))
  }
  if (params.excludeClosed) conds.push(ne(crmComplaint.status, "closed"))
  if (params.priority && params.priority !== "all") conds.push(eq(crmComplaint.priority, params.priority))
  if (params.departmentId && params.departmentId !== "all") conds.push(eq(crmComplaint.assignedDepartmentId, params.departmentId))
  if (params.categoryId && params.categoryId !== "all") conds.push(eq(crmComplaint.categoryId, params.categoryId))
  if (params.area && params.area !== "all") conds.push(eq(crmComplaint.area, params.area))
  if (params.staffId && params.staffId !== "all") conds.push(eq(crmComplaint.assignedToId, params.staffId))
  if (params.from) conds.push(gte(crmComplaint.createdAt, new Date(params.from)))
  if (params.till) {
     const end = new Date(params.till)
     end.setHours(23, 59, 59, 999)
     conds.push(lte(crmComplaint.createdAt, end))
  }
  if (params.complaintNumber) conds.push(ilike(crmComplaint.complaintNumber, `%${params.complaintNumber}%`))

  if (params.search) {
    const q = `%${params.search}%`
    conds.push(or(
      ilike(crmComplaint.complaintNumber, q),
      ilike(crmComplaint.complainantName, q),
      ilike(crmComplaint.complainantPhone, q),
      ilike(crmComplaint.details, q),
      ilike(customer.customerAccount, q),
    ))
  }

  const territory = applyComplaintListScope(user)
  if (territory) conds.push(territory)

  const whereClause = conds.length ? and(...conds) : undefined

  const [totalRes] = await db
    .select({ count: count() })
    .from(crmComplaint)
    .leftJoin(customer, eq(crmComplaint.customerId, customer.id))
    .where(whereClause)

  const rows = await db
    .select({
      ...getTableColumns(crmComplaint),
      categoryName: crmComplaintCategory.name,
      departmentName: crmDepartment.name,
      assignedToName: userTable.name,
      customerAccount: customer.customerAccount,
      areaName: branch.name,
      schemeName: waterScheme.name,
    })
    .from(crmComplaint)
    .leftJoin(crmComplaintCategory, eq(crmComplaint.categoryId, crmComplaintCategory.id))
    .leftJoin(crmDepartment, eq(crmComplaint.assignedDepartmentId, crmDepartment.id))
    .leftJoin(userTable, eq(crmComplaint.assignedToId, userTable.id))
    .leftJoin(branch, eq(crmComplaint.area, branch.id))
    .leftJoin(customer, eq(crmComplaint.customerId, customer.id))
    .leftJoin(waterScheme, eq(crmComplaint.schemeId, waterScheme.id))
    .where(whereClause)
    .orderBy(desc(crmComplaint.createdAt))
    .limit(params.limit)
    .offset(offset)

  return {
    complaints: rows,
    total: Number(totalRes?.count || 0),
    page: params.page,
    totalPages: Math.ceil(Number(totalRes?.count || 0) / params.limit)
  }
}

export async function listComplaintsForCustomer(customerId: string) {
  const user = await requireUser()
  if (!canViewCrm(user)) return []

  const customerScope = applyCustomerScope(user)
  const idConds = [eq(customer.id, customerId)]
  if (customerScope) idConds.push(customerScope)
  const [owned] = await db.select({ id: customer.id }).from(customer).where(and(...idConds)).limit(1)
  if (!owned) return []

  return db
    .select({
      id: crmComplaint.id,
      complaintNumber: crmComplaint.complaintNumber,
      status: crmComplaint.status,
      priority: crmComplaint.priority,
      createdAt: crmComplaint.createdAt,
      categoryName: crmComplaintCategory.name,
    })
    .from(crmComplaint)
    .leftJoin(crmComplaintCategory, eq(crmComplaint.categoryId, crmComplaintCategory.id))
    .where(eq(crmComplaint.customerId, customerId))
    .orderBy(desc(crmComplaint.createdAt))
    .limit(20)
}

/**
 * COMPLAINTS REPORTING (Phase 6)
 */
/** Hard ceiling so an unfiltered report cannot pull the whole table. */
const REPORT_ROW_LIMIT = 5000

export async function getComplaintReports(params: {
  from?: string;
  till?: string;
  status?: string;
  district?: string;
  category?: string;
  staff?: string;
  priority?: string;
}) {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  const conds = []
  if (params.from) conds.push(gte(crmComplaint.createdAt, new Date(params.from)))
  if (params.till) {
    // Inclusive of the whole end day, matching listComplaints. Previously a
    // "till" of today returned nothing logged today.
    const end = new Date(params.till)
    end.setHours(23, 59, 59, 999)
    conds.push(lte(crmComplaint.createdAt, end))
  }
  if (params.status && params.status !== "all") conds.push(eq(crmComplaint.status, params.status))
  if (params.category && params.category !== "all") conds.push(eq(crmComplaint.categoryId, params.category))
  if (params.staff && params.staff !== "all") conds.push(eq(crmComplaint.assignedToId, params.staff))
  if (params.priority && params.priority !== "all") conds.push(eq(crmComplaint.priority, params.priority))

  // District filtering depends on hierarchy (Area/Branch)
  if (params.district && params.district !== "all") {
    conds.push(eq(crmComplaint.area, params.district))
  }

  const territory = applyComplaintListScope(user)
  if (territory) conds.push(territory)
  const whereClause = conds.length ? and(...conds) : undefined

  const rows = await db
    .select({
      ...getTableColumns(crmComplaint),
      categoryName: crmComplaintCategory.name,
      departmentName: crmDepartment.name,
      assignedToName: userTable.name,
      customerAccount: customer.customerAccount,
      areaName: branch.name,
      schemeName: waterScheme.name,
    })
    .from(crmComplaint)
    .leftJoin(crmComplaintCategory, eq(crmComplaint.categoryId, crmComplaintCategory.id))
    .leftJoin(crmDepartment, eq(crmComplaint.assignedDepartmentId, crmDepartment.id))
    .leftJoin(userTable, eq(crmComplaint.assignedToId, userTable.id))
    .leftJoin(branch, eq(crmComplaint.area, branch.id))
    .leftJoin(customer, eq(crmComplaint.customerId, customer.id))
    .leftJoin(waterScheme, eq(crmComplaint.schemeId, waterScheme.id))
    .where(whereClause)
    .orderBy(desc(crmComplaint.createdAt))
    .limit(REPORT_ROW_LIMIT)

  return { rows, summary: summariseComplaints(rows) }
}

type ReportRow = {
  status: string
  priority: string
  categoryName: string | null
  areaName: string | null
  assignedToName: string | null
  createdAt: Date
  resolvedAt: Date | null
}

/**
 * Aggregates the report rows the page actually needs. The hub advertises
 * response-time and category analysis, but this action only ever returned a
 * flat row list, so there was nothing to analyse.
 */
function summariseComplaints(rows: ReportRow[]) {
  const tally = (key: (row: ReportRow) => string) => {
    const counts = new Map<string, number>()
    for (const row of rows) {
      const value = key(row)
      counts.set(value, (counts.get(value) || 0) + 1)
    }
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
  }

  const resolutionHours = rows
    .filter((row) => row.resolvedAt)
    .map((row) => (row.resolvedAt!.getTime() - row.createdAt.getTime()) / 3_600_000)
    .filter((hours) => Number.isFinite(hours) && hours >= 0)
    .sort((a, b) => a - b)

  const average = resolutionHours.length
    ? resolutionHours.reduce((sum, hours) => sum + hours, 0) / resolutionHours.length
    : null

  return {
    total: rows.length,
    truncated: rows.length >= REPORT_ROW_LIMIT,
    open: rows.filter((row) => row.status === "open").length,
    inProgress: rows.filter((row) => row.status === "assigned" || row.status === "in_progress").length,
    resolved: rows.filter((row) => row.status === "resolved").length,
    closed: rows.filter((row) => row.status === "closed").length,
    byStatus: tally((row) => row.status),
    byPriority: tally((row) => row.priority),
    byCategory: tally((row) => row.categoryName || "Uncategorised"),
    byArea: tally((row) => row.areaName || "Unspecified"),
    byStaff: tally((row) => row.assignedToName || "Unassigned"),
    resolutionCount: resolutionHours.length,
    avgResolutionHours: average,
    medianResolutionHours: resolutionHours.length
      ? resolutionHours[Math.floor(resolutionHours.length / 2)]
      : null,
  }
}

/**
 * Assigns or reassigns a ticket, and optionally re-prioritises it.
 *
 * The crm.complaints.assign permission and canAssignComplaints() have
 * existed since the module was written but nothing called them, so a ticket
 * saved as "LOG ONLY" or handed to the wrong person could never be moved.
 */
export async function assignComplaint(id: string, input: {
  assignedToId?: string | null;
  assignedDepartmentId?: string | null;
  priority?: ComplaintPriority;
}) {
  const user = await requireUser()
  if (!canAssignComplaints(user)) throw new Error("Forbidden")

  const existing = await requireComplaintInScope(user, id)
  if (existing.status === "closed") throw new Error("Reopen the ticket before reassigning it")

  const assignedToId = input.assignedToId && input.assignedToId !== "unassigned" ? input.assignedToId : null

  // Handing a ticket to someone outside your own territory would be a way
  // around the scoping everywhere else in this module.
  if (assignedToId) {
    const [target] = await db
      .select({ id: userTable.id, clusterId: userTable.clusterId, branchId: userTable.branchId, schemeId: userTable.schemeId, active: userTable.active })
      .from(userTable)
      .where(eq(userTable.id, assignedToId))
      .limit(1)

    if (!target) throw new Error("Selected staff member not found")
    if (!target.active) throw new Error("Selected staff member is deactivated")

    // Same bypass rationale as registerComplaint: global-data users are
    // treated as org-wide throughout this module.
    const allowed = canViewAllData(user) || await validateWriteScope(user, "crm.complaints.assign", {
      clusterId: target.clusterId,
      branchId: target.branchId,
      schemeId: target.schemeId,
    })
    if (!allowed) throw new Error("You are not authorized to assign tickets to that staff member")
  }

  // An unresolved ticket that gains an owner becomes "assigned"; one that
  // loses its owner falls back to "open". Work already in progress or
  // resolved keeps its status so reassignment does not rewind the lifecycle.
  const status =
    existing.status === "open" || existing.status === "assigned"
      ? assignedToId
        ? "assigned"
        : "open"
      : existing.status

  await db.update(crmComplaint)
    .set({
      assignedToId,
      assignedDepartmentId: input.assignedDepartmentId ?? existing.assignedDepartmentId,
      ...(input.priority ? { priority: input.priority } : {}),
      status,
      updatedAt: new Date(),
    })
    .where(eq(crmComplaint.id, id))

  if (assignedToId && assignedToId !== existing.assignedToId) {
    try {
      const priority = input.priority || existing.priority
      await createNotification({
        userId: assignedToId,
        type: "crm_complaint_assigned",
        title: "Complaint Assigned To You",
        message: `You have been assigned complaint ${existing.complaintNumber}: ${existing.details.slice(0, 50)}...`,
        priority: priority === "medium" ? "normal" : (priority as "low" | "high" | "critical"),
        relatedEntityType: "crm_complaint",
        relatedEntityId: id,
      })
    } catch (err) {
      console.warn("Failed to create assignment notification:", err)
    }
  }

  await writeAudit({
    user,
    action: "crm.complaint.assign",
    entityType: "crm_complaint",
    entityId: id,
    details: {
      complaintNumber: existing.complaintNumber,
      from: existing.assignedToId,
      to: assignedToId,
      ...(input.priority ? { priority: input.priority } : {}),
    },
  })

  revalidatePath("/dashboard/crm/complaints")
  return { ok: true }
}

/**
 * Moves a ticket to in_progress. The schema has always documented this
 * status but nothing could reach it, so the board could only show
 * "untouched" or "finished" with nothing in between.
 */
export async function startComplaint(id: string) {
  const user = await requireUser()
  if (!canManageComplaints(user)) throw new Error("Forbidden")

  const existing = await requireComplaintInScope(user, id)
  if (existing.status === "resolved" || existing.status === "closed") {
    throw new Error("This ticket has already been completed")
  }

  await db.update(crmComplaint)
    .set({
      status: "in_progress",
      // Picking up an unassigned ticket makes the actor its owner, so the
      // board never shows work in progress with nobody against it.
      assignedToId: existing.assignedToId ?? user.id,
      updatedAt: new Date(),
    })
    .where(eq(crmComplaint.id, id))

  await writeAudit({
    user,
    action: "crm.complaint.start",
    entityType: "crm_complaint",
    entityId: id,
    details: { complaintNumber: existing.complaintNumber },
  })

  revalidatePath("/dashboard/crm/complaints")
  return { ok: true }
}

export async function resolveComplaint(id: string, notes: string) {
  const user = await requireUser()
  if (!canManageComplaints(user)) throw new Error("Forbidden")

  const trimmed = notes?.trim()
  if (!trimmed) throw new Error("Resolution notes are required")

  const existing = await requireComplaintInScope(user, id)

  await db.update(crmComplaint)
    .set({
      status: "resolved",
      resolutionNotes: trimmed,
      resolvedAt: new Date(),
      resolvedById: user.id,
      updatedAt: new Date()
    })
    .where(eq(crmComplaint.id, id))

  // Tell the customer their issue is closed out — the other half of the
  // acknowledgement sent at registration.
  await notifyComplainant(
    "crm.complaint.resolved.sms",
    "Dear {{customer_name}}, complaint {{ticket_id}} has been resolved: {{notes}} Thank you for your patience. SWUWS Customer Care.",
    { customer_name: existing.complainantName, ticket_id: existing.complaintNumber, notes: trimmed },
    existing.complainantPhone,
    user.id,
  )

  await writeAudit({
    user,
    action: "crm.complaint.resolve",
    entityType: "crm_complaint",
    entityId: id,
    details: { complaintNumber: existing.complaintNumber, notes: trimmed }
  })

  revalidatePath("/dashboard/crm/complaints")
  return { ok: true }
}

export async function closeComplaint(id: string) {
  const user = await requireUser()
  if (!canManageComplaints(user)) throw new Error("Forbidden")

  const existing = await requireComplaintInScope(user, id)

  await db.update(crmComplaint)
    .set({
      status: "closed",
      updatedAt: new Date()
    })
    .where(eq(crmComplaint.id, id))

  await writeAudit({
    user,
    action: "crm.complaint.close",
    entityType: "crm_complaint",
    entityId: id,
    details: { complaintNumber: existing.complaintNumber, status: "closed" }
  })

  revalidatePath("/dashboard/crm/complaints")
  return { ok: true }
}

/**
 * Sends a resolved or closed ticket back into the queue. Status previously
 * only moved forward, so a customer calling back about the same unresolved
 * issue needed an entirely new ticket number.
 */
export async function reopenComplaint(id: string, reason: string) {
  const user = await requireUser()
  if (!canManageComplaints(user)) throw new Error("Forbidden")

  const trimmed = reason?.trim()
  if (!trimmed) throw new Error("Please say why the ticket is being reopened")

  const existing = await requireComplaintInScope(user, id)
  if (existing.status !== "resolved" && existing.status !== "closed") {
    throw new Error("This ticket is already open")
  }

  await db.update(crmComplaint)
    .set({
      status: existing.assignedToId ? "assigned" : "open",
      // Keep the original resolution text for the record and append why it
      // was not accepted, rather than silently discarding history.
      resolutionNotes: existing.resolutionNotes
        ? `${existing.resolutionNotes}\n\n--- Reopened by ${user.name}: ${trimmed}`
        : `Reopened by ${user.name}: ${trimmed}`,
      resolvedAt: null,
      resolvedById: null,
      updatedAt: new Date(),
    })
    .where(eq(crmComplaint.id, id))

  await writeAudit({
    user,
    action: "crm.complaint.reopen",
    entityType: "crm_complaint",
    entityId: id,
    details: { complaintNumber: existing.complaintNumber, reason: trimmed },
  })

  revalidatePath("/dashboard/crm/complaints")
  return { ok: true }
}

/**
 * SMS COMMUNICATION
 */
export async function importSmsBatch(formData: FormData) {
  const user = await requireUser()
  if (!canSendBulkSms(user)) throw new Error("Forbidden")

  const file = formData.get("file") as File
  const name = formData.get("name") as string
  const category = formData.get("category") as string
  const templateId = formData.get("templateId") as string || undefined
  const manualMessage = formData.get("manualMessage") as string || undefined
  const schemeId = formData.get("schemeId") as string || "all"

  if (!file) throw new Error("File is required")
  if (!name?.trim()) throw new Error("List name is required")

  const summary = await processExcelImport({
    file,
    schema: smsImportSchema,
    mapping: smsImportMapping,
    headerMode: "none"
  })

  if (summary.validRows === 0) {
    throw new Error("No valid rows found in the imported file")
  }

  const validRows = summary.rows.filter(r => r.valid).map(r => r.data)

  // Link rows to real customers via the account number in column A. Records
  // used to be stored with no customerId at all, which is also what made
  // the scheme filter below impossible.
  const accounts = [...new Set(validRows.map(r => r.customerRef?.trim()).filter((v): v is string => !!v))]
  const customerByAccount = new Map<string, { id: string; waterSchemeId: string | null }>()
  if (accounts.length > 0) {
    const CHUNK = 1000
    for (let i = 0; i < accounts.length; i += CHUNK) {
      const found = await db
        .select({ id: customer.id, account: customer.customerAccount, waterSchemeId: customer.waterSchemeId })
        .from(customer)
        .where(inArray(customer.customerAccount, accounts.slice(i, i + CHUNK)))
      for (const row of found) {
        if (row.account) customerByAccount.set(row.account, { id: row.id, waterSchemeId: row.waterSchemeId })
      }
    }
  }

  // The "Target Water Scheme" dropdown was previously read and then ignored,
  // so operators believed a campaign had been narrowed when it had not.
  const targetSchemeId = schemeId && schemeId !== "all" ? schemeId : null
  const scoped = targetSchemeId
    ? validRows.filter(r => {
        const match = r.customerRef ? customerByAccount.get(r.customerRef.trim()) : undefined
        return match?.waterSchemeId === targetSchemeId
      })
    : validRows

  if (scoped.length === 0) {
    throw new Error("No rows in this file belong to the selected water scheme")
  }

  // Message body: explicit custom text, an explicitly chosen template, or
  // the managed billing SMS template. In all three cases the content goes
  // through the template engine, so {{placeholders}} are substituted --
  // custom messages used to be stored verbatim and customers received the
  // literal text "{{name}}".
  let content = manualMessage?.trim() || null
  if (!content && templateId) {
    const [chosen] = await db.select().from(managedTemplate).where(eq(managedTemplate.id, templateId)).limit(1)
    if (chosen?.activeVersionId) {
      const [version] = await db.select().from(templateVersion).where(eq(templateVersion.id, chosen.activeVersionId)).limit(1)
      content = version?.content || null
    }
  }
  if (!content) {
    content = await resolveTemplateContent("notif.billing.sms", DEFAULT_BILLING_REMINDER)
  }

  const autoThanks = !manualMessage?.trim() && !templateId
  const thanksContent = autoThanks
    ? await resolveTemplateContent("crm.payment.thanks.sms", DEFAULT_PAYMENT_THANKS)
    : null

  const period = await getActiveBillingPeriod()
  const prePhones: string[] = []
  const preCustomerIds: string[] = []
  for (const row of scoped) {
    const phoneNumber = normalizeSendablePhone(String(row.phoneNumber))
    if (!phoneNumber) continue
    prePhones.push(phoneNumber)
    const linked = row.customerRef ? customerByAccount.get(row.customerRef.trim())?.id : undefined
    if (linked) preCustomerIds.push(linked)
  }
  const contacted = await loadAlreadyContactedThisPeriod({
    category,
    period,
    customerIds: preCustomerIds,
    phones: prePhones,
  })

  const batchId = randomUUID()
  const records: Array<typeof crmSmsRecord.$inferInsert> = []
  let skippedNumbers = 0
  let thanked = 0
  let alreadyContacted = 0

  for (const row of scoped) {
    const phoneNumber = normalizeSendablePhone(String(row.phoneNumber))
    if (!phoneNumber) {
      skippedNumbers++
      continue
    }

    const customerId = row.customerRef ? customerByAccount.get(row.customerRef.trim())?.id ?? null : null
    if (wasContactedThisPeriod(contacted, customerId, phoneNumber)) {
      alreadyContacted++
      continue
    }

    const customerName = row.customerName || "Customer"
    const balance = Number(row.balance ?? 0)
    const useThanks = Boolean(thanksContent) && isThanksBalance(balance)
    if (useThanks) thanked++
    records.push({
      id: randomUUID(),
      batchId,
      customerId,
      phoneNumber,
      message: renderTemplate(useThanks && thanksContent ? thanksContent : content, {
        customer_name: customerName,
        // The import modal advertises {{name}}, so accept both spellings.
        name: customerName,
        account: row.customerRef || "",
        period: row.billingPeriod || period?.periodName || "",
        balance,
        total_due: balance,
        amount: balance,
      }),
      status: "queued" as const,
      updatedAt: new Date(),
    })
  }

  if (records.length === 0) {
    if (alreadyContacted > 0 && skippedNumbers === 0) {
      throw new Error(
        period
          ? `Everyone in this file was already messaged this billing period (${period.periodName})`
          : "Everyone in this file was already messaged this billing period",
      )
    }
    throw new Error("None of the phone numbers in this file could be used")
  }

  await db.transaction(async (tx) => {
    await tx.insert(crmSmsBatch).values({
      id: batchId,
      name: name.trim(),
      category,
      templateId: templateId || null,
      status: "pending",
      totalMessages: records.length,
      createdById: user.id,
      updatedAt: new Date()
    })

    const CHUNK = 500
    for (let i = 0; i < records.length; i += CHUNK) {
      await tx.insert(crmSmsRecord).values(records.slice(i, i + CHUNK))
    }
  })

  await writeAudit({
    user,
    action: "crm.sms.import",
    entityType: "crm_sms_batch",
    entityId: batchId,
    details: { name: name.trim(), category, queued: records.length, schemeId: targetSchemeId, skippedNumbers, thanked, alreadyContacted },
  })

  revalidatePath("/dashboard/crm/sms")
  return {
    ok: true,
    batchId,
    summary: {
      total: summary.totalRows,
      valid: summary.validRows,
      queued: records.length,
      skippedNumbers,
      filteredByScheme: validRows.length - scoped.length,
      thanked,
      alreadyContacted,
    },
  }
}

const SMS_AUDIENCE_CAP = 50_000

function smsAudienceConditions(
  user: Awaited<ReturnType<typeof requireUser>>,
  schemeId?: string | null,
  branchId?: string | null,
) {
  const conditions = [
    eq(customer.active, true),
    sql`coalesce(trim(${customer.phone}), '') <> ''`,
  ]
  const scope = applyCustomerScope(user)
  if (scope) conditions.push(scope)
  if (schemeId && schemeId !== "all") {
    conditions.push(eq(customer.waterSchemeId, schemeId))
  } else if (branchId && branchId !== "all") {
    conditions.push(eq(waterScheme.branchId, branchId))
  } else {
    return null
  }
  return conditions
}

/**
 * How many active customers with a phone number sit in the selected scheme or area.
 */
export async function countSmsAudience(params: { schemeId?: string; branchId?: string; category?: string }) {
  const user = await requireUser()
  if (!canSendBulkSms(user)) throw new Error("Forbidden")

  const conditions = smsAudienceConditions(user, params.schemeId, params.branchId)
  if (!conditions) return { count: 0, skipped: 0, alreadyContacted: 0 }

  const rows = await db
    .select({ id: customer.id, phone: customer.phone })
    .from(customer)
    .innerJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
    .where(and(...conditions))

  const period = await getActiveBillingPeriod()
  const sendableRows: Array<{ id: string; phone: string }> = []
  let skipped = 0
  for (const row of rows) {
    const phone = normalizeSendablePhone(String(row.phone))
    if (!phone) {
      skipped++
      continue
    }
    sendableRows.push({ id: row.id, phone })
  }

  const contacted = await loadAlreadyContactedThisPeriod({
    category: params.category || BILL_REMINDER_CATEGORY,
    period,
    customerIds: sendableRows.map((r) => r.id),
    phones: sendableRows.map((r) => r.phone),
  })

  let alreadyContacted = 0
  let count = 0
  for (const row of sendableRows) {
    if (wasContactedThisPeriod(contacted, row.id, row.phone)) alreadyContacted++
    else count++
  }

  return { count, skipped, alreadyContacted }
}

/**
 * Build a contact list from customers already on the selected scheme or area.
 * No CSV. Phones come from the customer record; balance is the live EBS figure.
 */
export async function createSmsBatchFromCustomers(input: {
  name: string
  category: string
  schemeId?: string
  branchId?: string
  templateId?: string
  manualMessage?: string
}) {
  const user = await requireUser()
  if (!canSendBulkSms(user)) throw new Error("Forbidden")

  const schemeId = input.schemeId && input.schemeId !== "all" ? input.schemeId : null
  const branchId = input.branchId && input.branchId !== "all" ? input.branchId : null
  const conditions = smsAudienceConditions(user, schemeId, branchId)
  if (!conditions) {
    throw new Error("Select a water scheme or an area first")
  }

  let scopeName = "selected area"
  if (schemeId) {
    const [scheme] = await db.select({ name: waterScheme.name }).from(waterScheme).where(eq(waterScheme.id, schemeId)).limit(1)
    scopeName = scheme?.name || "scheme"
  } else if (branchId) {
    const [area] = await db.select({ name: branch.name }).from(branch).where(eq(branch.id, branchId)).limit(1)
    scopeName = area?.name || "area"
  }

  const listName = input.name.trim() || `${scopeName} · ${new Date().toISOString().slice(0, 10)}`

  const period = await getActiveBillingPeriod()

  let content = input.manualMessage?.trim() || null
  if (!content && input.templateId) {
    const [chosen] = await db.select().from(managedTemplate).where(eq(managedTemplate.id, input.templateId)).limit(1)
    if (chosen?.activeVersionId) {
      const [version] = await db.select().from(templateVersion).where(eq(templateVersion.id, chosen.activeVersionId)).limit(1)
      content = version?.content || null
    }
  }
  if (!content) {
    content = await resolveTemplateContent("notif.billing.sms", DEFAULT_BILLING_REMINDER)
  }

  const autoThanks = !input.manualMessage?.trim() && !input.templateId
  const thanksContent = autoThanks
    ? await resolveTemplateContent("crm.payment.thanks.sms", DEFAULT_PAYMENT_THANKS)
    : null

  const customers = await db
    .select({
      id: customer.id,
      name: customer.name,
      account: customer.customerAccount,
      phone: customer.phone,
      balance: customer.accountBalance,
    })
    .from(customer)
    .innerJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
    .where(and(...conditions))

  if (customers.length === 0) {
    throw new Error(`No active customers with a phone number in ${scopeName}`)
  }
  if (customers.length > SMS_AUDIENCE_CAP) {
    throw new Error(`This selection has ${customers.length} customers. Choose a single scheme instead of the whole area.`)
  }

  const sendablePreview: Array<{ id: string; phone: string }> = []
  for (const row of customers) {
    const phoneNumber = normalizeSendablePhone(String(row.phone))
    if (phoneNumber) sendablePreview.push({ id: row.id, phone: phoneNumber })
  }
  const contacted = await loadAlreadyContactedThisPeriod({
    category: input.category,
    period,
    customerIds: sendablePreview.map((r) => r.id),
    phones: sendablePreview.map((r) => r.phone),
  })

  const batchId = randomUUID()
  const records: Array<typeof crmSmsRecord.$inferInsert> = []
  let skippedNumbers = 0
  let thanked = 0
  let alreadyContacted = 0

  for (const row of customers) {
    const phoneNumber = normalizeSendablePhone(String(row.phone))
    if (!phoneNumber) {
      skippedNumbers++
      continue
    }
    if (wasContactedThisPeriod(contacted, row.id, phoneNumber)) {
      alreadyContacted++
      continue
    }
    const customerName = row.name || "Customer"
    const balance = Number(row.balance || 0)
    const useThanks = Boolean(thanksContent) && isThanksBalance(balance)
    if (useThanks) thanked++
    records.push({
      id: randomUUID(),
      batchId,
      customerId: row.id,
      phoneNumber,
      message: renderTemplate(useThanks && thanksContent ? thanksContent : content, {
        customer_name: customerName,
        name: customerName,
        account: row.account || "",
        period: period?.periodName || "",
        balance,
        total_due: balance,
        amount: balance,
      }),
      status: "queued" as const,
      updatedAt: new Date(),
    })
  }

  if (records.length === 0) {
    if (alreadyContacted > 0 && skippedNumbers === 0) {
      throw new Error(
        period
          ? `Everyone in ${scopeName} was already messaged this billing period (${period.periodName})`
          : `Everyone in ${scopeName} was already messaged this billing period`,
      )
    }
    throw new Error("None of the phone numbers in this selection could be used")
  }

  await db.transaction(async (tx) => {
    await tx.insert(crmSmsBatch).values({
      id: batchId,
      name: listName,
      category: input.category,
      templateId: input.templateId || null,
      status: "pending",
      totalMessages: records.length,
      createdById: user.id,
      updatedAt: new Date(),
    })

    const CHUNK = 500
    for (let i = 0; i < records.length; i += CHUNK) {
      await tx.insert(crmSmsRecord).values(records.slice(i, i + CHUNK))
    }
  })

  await writeAudit({
    user,
    action: "crm.sms.from_customers",
    entityType: "crm_sms_batch",
    entityId: batchId,
    details: { name: listName, category: input.category, queued: records.length, schemeId, branchId, skippedNumbers, thanked, alreadyContacted },
  })

  revalidatePath("/dashboard/crm/sms")
  return {
    ok: true as const,
    batchId,
    summary: { queued: records.length, skippedNumbers, scopeName, thanked, alreadyContacted },
  }
}

export async function listSmsBatches(params: {
  limit?: number;
  page?: number;
  startDate?: string;
  endDate?: string;
  category?: string;
  status?: string;
  search?: string;
} = {}) {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  const limit = params.limit ?? 20
  const page = Math.max(1, params.page ?? 1)
  const offset = (page - 1) * limit
  const conds = []

  if (params.startDate) conds.push(gte(crmSmsBatch.createdAt, new Date(params.startDate)))
  if (params.endDate) conds.push(lte(crmSmsBatch.createdAt, new Date(params.endDate)))
  if (params.category && params.category !== "all") conds.push(eq(crmSmsBatch.category, params.category))
  if (params.status && params.status !== "all") conds.push(eq(crmSmsBatch.status, params.status))

  if (params.search) {
    const q = `%${params.search.toLowerCase()}%`
    conds.push(or(
      ilike(crmSmsBatch.name, q),
      ilike(userTable.name, q)
    ))
  }

  const scope = applySmsBatchScope(user)
  if (scope) conds.push(scope)

  const where = and(...conds)

  const [totalRes] = await db
    .select({ count: count() })
    .from(crmSmsBatch)
    .leftJoin(userTable, eq(crmSmsBatch.createdById, userTable.id))
    .where(where)

  const batches = await db
    .select({
      ...getTableColumns(crmSmsBatch),
      createdByName: userTable.name
    })
    .from(crmSmsBatch)
    .leftJoin(userTable, eq(crmSmsBatch.createdById, userTable.id))
    .where(where)
    .orderBy(desc(crmSmsBatch.createdAt))
    .limit(limit)
    .offset(offset)

  const total = Number(totalRes?.count || 0)
  return {
    batches,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}

export async function createSmsBatch(data: {
  name: string;
  category: string;
  templateId?: string;
  recipients: { customerId?: string; phoneNumber: string; message: string }[];
}) {
  const user = await requireUser()
  if (!canSendBulkSms(user)) throw new Error("Forbidden")

  const batchId = randomUUID()

  // Normalise to E.164 up front and drop what cannot be dialled, so the
  // batch's totalMessages reflects what will actually be attempted rather
  // than queueing messages that are certain to be rejected by the gateway.
  const period = await getActiveBillingPeriod()
  const preview = data.recipients
    .map((r) => {
      const phoneNumber = normalizeSendablePhone(r.phoneNumber)
      if (!phoneNumber) return null
      return { customerId: r.customerId ?? null, phoneNumber }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
  const contacted = await loadAlreadyContactedThisPeriod({
    category: data.category,
    period,
    customerIds: preview.map((r) => r.customerId).filter((id): id is string => Boolean(id)),
    phones: preview.map((r) => r.phoneNumber),
  })

  const records = data.recipients
    .map(r => {
      const phoneNumber = normalizeSendablePhone(r.phoneNumber)
      if (!phoneNumber) return null
      if (wasContactedThisPeriod(contacted, r.customerId, phoneNumber)) return null
      return {
        id: randomUUID(),
        batchId,
        customerId: r.customerId ?? null,
        phoneNumber,
        message: r.message,
        status: "queued" as const,
        updatedAt: new Date()
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  if (records.length === 0) {
    if (preview.length > 0) {
      return { ok: false as const, error: "Everyone in this list was already messaged this billing period" }
    }
    return { ok: false as const, error: "None of the supplied phone numbers could be used" }
  }

  await db.transaction(async (tx) => {
    await tx.insert(crmSmsBatch).values({
      id: batchId,
      name: data.name,
      category: data.category,
      templateId: data.templateId || null,
      status: "pending",
      totalMessages: records.length,
      createdById: user.id,
      updatedAt: new Date()
    })

    // Chunked insert for safety
    const CHUNK = 500
    for (let i = 0; i < records.length; i += CHUNK) {
      await tx.insert(crmSmsRecord).values(records.slice(i, i + CHUNK))
    }
  })

  revalidatePath("/dashboard/crm/sms")
  return { ok: true as const, batchId, queued: records.length, skipped: data.recipients.length - records.length }
}

/**
 * Per-recipient rows for one batch. The SMS hub's "Details" button had no
 * handler and nothing in the app read crm_sms_record, so when a batch
 * reported failures there was no way to see which numbers failed or why.
 */
export async function listSmsRecords(batchId: string, params: { status?: string } = {}) {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  await requireSmsBatchInScope(user, batchId)

  const conds = [eq(crmSmsRecord.batchId, batchId)]
  if (params.status && params.status !== "all") conds.push(eq(crmSmsRecord.status, params.status))

  return db
    .select({
      ...getTableColumns(crmSmsRecord),
      customerName: customer.name,
      customerAccount: customer.customerAccount,
    })
    .from(crmSmsRecord)
    .leftJoin(customer, eq(crmSmsRecord.customerId, customer.id))
    .where(and(...conds))
    .orderBy(asc(crmSmsRecord.phoneNumber))
    .limit(2000)
}

/**
 * Loads a batch and confirms it is inside the caller's territory.
 *
 * processSmsBatch previously checked only canSendBulkSms, so any user with
 * that permission could trigger sending of a batch created by another
 * region simply by passing its id.
 */
async function requireSmsBatchInScope(user: Awaited<ReturnType<typeof requireUser>>, batchId: string) {
  const scope = applySmsBatchScope(user)
  const [batch] = await db
    .select()
    .from(crmSmsBatch)
    .where(and(eq(crmSmsBatch.id, batchId), scope ?? sql`1=1`))
    .limit(1)

  if (!batch) throw new Error("Batch not found or outside your assigned scope")
  return batch
}

/**
 * AUTOMATED REMINDERS
 */
export async function generateRemindersFromImport(runId: string) {
  const user = await requireUser()
  if (!canSendBulkSms(user)) throw new Error("Forbidden")

  // 1. Fetch billing records and customer phones
  const records = await db
    .select({
      id: billingRecord.id,
      accountNumber: billingRecord.accountNumber,
      amount: billingRecord.currentCharges,
      totalDue: billingRecord.totalDue,
      customerId: customer.id,
      customerName: customer.name,
      phoneNumber: customer.phone,
      periodName: billingPeriod.periodName
    })
    .from(billingRecord)
    .innerJoin(customer, eq(billingRecord.customerId, customer.id))
    .innerJoin(billingPeriod, eq(billingRecord.billingPeriodId, billingPeriod.id))
    .where(and(
      eq(billingRecord.billingRunId, runId),
      sql`${billingRecord.totalDue} > 0` // Only remind those who owe money
    ))

  if (records.length === 0) return { ok: false, error: "No debtors found in this import batch." }

  const [schemeInfo] = await db
    .select({ name: waterScheme.name })
    .from(billingRun)
    .innerJoin(waterScheme, eq(billingRun.schemeId, waterScheme.id))
    .where(eq(billingRun.id, runId))
    .limit(1)

  const batchName = `Reminders: ${schemeInfo?.name || 'Import'} - ${records[0].periodName}`

  // 3. Resolve Template (notif.billing.sms)
  const [template] = await db.select().from(managedTemplate).where(eq(managedTemplate.code, 'notif.billing.sms')).limit(1)
  let activeContent = "Dear {{customer_name}}, your water bill for {{period}} is USh {{amount}}. Total due: USh {{total_due}}. Please pay promptly. Thank you."

  if (template?.activeVersionId) {
    const [version] = await db.select().from(templateVersion).where(eq(templateVersion.id, template.activeVersionId)).limit(1)
    if (version) activeContent = version.content
  }

  // 4. Map to SMS records using dynamic rendering
  const recipients = records
    .map(r => {
      const phoneNumber = normalizeSendablePhone(r.phoneNumber)
      if (!phoneNumber) return null
      return {
        customerId: r.customerId,
        phoneNumber,
        message: renderTemplate(activeContent, {
          customer_name: r.customerName,
          period: r.periodName,
          amount: Number(r.amount).toLocaleString(),
          total_due: Number(r.totalDue).toLocaleString()
        })
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  if (recipients.length === 0) return { ok: false, error: "No valid phone numbers found for the customers in this batch." }

  // 5. Create batch using existing logic
  return await createSmsBatch({
    name: batchName,
    category: "Bill Reminders",
    recipients
  })
}

/**
 * ACTUAL SENDING ENGINE
 */
/** Messages attempted per invocation, so one call cannot outrun the request timeout. */
const SMS_SEND_BUDGET = 400
/** Concurrent gateway calls. Serial sending made large batches unfinishable. */
const SMS_SEND_CONCURRENCY = 8

/**
 * Human-readable cause for a record that did not send. The previous code
 * recorded the single string "Gateway rejected" for every failure, so on day
 * one -- with no gateway credentials saved -- every message blamed the
 * carrier rather than the missing configuration.
 */
function describeSendFailure(reason: string | null, error?: string) {
  if (reason === "invalid_number") return "Invalid phone number"
  if (reason === "not_configured") return "SMS gateway not configured (Admin -> SMS Gateway)"
  return error ? `Gateway error: ${error}` : "Gateway error"
}

/**
 * Sends the queued messages of a batch.
 *
 * Resumable by design: it only claims records that are still outstanding and
 * works through a bounded budget per call, so a batch larger than one request
 * can survive is finished by calling this again. Previously the whole batch
 * was sent serially inside a single server action, and any timeout or
 * redeploy mid-run left the batch stuck in "processing" with no UI route to
 * resume it.
 */
export async function processSmsBatch(batchId: string) {
  const user = await requireUser()
  if (!canSendBulkSms(user)) throw new Error("Forbidden")

  const batch = await requireSmsBatchInScope(user, batchId)
  if (batch.status === "completed") return { ok: true as const, message: "Already sent", sent: batch.sentMessages, failed: batch.failedMessages, remaining: 0 }

  await db.update(crmSmsBatch).set({ status: "processing", updatedAt: new Date() }).where(eq(crmSmsBatch.id, batchId))

  const pending = await db
    .select()
    .from(crmSmsRecord)
    .where(and(
      eq(crmSmsRecord.batchId, batchId),
      or(
        eq(crmSmsRecord.status, "queued"),
        and(
          eq(crmSmsRecord.status, "failed"),
          sql`coalesce(${crmSmsRecord.error}, '') <> ${ALREADY_MESSAGED_ERROR}`,
        ),
      ),
    ))
    .limit(SMS_SEND_BUDGET)

  let sent = 0
  let failed = 0

  const period = batch.category === BILL_REMINDER_CATEGORY ? await getActiveBillingPeriod() : null
  const contacted = period
    ? await loadAlreadyContactedThisPeriod({
        category: batch.category,
        period,
        customerIds: pending.map((r) => r.customerId).filter((id): id is string => Boolean(id)),
        phones: pending.map((r) => r.phoneNumber),
        exceptBatchId: batchId,
      })
    : { contactedCustomerIds: new Set<string>(), contactedPhones: new Set<string>() }

  for (let i = 0; i < pending.length; i += SMS_SEND_CONCURRENCY) {
    const slice = pending.slice(i, i + SMS_SEND_CONCURRENCY)

    await Promise.all(slice.map(async (record) => {
      try {
        if (wasContactedThisPeriod(contacted, record.customerId, record.phoneNumber)) {
          await db.update(crmSmsRecord)
            .set({ status: "failed", error: ALREADY_MESSAGED_ERROR, updatedAt: new Date() })
            .where(eq(crmSmsRecord.id, record.id))
          failed++
          return
        }
        const result = await sendSMS(record.phoneNumber, record.message, user.id, { auditAction: "crm.sms_sent" })
        if (result.delivered) {
          await db.update(crmSmsRecord)
            .set({ status: "sent", error: null, externalRef: result.gatewayRef || result.id, updatedAt: new Date() })
            .where(eq(crmSmsRecord.id, record.id))
          sent++
        } else {
          await db.update(crmSmsRecord)
            .set({ status: "failed", error: describeSendFailure(result.reason, result.error), updatedAt: new Date() })
            .where(eq(crmSmsRecord.id, record.id))
          failed++
        }
      } catch (err) {
        failed++
        await db.update(crmSmsRecord)
          .set({ status: "failed", error: err instanceof Error ? err.message : String(err), updatedAt: new Date() })
          .where(eq(crmSmsRecord.id, record.id))
      }
    }))

    // Persist progress as we go so the hub shows movement, and so a crash
    // mid-batch leaves accurate counts behind.
    const [tally] = await db
      .select({
        sent: sql<number>`count(case when ${crmSmsRecord.status} in ('sent','delivered') then 1 end)::int`,
        failed: sql<number>`count(case when ${crmSmsRecord.status} = 'failed' then 1 end)::int`,
      })
      .from(crmSmsRecord)
      .where(eq(crmSmsRecord.batchId, batchId))

    await db.update(crmSmsBatch).set({
      sentMessages: Number(tally?.sent || 0),
      failedMessages: Number(tally?.failed || 0),
      updatedAt: new Date(),
    }).where(eq(crmSmsBatch.id, batchId))
  }

  const [remainingRow] = await db
    .select({ count: count() })
    .from(crmSmsRecord)
    .where(and(eq(crmSmsRecord.batchId, batchId), eq(crmSmsRecord.status, "queued")))
  const remaining = Number(remainingRow?.count || 0)

  const [finalTally] = await db
    .select({
      sent: sql<number>`count(case when ${crmSmsRecord.status} in ('sent','delivered') then 1 end)::int`,
      failed: sql<number>`count(case when ${crmSmsRecord.status} = 'failed' then 1 end)::int`,
    })
    .from(crmSmsRecord)
    .where(eq(crmSmsRecord.batchId, batchId))

  const totalSent = Number(finalTally?.sent || 0)
  const totalFailed = Number(finalTally?.failed || 0)

  // Anything still queued means the budget ran out, so leave the batch
  // claimable rather than marking it complete. A run where nothing at all
  // got through is a failure, not a completed batch.
  const status = remaining > 0
    ? "pending"
    : totalSent === 0 && totalFailed > 0
      ? "failed"
      : "completed"

  await db.update(crmSmsBatch).set({
    status,
    sentMessages: totalSent,
    failedMessages: totalFailed,
    updatedAt: new Date()
  }).where(eq(crmSmsBatch.id, batchId))

  if (remaining === 0 && totalFailed > 0) {
    const failedRows = await db
      .select({
        phoneNumber: crmSmsRecord.phoneNumber,
        error: crmSmsRecord.error,
      })
      .from(crmSmsRecord)
      .where(and(eq(crmSmsRecord.batchId, batchId), eq(crmSmsRecord.status, "failed")))
    await notifySenderOfUndeliveredSms(user, { id: batchId, name: batch.name }, failedRows)
  }

  await writeAudit({
    user,
    action: "crm.sms.send",
    entityType: "crm_sms_batch",
    entityId: batchId,
    details: { attempted: pending.length, sent, failed, remaining, status },
  })

  revalidatePath("/dashboard/crm/sms")
  return { ok: true as const, sent, failed, remaining, status }
}

/**
 * STATS
 */
export async function getCrmStats() {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  const complaintScope = applyComplaintListScope(user)
  const smsScope = applySmsBatchScope(user)
  const smsScopeCond = smsScope ?? sql`1=1`

  const [complaintStats, smsStats] = await Promise.all([
    db
      .select({
        total: count(crmComplaint.id),
        open: sql<number>`count(case when ${crmComplaint.status} = 'open' then 1 end)::int`,
        assigned: sql<number>`count(case when ${crmComplaint.status} = 'assigned' then 1 end)::int`,
        inProgress: sql<number>`count(case when ${crmComplaint.status} = 'in_progress' then 1 end)::int`,
        resolved: sql<number>`count(case when ${crmComplaint.status} = 'resolved' then 1 end)::int`,
        closed: sql<number>`count(case when ${crmComplaint.status} = 'closed' then 1 end)::int`,
      })
      .from(crmComplaint)
      .leftJoin(customer, eq(crmComplaint.customerId, customer.id))
      .where(complaintScope)
      .then(rows => rows[0]),
    db
      .select({
        totalBatches: count(crmSmsBatch.id),
        totalSent: sql<number>`coalesce(sum(${crmSmsBatch.sentMessages}), 0)::int`,
        pendingCount: sql<number>`count(case when ${crmSmsBatch.status} = 'pending' then 1 end)::int`,
      })
      .from(crmSmsBatch)
      .where(smsScopeCond)
      .then(rows => rows[0])
  ])

  return {
    complaints: {
      total: Number(complaintStats?.total || 0),
      open: Number(complaintStats?.open || 0),
      assigned: Number(complaintStats?.assigned || 0),
      inProgress: Number(complaintStats?.inProgress || 0),
      resolved: Number(complaintStats?.resolved || 0),
      closed: Number(complaintStats?.closed || 0),
    },
    sms: {
      totalLists: Number(smsStats?.totalBatches || 0),
      pendingMessages: Number(smsStats?.pendingCount || 0),
      sentMessages: Number(smsStats?.totalSent || 0),
    }
  }
}
