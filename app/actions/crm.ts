"use server"

import { db } from "@/lib/db"
import {
  crmDepartment,
  crmComplaintCategory,
  crmComplaint,
  crmSmsBatch,
  crmSmsRecord,
  customer,
  user as userTable
} from "@/lib/db/schema"
import { eq, and, desc, asc, sql, or, ilike, inArray, count, getTableColumns } from "drizzle-orm"
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

/**
 * DEPARTMENTS
 */
export async function listCrmDepartments() {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")
  return db.select().from(crmDepartment).orderBy(asc(crmDepartment.name))
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
  complainantName: string;
  complainantPhone: string;
  complainantEmail?: string;
  complainantAddress?: string;
  area?: string;
  categoryId: string;
  details: string;
  priority?: "low" | "medium" | "high" | "critical";
}) {
  const user = await requireUser()
  if (!canManageComplaints(user)) throw new Error("Forbidden")

  const id = randomUUID()
  const complaintNumber = `COMP-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`

  // Find category to get default department
  const [category] = await db.select().from(crmComplaintCategory).where(eq(crmComplaintCategory.id, data.categoryId)).limit(1)

  await db.insert(crmComplaint).values({
    id,
    complaintNumber,
    ...data,
    assignedDepartmentId: category?.defaultHandlerDepartmentId,
    status: "open",
    updatedAt: new Date()
  })

  await writeAudit({
    user,
    action: "crm.complaint.register",
    entityType: "crm_complaint",
    entityId: id,
    details: { complaintNumber }
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
}) {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  const offset = (params.page - 1) * params.limit
  const conds = []

  if (params.status && params.status !== "all") conds.push(eq(crmComplaint.status, params.status))
  if (params.priority && params.priority !== "all") conds.push(eq(crmComplaint.priority, params.priority))
  if (params.departmentId && params.departmentId !== "all") conds.push(eq(crmComplaint.assignedDepartmentId, params.departmentId))

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
      assignedToName: userTable.name
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

/**
 * SMS COMMUNICATION
 */
export async function listSmsBatches(limit = 20) {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  return db
    .select({
      ...getTableColumns(crmSmsBatch),
      createdByName: userTable.name
    })
    .from(crmSmsBatch)
    .leftJoin(userTable, eq(crmSmsBatch.createdById, userTable.id))
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
          resolved: sql<number>`count(case when ${crmComplaint.status} = 'resolved' then 1 end)::int`,
        })
        .from(crmComplaint)
        .innerJoin(customer, eq(crmComplaint.customerId, customer.id))
        .where(scopeCond)
      : db
        .select({
          total: count(crmComplaint.id),
          open: sql<number>`count(case when ${crmComplaint.status} = 'open' then 1 end)::int`,
          resolved: sql<number>`count(case when ${crmComplaint.status} = 'resolved' then 1 end)::int`,
        })
        .from(crmComplaint)
    ).then(rows => rows[0]),
    db
      .select({
        totalBatches: count(crmSmsBatch.id),
        totalSent: sql<number>`coalesce(sum(${crmSmsBatch.sentMessages}), 0)::int`,
      })
      .from(crmSmsBatch)
      .then(rows => rows[0])
  ])

  return {
    complaints: {
      total: Number(complaintStats?.total || 0),
      open: Number(complaintStats?.open || 0),
      resolved: Number(complaintStats?.resolved || 0),
    },
    sms: {
      totalBatches: Number(smsStats?.totalBatches || 0),
      totalSentToday: Number(smsStats?.totalSent || 0),
    }
  }
}
