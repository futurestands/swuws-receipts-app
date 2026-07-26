"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { user, receipt, auditLog, organization, receiptPrintHistory, branch, waterScheme } from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { writeAudit } from "@/lib/audit"
import { and, desc, eq, gte, lte, sql, ne, count } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { checkRateLimit } from "@/lib/rate-limit"

import { ROLES } from "@/lib/permissions/roles"
import {
  canManageUsers,
  canResetPasswords,
  canViewReports,
  canAudit
} from "@/lib/permissions"
import { applyReceiptScope, applyUserScope, validateWriteScope } from "@/lib/scopes"

export async function listAgents() {
  const current = await requireUser()
  if (!canManageUsers(current)) throw new Error("Forbidden")

  const scope = applyUserScope(current)

  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      iamRoleId: user.iamRoleId,
      active: user.active,
      clusterId: user.clusterId,
      branchId: user.branchId,
      schemeId: user.schemeId,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(scope)
    .orderBy(desc(user.createdAt))
}

export async function createAgent(input: {
  name: string
  email: string
  password: string
  role: string
  iamRoleId?: string | null
  phone?: string
  clusterId?: string | null
  branchId?: string | null
  schemeId?: string | null
}) {
  const current = await requireUser()
  if (!canManageUsers(current)) throw new Error("Forbidden")

  if (!input.name?.trim()) return { ok: false as const, error: "Name is required" }
  if (!input.email?.trim()) return { ok: false as const, error: "Email is required" }
  if (!input.password || input.password.length < 8) {
    return { ok: false as const, error: "Password must be at least 8 characters" }
  }

  // Hierarchy Scope Validation: Ensure the user can create agents for the target hierarchy.
  if (!(await validateWriteScope(current, "users.create", {
    branchId: input.branchId,
    schemeId: input.schemeId
  }))) {
    return { ok: false as const, error: "You are not authorized to create agents for this area" }
  }

  try {
    const created = await auth.api.signUpEmail({
      body: {
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        password: input.password,
      },
    })

    if (!created?.user?.id) throw new Error("Failed to create account")

    // Automatically assign organizationId if possible
    const [org] = await db.select({ id: organization.id }).from(organization).limit(1)
    const organizationId = org?.id || null

    // Assign role and metadata (signUp defaults everyone to PLUMBER/agent).
    await db
      .update(user)
      .set({
        role: input.role,
        iamRoleId: input.iamRoleId || null,
        phone: input.phone?.trim() || null,
        organizationId,
        clusterId: input.clusterId || null,
        branchId: input.branchId || null,
        schemeId: input.schemeId || null,
        updatedAt: new Date(),
      })
      .where(eq(user.id, created.user.id))

    await writeAudit({
      user: current,
      action: "agent.create",
      entityType: "user",
      entityId: created.user.id,
      details: {
        email: input.email,
        role: input.role,
        hierarchy: {
          clusterId: input.clusterId,
          branchId: input.branchId,
          schemeId: input.schemeId,
        },
      },
    })
    revalidatePath("/admin")
    return { ok: true as const }
  } catch (e) {
    console.error("createAgent failed", e)
    const message = e instanceof Error ? e.message : "Failed to create account"
    return { ok: false as const, error: message }
  }
}

export async function setAgentActive(userId: string, active: boolean) {
  const current = await requireUser()
  if (!canManageUsers(current)) throw new Error("Forbidden")

  if (userId === current.id) {
    return { ok: false as const, error: "You cannot disable your own account" }
  }
  const [updated] = await db
    .update(user)
    .set({ active, updatedAt: new Date() })
    .where(eq(user.id, userId))
    .returning({ id: user.id })
  if (!updated) {
    return { ok: false as const, error: "Agent not found" }
  }

  await writeAudit({
    user: current,
    action: active ? "agent.enable" : "agent.disable",
    entityType: "user",
    entityId: userId,
  })
  revalidatePath("/admin")
  return { ok: true as const }
}

export async function setAgentRole(userId: string, role: string, iamRoleId?: string | null) {
  const current = await requireUser()
  if (!canManageUsers(current)) throw new Error("Forbidden")

  if (userId === current.id) {
    return { ok: false as const, error: "You cannot change your own role" }
  }
  const [updated] = await db
    .update(user)
    .set({ role, iamRoleId: iamRoleId || null, updatedAt: new Date() })
    .where(eq(user.id, userId))
    .returning({ id: user.id })
  if (!updated) {
    return { ok: false as const, error: "Agent not found" }
  }

  await writeAudit({
    user: current,
    action: "agent.role.update",
    entityType: "user",
    entityId: userId,
    details: { role },
  })
  revalidatePath("/admin")
  return { ok: true as const }
}

/** Module 2 (Branch & Scheme Management): assign an agent/admin to a hierarchy level. */
export async function setAgentHierarchy(userId: string, input: {
  clusterId?: string | null
  branchId?: string | null
  schemeId?: string | null
}) {
  const current = await requireUser()
  if (!canManageUsers(current)) throw new Error("Forbidden")

  const [updated] = await db
    .update(user)
    .set({
      clusterId: input.clusterId === undefined ? undefined : input.clusterId,
      branchId: input.branchId === undefined ? undefined : input.branchId,
      schemeId: input.schemeId === undefined ? undefined : input.schemeId,
      updatedAt: new Date()
    })
    .where(eq(user.id, userId))
    .returning({ id: user.id })

  if (!updated) {
    return { ok: false as const, error: "Agent not found" }
  }

  await writeAudit({
    user: current,
    action: "agent.hierarchy.update",
    entityType: "user",
    entityId: userId,
    details: input,
  })
  revalidatePath("/admin")
  return { ok: true as const }
}

/**
 * Previously missing entirely (audit: Missing Features, Section 8). Uses
 * Better Auth's admin plugin (lib/auth.ts) to set a new password directly,
 * without needing the agent's old password or an email flow — appropriate
 * for a field agent who is locked out and needs an administrator to help.
 */
export async function resetAgentPassword(userId: string, newPassword: string) {
  const current = await requireUser()
  if (!canResetPasswords(current)) throw new Error("Forbidden")

  const rate = await checkRateLimit(`password-reset:${current.id}`, 10, 60)
  if (!rate.allowed) {
    return { ok: false as const, error: "Too many password resets in a short time. Please wait a moment." }
  }

  if (!newPassword || newPassword.length < 8) {
    return { ok: false as const, error: "Password must be at least 8 characters" }
  }
  if (userId === current.id) {
    return { ok: false as const, error: "Use your own account settings to change your own password" }
  }

  const [target] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1)
  if (!target) return { ok: false as const, error: "Agent not found" }

  try {
    await auth.api.setUserPassword({
      body: { userId, newPassword },
      headers: await headers(),
    })
  } catch (e) {
    console.error("resetAgentPassword failed", e)
    const message = e instanceof Error ? e.message : "Failed to reset password"
    return { ok: false as const, error: message }
  }

  await writeAudit({
    user: current,
    action: "agent.password_reset",
    entityType: "user",
    entityId: userId,
  })
  revalidatePath("/admin")
  return { ok: true as const }
}

export async function getAuditLogs(limit = 200) {
  const current = await requireUser()
  if (!canAudit(current)) throw new Error("Forbidden")

  return db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit)
}

export async function getCollectionsSummary(dateISO?: string) {
  const current = await requireUser()
  if (!canViewReports(current)) throw new Error("Forbidden")

  const scope = applyReceiptScope(current)
  const day = dateISO ? new Date(dateISO) : new Date()
  const start = new Date(day)
  start.setHours(0, 0, 0, 0)
  const end = new Date(day)
  end.setHours(23, 59, 59, 999)

  const baseConditions = [gte(receipt.createdAt, start), lte(receipt.createdAt, end)]
  const conditions = scope ? and(...baseConditions, scope) : and(...baseConditions)

  const rows = await db
    .select({
      agentId: receipt.agentId,
      agentName: receipt.agentName,
      count: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${receipt.amount}), 0)::bigint`,
    })
    .from(receipt)
    .where(conditions)
    .groupBy(receipt.agentId, receipt.agentName)
    .orderBy(desc(sql`sum(${receipt.amount})`))

  const [grand] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${receipt.amount}), 0)::bigint`,
    })
    .from(receipt)
    .where(conditions)

  return {
    perAgent: rows.map((r) => ({
      agentId: r.agentId,
      agentName: r.agentName,
      count: Number(r.count),
      total: Number(r.total),
    })),
    totalCount: Number(grand?.count ?? 0),
    totalAmount: Number(grand?.total ?? 0),
  }
}

/** Whether any admin exists — used to allow first-run admin bootstrap. */
export async function adminExists() {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.role, ROLES.SYSTEM_ADMIN)).limit(1)
  return Boolean(row)
}

export async function getSystemStats() {
  const current = await requireUser()
  if (!canViewReports(current)) throw new Error("Forbidden")

  const scope = applyReceiptScope(current)
  const [agents] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(user)
    .where(ne(user.role, ROLES.SYSTEM_ADMIN))
  const [receipts] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${receipt.amount}), 0)::bigint`,
    })
    .from(receipt)
    .where(scope)

  return {
    agentCount: Number(agents?.count ?? 0),
    receiptCount: Number(receipts?.count ?? 0),
    receiptTotal: Number(receipts?.total ?? 0),
  }
}

export async function getPrintingReports() {
  const current = await requireUser()
  if (!canViewReports(current)) throw new Error("Forbidden")

  const scope = applyReceiptScope(current)

  // 1. Most Reprinted Receipts
  const mostReprinted = await db
    .select({
      id: receipt.id,
      receiptNumber: receipt.receiptNumber,
      customerName: receipt.customerName,
      printCount: receipt.printCount,
    })
    .from(receipt)
    .where(and(scope, gte(receipt.printCount, 1)))
    .orderBy(desc(receipt.printCount))
    .limit(10)

  // 2. Print Activity by User
  const byUser = await db
    .select({
      userId: receiptPrintHistory.printedById,
      userName: receiptPrintHistory.printedByName,
      count: count(),
    })
    .from(receiptPrintHistory)
    .innerJoin(receipt, eq(receiptPrintHistory.receiptId, receipt.id))
    .where(scope)
    .groupBy(receiptPrintHistory.printedById, receiptPrintHistory.printedByName)
    .orderBy(desc(count()))
    .limit(10)

  // 3. Print Activity by Branch
  const byBranch = await db
    .select({
      branchId: receipt.branchId,
      branchName: receipt.branchName,
      count: count(),
    })
    .from(receiptPrintHistory)
    .innerJoin(receipt, eq(receiptPrintHistory.receiptId, receipt.id))
    .where(scope)
    .groupBy(receipt.branchId, receipt.branchName)
    .orderBy(desc(count()))
    .limit(10)

  // 4. Print Activity by Scheme
  const byScheme = await db
    .select({
      schemeId: user.schemeId,
      schemeName: waterScheme.name,
      count: count(),
    })
    .from(receiptPrintHistory)
    .innerJoin(receipt, eq(receiptPrintHistory.receiptId, receipt.id))
    .innerJoin(user, eq(receipt.agentId, user.id))
    .innerJoin(waterScheme, eq(user.schemeId, waterScheme.id))
    .where(scope)
    .groupBy(user.schemeId, waterScheme.name)
    .orderBy(desc(count()))
    .limit(10)

  // 5. Daily Printing Summary (Last 7 days)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const dailySummary = await db
    .select({
      date: sql<string>`DATE(${receiptPrintHistory.printedAt})`,
      count: count(),
    })
    .from(receiptPrintHistory)
    .innerJoin(receipt, eq(receiptPrintHistory.receiptId, receipt.id))
    .where(and(scope, gte(receiptPrintHistory.printedAt, sevenDaysAgo)))
    .groupBy(sql`DATE(${receiptPrintHistory.printedAt})`)
    .orderBy(desc(sql`DATE(${receiptPrintHistory.printedAt})`))

  // 6. Recent Print Log
  const recentPrints = await db
    .select({
      id: receiptPrintHistory.id,
      receiptNumber: receipt.receiptNumber,
      customerName: receipt.customerName,
      printedByName: receiptPrintHistory.printedByName,
      isReprint: receiptPrintHistory.isReprint,
      printNumber: receiptPrintHistory.printNumber,
      printedAt: receiptPrintHistory.printedAt,
      ipAddress: receiptPrintHistory.ipAddress,
    })
    .from(receiptPrintHistory)
    .innerJoin(receipt, eq(receiptPrintHistory.receiptId, receipt.id))
    .where(scope)
    .orderBy(desc(receiptPrintHistory.printedAt))
    .limit(100)

  return {
    mostReprinted,
    byUser,
    byBranch,
    byScheme,
    dailySummary: dailySummary.map(d => ({ date: d.date, count: Number(d.count) })),
    recentPrints,
  }
}
