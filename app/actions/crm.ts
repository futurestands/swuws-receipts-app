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
import { eq, and, desc, asc, sql, or, ilike, count, getTableColumns, gte, lte, inArray } from "drizzle-orm"
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
import { renderTemplate } from "@/lib/templates/template-engine"
import { normalizePhone } from "@/lib/phone"
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

/**
 * Loads a complaint and confirms the caller is allowed to act on it.
 *
 * canManageComplaints only answers "may this user touch the complaints
 * module", not "may this user touch *this* complaint". Without the scope
 * check a regional user could mutate any ticket org-wide by guessing ids.
 * Complaints with no linked customer are only reachable by users with
 * global data access — deny by default rather than assume they are safe to
 * expose broadly.
 */
async function requireComplaintInScope(user: Awaited<ReturnType<typeof requireUser>>, id: string) {
  if (canViewAllData(user)) {
    const [existing] = await db.select().from(crmComplaint).where(eq(crmComplaint.id, id)).limit(1)
    if (!existing) throw new Error("Complaint not found")
    return existing
  }

  const customerScope = applyCustomerScope(user)
  const [existing] = await db
    .select(getTableColumns(crmComplaint))
    .from(crmComplaint)
    .innerJoin(customer, eq(crmComplaint.customerId, customer.id))
    .where(and(eq(crmComplaint.id, id), customerScope ?? sql`1=1`))
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
  return db.select().from(branch).where(eq(branch.active, true)).orderBy(asc(branch.name))
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
  if (!customerId && data.customerAccount) {
    const accountConds = [eq(customer.customerAccount, data.customerAccount)]
    if (customerScope) accountConds.push(customerScope)
    const [c] = await db
      .select({ id: customer.id })
      .from(customer)
      .where(and(...accountConds))
      .limit(1)
    if (!c) throw new Error("Customer account not found in your assigned area")
    customerId = c.id
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
}) {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  const offset = (params.page - 1) * params.limit
  const conds = []

  if (params.status && params.status !== "all") conds.push(eq(crmComplaint.status, params.status))
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
    const q = `%${params.search.toLowerCase()}%`
    conds.push(or(
      ilike(crmComplaint.complaintNumber, q),
      ilike(crmComplaint.complainantName, q),
      ilike(crmComplaint.complainantPhone, q),
      ilike(crmComplaint.details, q)
    ))
  }

  // HIERARCHY SCOPING: without this, any user with crm.view sees every
  // complaint org-wide regardless of branch/cluster/scheme assignment.
  // Complaints with no linked customer (walk-in/anonymous) are excluded
  // for non-global users by the inner join below — deny by default rather
  // than assume they're safe to show broadly.
  const customerScope = applyCustomerScope(user)
  const needsCustomerJoin = !canViewAllData(user)
  if (customerScope) conds.push(customerScope)

  const baseQuery = db
    .select({
      ...getTableColumns(crmComplaint),
      categoryName: crmComplaintCategory.name,
      departmentName: crmDepartment.name,
      assignedToName: userTable.name,
      customerAccount: customer.customerAccount,
      // crmComplaint.area is a plain text column storing a branch id (set
      // from the registration form's area SelectItem, whose value is
      // branch.id) -- resolve it to a real name here instead of every
      // consumer having to display the raw id (which is exactly what
      // complaint-details-sheet.tsx was doing: "Branch ID: {complaint.area}").
      areaName: branch.name
    })
    .from(crmComplaint)
    .leftJoin(crmComplaintCategory, eq(crmComplaint.categoryId, crmComplaintCategory.id))
    .leftJoin(crmDepartment, eq(crmComplaint.assignedDepartmentId, crmDepartment.id))
    .leftJoin(userTable, eq(crmComplaint.assignedToId, userTable.id))
    .leftJoin(branch, eq(crmComplaint.area, branch.id))

  const countQuery = db.select({ count: count() }).from(crmComplaint)

  const [totalRes] = needsCustomerJoin
    ? await countQuery.innerJoin(customer, eq(crmComplaint.customerId, customer.id)).where(and(...conds))
    : await countQuery.leftJoin(customer, eq(crmComplaint.customerId, customer.id)).where(and(...conds))

  const rows = needsCustomerJoin
    ? await baseQuery.innerJoin(customer, eq(crmComplaint.customerId, customer.id)).where(and(...conds)).orderBy(desc(crmComplaint.createdAt)).limit(params.limit).offset(offset)
    : await baseQuery.leftJoin(customer, eq(crmComplaint.customerId, customer.id)).where(and(...conds)).orderBy(desc(crmComplaint.createdAt)).limit(params.limit).offset(offset)

  return {
    complaints: rows,
    total: Number(totalRes?.count || 0),
    page: params.page,
    totalPages: Math.ceil(Number(totalRes?.count || 0) / params.limit)
  }
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

  // Same scoping rule as listComplaints, including the customer join only
  // when the caller is territory-limited. This used to join unconditionally,
  // which silently dropped every walk-in/anonymous ticket from reporting
  // even for system admins, so report totals never matched the dashboard.
  const needsCustomerJoin = !canViewAllData(user)
  const customerScope = applyCustomerScope(user)
  if (customerScope) conds.push(customerScope)

  const base = db
    .select({
      ...getTableColumns(crmComplaint),
      categoryName: crmComplaintCategory.name,
      departmentName: crmDepartment.name,
      assignedToName: userTable.name,
      customerAccount: customer.customerAccount,
      areaName: branch.name
    })
    .from(crmComplaint)
    .leftJoin(crmComplaintCategory, eq(crmComplaint.categoryId, crmComplaintCategory.id))
    .leftJoin(crmDepartment, eq(crmComplaint.assignedDepartmentId, crmDepartment.id))
    .leftJoin(userTable, eq(crmComplaint.assignedToId, userTable.id))
    .leftJoin(branch, eq(crmComplaint.area, branch.id))

  const rows = needsCustomerJoin
    ? await base
        .innerJoin(customer, eq(crmComplaint.customerId, customer.id))
        .where(and(...conds))
        .orderBy(desc(crmComplaint.createdAt))
        .limit(REPORT_ROW_LIMIT)
    : await base
        .leftJoin(customer, eq(crmComplaint.customerId, customer.id))
        .where(and(...conds))
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
    content = await resolveTemplateContent(
      "notif.billing.sms",
      "Dear {{customer_name}}, your water bill for {{period}} is due. Balance: USh {{balance}}. SWUWS.",
    )
  }

  const batchId = randomUUID()
  const records: Array<typeof crmSmsRecord.$inferInsert> = []
  let skippedNumbers = 0

  for (const row of scoped) {
    const phoneNumber = normalizePhone(String(row.phoneNumber))
    if (!phoneNumber) {
      skippedNumbers++
      continue
    }

    const customerName = row.customerName || "Customer"
    records.push({
      id: randomUUID(),
      batchId,
      customerId: row.customerRef ? customerByAccount.get(row.customerRef.trim())?.id ?? null : null,
      phoneNumber,
      message: renderTemplate(content, {
        customer_name: customerName,
        // The import modal advertises {{name}}, so accept both spellings.
        name: customerName,
        account: row.customerRef || "",
        period: row.billingPeriod || "",
        balance: row.balance ?? 0,
        total_due: row.balance ?? 0,
        amount: row.balance ?? 0,
      }),
      status: "queued" as const,
      updatedAt: new Date(),
    })
  }

  if (records.length === 0) {
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
    details: { name: name.trim(), category, queued: records.length, schemeId: targetSchemeId, skippedNumbers },
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
    },
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
  const records = data.recipients
    .map(r => {
      const phoneNumber = normalizePhone(r.phoneNumber)
      if (!phoneNumber) return null
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
      const phoneNumber = normalizePhone(r.phoneNumber)
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
      inArray(crmSmsRecord.status, ["queued", "failed"]),
    ))
    .limit(SMS_SEND_BUDGET)

  let sent = 0
  let failed = 0

  for (let i = 0; i < pending.length; i += SMS_SEND_CONCURRENCY) {
    const slice = pending.slice(i, i + SMS_SEND_CONCURRENCY)

    await Promise.all(slice.map(async (record) => {
      try {
        const result = await sendSMS(record.phoneNumber, record.message, user.id, { auditAction: "crm.sms_sent" })
        if (result.delivered) {
          await db.update(crmSmsRecord)
            .set({ status: "sent", error: null, externalRef: result.id, updatedAt: new Date() })
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

  // HIERARCHY SCOPING: same rule as listComplaints — a regional user should
  // only see complaint counts for their own scope, not org-wide totals.
  const needsCustomerJoin = !canViewAllData(user)
  const customerScope = applyCustomerScope(user)
  const scopeCond = customerScope ?? sql`1=1`

  const smsScope = applySmsBatchScope(user)
  const smsScopeCond = smsScope ?? sql`1=1`

  const [complaintStats, smsStats] = await Promise.all([
    (needsCustomerJoin
      ? db
        .select({
          total: count(crmComplaint.id),
          open: sql<number>`count(case when ${crmComplaint.status} = 'open' then 1 end)::int`,
          assigned: sql<number>`count(case when ${crmComplaint.status} = 'assigned' then 1 end)::int`,
          inProgress: sql<number>`count(case when ${crmComplaint.status} = 'in_progress' then 1 end)::int`,
          resolved: sql<number>`count(case when ${crmComplaint.status} = 'resolved' then 1 end)::int`,
          closed: sql<number>`count(case when ${crmComplaint.status} = 'closed' then 1 end)::int`,
        })
        .from(crmComplaint)
        .innerJoin(customer, eq(crmComplaint.customerId, customer.id))
        .where(scopeCond)
      : db
        .select({
          total: count(crmComplaint.id),
          open: sql<number>`count(case when ${crmComplaint.status} = 'open' then 1 end)::int`,
          assigned: sql<number>`count(case when ${crmComplaint.status} = 'assigned' then 1 end)::int`,
          inProgress: sql<number>`count(case when ${crmComplaint.status} = 'in_progress' then 1 end)::int`,
          resolved: sql<number>`count(case when ${crmComplaint.status} = 'resolved' then 1 end)::int`,
          closed: sql<number>`count(case when ${crmComplaint.status} = 'closed' then 1 end)::int`,
        })
        .from(crmComplaint)
    ).then(rows => rows[0]),
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
