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
  waterScheme
} from "@/lib/db/schema"
import { eq, and, desc, asc, sql, or, ilike, inArray, count, getTableColumns, gte, lte } from "drizzle-orm"
import { requireUser } from "@/lib/session"
import {
  canViewCrm,
  canManageComplaints,
  canAssignComplaints,
  canSendBulkSms,
  canConfigureCrm
} from "@/lib/permissions"
import { applyCustomerScope } from "@/lib/scopes"
import { canViewAllData } from "@/lib/permissions"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { writeAudit } from "@/lib/audit"
import { ROLES } from "@/lib/permissions/roles"
import { createNotification } from "./notifications"
import { smsImportSchema, smsImportMapping } from "@/lib/crm-schemas"
import { processExcelImport } from "@/lib/import-engine"

/**
 * DEPARTMENTS
 */
export async function listCrmDepartments() {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")
  return db.select().from(crmDepartment).where(eq(crmDepartment.active, true)).orderBy(asc(crmDepartment.name))
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
export async function listCrmComplaintCategories() {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")
  return db.select().from(crmComplaintCategory).orderBy(asc(crmComplaintCategory.name))
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
export async function registerComplaint(data: {
  customerId?: string | null;
  customerAccount?: string;
  complainantName: string;
  complainantPhone: string;
  complainantEmail?: string;
  complainantAddress?: string;
  area?: string;
  schemeId?: string | null;
  categoryId: string;
  details: string;
  language?: string;
  priority?: "low" | "medium" | "high" | "critical";
  assignedToId?: string | null;
  assignedDepartmentId?: string | null;
}) {
  const user = await requireUser()
  if (!canManageComplaints(user)) throw new Error("Forbidden")

  let customerId = data.customerId

  // Resolve customerId from account number if provided
  if (!customerId && data.customerAccount) {
    const [c] = await db.select({ id: customer.id }).from(customer).where(eq(customer.customerAccount, data.customerAccount)).limit(1)
    if (c) customerId = c.id
  }

  const id = randomUUID()
  const complaintNumber = `COMP-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`

  // Find category to get default department if not provided
  let deptId = data.assignedDepartmentId
  if (!deptId) {
    const [category] = await db.select().from(crmComplaintCategory).where(eq(crmComplaintCategory.id, data.categoryId)).limit(1)
    deptId = category?.defaultHandlerDepartmentId
  }

  const status = data.assignedToId && data.assignedToId !== "unassigned" ? "assigned" : "open"

  await db.insert(crmComplaint).values({
    id,
    complaintNumber,
    customerId,
    complainantName: data.complainantName,
    complainantPhone: data.complainantPhone,
    complainantEmail: data.complainantEmail,
    complainantAddress: data.complainantAddress,
    area: data.area,
    schemeId: data.schemeId,
    categoryId: data.categoryId,
    details: data.details,
    language: data.language || "English",
    assignedDepartmentId: deptId,
    assignedToId: data.assignedToId === "unassigned" ? null : data.assignedToId,
    status: status,
    updatedAt: new Date()
  })

  // Create notification for assigned person if any
  if (data.assignedToId && data.assignedToId !== "unassigned") {
    try {
      await createNotification({
        userId: data.assignedToId,
        type: "crm_complaint_assigned",
        title: "New Complaint Assigned",
        message: `You have been assigned complaint ${complaintNumber}: ${data.details.slice(0, 50)}...`,
        priority: data.priority || "normal",
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
    details: { complaintNumber, assignedToId: data.assignedToId }
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
      customerAccount: customer.customerAccount
    })
    .from(crmComplaint)
    .leftJoin(crmComplaintCategory, eq(crmComplaint.categoryId, crmComplaintCategory.id))
    .leftJoin(crmDepartment, eq(crmComplaint.assignedDepartmentId, crmDepartment.id))
    .leftJoin(userTable, eq(crmComplaint.assignedToId, userTable.id))

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
export async function getComplaintReports(params: {
  from?: string;
  till?: string;
  status?: string;
  district?: string;
  category?: string;
  staff?: string;
}) {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  const conds = []
  if (params.from) conds.push(gte(crmComplaint.createdAt, new Date(params.from)))
  if (params.till) conds.push(lte(crmComplaint.createdAt, new Date(params.till)))
  if (params.status && params.status !== "all") conds.push(eq(crmComplaint.status, params.status))
  if (params.category && params.category !== "all") conds.push(eq(crmComplaint.categoryId, params.category))
  if (params.staff && params.staff !== "all") conds.push(eq(crmComplaint.assignedToId, params.staff))

  // District filtering depends on hierarchy (Area/Branch)
  if (params.district && params.district !== "all") {
    conds.push(eq(crmComplaint.area, params.district))
  }

  const customerScope = applyCustomerScope(user)
  if (customerScope) conds.push(customerScope)

  return db
    .select({
      ...getTableColumns(crmComplaint),
      categoryName: crmComplaintCategory.name,
      departmentName: crmDepartment.name,
      assignedToName: userTable.name,
      customerAccount: customer.customerAccount
    })
    .from(crmComplaint)
    .leftJoin(crmComplaintCategory, eq(crmComplaint.categoryId, crmComplaintCategory.id))
    .leftJoin(crmDepartment, eq(crmComplaint.assignedDepartmentId, crmDepartment.id))
    .leftJoin(userTable, eq(crmComplaint.assignedToId, userTable.id))
    .innerJoin(customer, eq(crmComplaint.customerId, customer.id))
    .where(and(...conds))
    .orderBy(desc(crmComplaint.createdAt))
}

export async function resolveComplaint(id: string, notes: string) {
  const user = await requireUser()
  if (!canManageComplaints(user)) throw new Error("Forbidden")

  // HIERARCHY SCOPING: canManageComplaints only checks module access, not
  // which complaints this user is allowed to touch. Without this check, a
  // regional user could resolve any complaint org-wide by guessing/enumerating
  // IDs, not just complaints for customers in their own scope.
  if (!canViewAllData(user)) {
    const customerScope = applyCustomerScope(user)
    const [existing] = await db
      .select({ id: crmComplaint.id })
      .from(crmComplaint)
      .innerJoin(customer, eq(crmComplaint.customerId, customer.id))
      .where(and(eq(crmComplaint.id, id), customerScope ?? sql`1=1`))
      .limit(1)
    if (!existing) throw new Error("Forbidden: complaint is outside your assigned scope")
  }

  await db.update(crmComplaint)
    .set({
      status: "resolved",
      resolutionNotes: notes,
      resolvedAt: new Date(),
      resolvedById: user.id,
      updatedAt: new Date()
    })
    .where(eq(crmComplaint.id, id))

  await writeAudit({
    user,
    action: "crm.complaint.resolve",
    entityType: "crm_complaint",
    entityId: id,
    details: { notes }
  })

  revalidatePath("/dashboard/crm/complaints")
  return { ok: true }
}

export async function closeComplaint(id: string) {
  const user = await requireUser()
  if (!canManageComplaints(user)) throw new Error("Forbidden")

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
    details: { status: "closed" }
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

  if (!file) throw new Error("File is required")

  const summary = await processExcelImport({
    file,
    schema: smsImportSchema,
    mapping: smsImportMapping,
    headerMode: "none"
  })

  if (summary.validRows === 0) {
    throw new Error("No valid rows found in the imported file")
  }

  const batchId = randomUUID()

  await db.transaction(async (tx) => {
    await tx.insert(crmSmsBatch).values({
      id: batchId,
      name,
      category,
      templateId,
      status: "pending",
      totalMessages: summary.validRows,
      createdById: user.id,
      updatedAt: new Date()
    })

    const records = summary.rows
      .filter(r => r.valid)
      .map(r => ({
        id: randomUUID(),
        batchId,
        phoneNumber: String(r.data.phoneNumber),
        message: `Dear ${r.data.customerName || 'Customer'}, your bill for ${r.data.billingPeriod || 'the period'} is due. Balance: ${r.data.balance || 0}.`,
        status: "queued" as const,
        updatedAt: new Date()
      }))

    const CHUNK = 500
    for (let i = 0; i < records.length; i += CHUNK) {
      await tx.insert(crmSmsRecord).values(records.slice(i, i + CHUNK))
    }
  })

  revalidatePath("/dashboard/crm/sms")
  return { ok: true, batchId, summary: { total: summary.totalRows, valid: summary.validRows } }
}

export async function listSmsBatches(params: {
  limit?: number;
  startDate?: string;
  endDate?: string;
  category?: string;
  status?: string;
  search?: string;
} = {}) {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  const limit = params.limit ?? 20
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

  return db
    .select({
      ...getTableColumns(crmSmsBatch),
      createdByName: userTable.name
    })
    .from(crmSmsBatch)
    .leftJoin(userTable, eq(crmSmsBatch.createdById, userTable.id))
    .where(and(...conds))
    .orderBy(desc(crmSmsBatch.createdAt))
    .limit(limit)
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

  await db.transaction(async (tx) => {
    await tx.insert(crmSmsBatch).values({
      id: batchId,
      name: data.name,
      category: data.category,
      templateId: data.templateId,
      status: "pending",
      totalMessages: data.recipients.length,
      createdById: user.id,
      updatedAt: new Date()
    })

    const records = data.recipients.map(r => ({
      id: randomUUID(),
      batchId,
      customerId: r.customerId,
      phoneNumber: r.phoneNumber,
      message: r.message,
      status: "queued" as const,
      updatedAt: new Date()
    }))

    // Chunked insert for safety
    const CHUNK = 500
    for (let i = 0; i < records.length; i += CHUNK) {
      await tx.insert(crmSmsRecord).values(records.slice(i, i + CHUNK))
    }
  })

  revalidatePath("/dashboard/crm/sms")
  return { ok: true, batchId }
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

  const [complaintStats, smsStats] = await Promise.all([
    (needsCustomerJoin
      ? db
        .select({
          total: count(crmComplaint.id),
          open: sql<number>`count(case when ${crmComplaint.status} = 'open' then 1 end)::int`,
          assigned: sql<number>`count(case when ${crmComplaint.status} = 'assigned' then 1 end)::int`,
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
      .then(rows => rows[0])
  ])

  return {
    complaints: {
      total: Number(complaintStats?.total || 0),
      open: Number(complaintStats?.open || 0),
      assigned: Number(complaintStats?.assigned || 0),
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
