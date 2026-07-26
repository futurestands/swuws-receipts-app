"use server"

import { db } from "@/lib/db"
import { customer, receipt, waterScheme, branch } from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { writeAudit } from "@/lib/audit"
import { and, desc, eq, ilike, or, sql, getTableColumns } from "drizzle-orm"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { isUniqueViolation } from "@/lib/db/errors"
import {
  canViewAllData,
  canCreateCustomer,
  canEditCustomer,
  canViewReports,
  canIssueReceipt
} from "@/lib/permissions"
import { applyCustomerScope, applyReceiptScope, validateWriteScope } from "@/lib/scopes"

const customerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  customerAccount: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
  waterSchemeId: z.string().trim().optional(),
  notes: z.string().trim().max(1000).optional(),
})
export type CustomerInput = z.infer<typeof customerSchema>

/** Escapes literal ILIKE wildcards in user-supplied search text so e.g. a
 * name containing an underscore doesn't silently match "any character"
 * instead of a literal underscore. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export async function createCustomer(input: CustomerInput) {
  const current = await requireUser()
  if (!canCreateCustomer(current)) throw new Error("Forbidden")

  // Organizational Scope Validation
  if (!(await validateWriteScope(current, "customers.create", { schemeId: input.waterSchemeId }))) {
    return { ok: false as const, error: "You are not authorized to create customers for this scheme" }
  }

  const parsed = customerSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const data = parsed.data

  try {
    const [row] = await db
      .insert(customer)
      .values({
        id: randomUUID(),
        name: data.name,
        customerAccount: data.customerAccount || null,
        phone: data.phone || null,
        address: data.address || null,
        waterSchemeId: data.waterSchemeId || null,
        notes: data.notes || null,
        createdById: current.id,
      })
      .returning()

    await writeAudit({
      user: current,
      action: "customer.create",
      entityType: "customer",
      entityId: row.id,
      details: { name: row.name, customerAccount: row.customerAccount },
    })
    revalidatePath("/dashboard/customers")
    return { ok: true as const, customer: row }
  } catch (e) {
    if (isUniqueViolation(e)) {
      return { ok: false as const, error: "A customer with that account number already exists" }
    }
    console.error("createCustomer failed", e)
    return { ok: false as const, error: "Could not save the customer. Please try again." }
  }
}

/**
 * Customer profiles are editable (unlike receipts) — this is ordinary CRM
 * data, not a financial record subject to the immutability requirement.
 * Only the receipt's own point-in-time snapshot fields are immutable.
 */
export async function updateCustomer(id: string, input: CustomerInput) {
  const current = await requireUser()
  if (!canEditCustomer(current)) throw new Error("Forbidden")

  // Organizational Scope Validation: Ensure the user can edit this specific customer
  const target = await getCustomerById(id)
  if (!target || !(await validateWriteScope(current, "customers.edit", { schemeId: target.waterSchemeId }))) {
    return { ok: false as const, error: "You are not authorized to edit this customer" }
  }

  const parsed = customerSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const data = parsed.data

  try {
    const [row] = await db
      .update(customer)
      .set({
        name: data.name,
        customerAccount: data.customerAccount || null,
        phone: data.phone || null,
        address: data.address || null,
        waterSchemeId: data.waterSchemeId || null,
        notes: data.notes || null,
        updatedAt: new Date(),
      })
      .where(eq(customer.id, id))
      .returning()

    if (!row) return { ok: false as const, error: "Customer not found" }

    await writeAudit({
      user: current,
      action: "customer.update",
      entityType: "customer",
      entityId: id,
      details: { name: row.name },
    })
    revalidatePath("/dashboard/customers")
    revalidatePath(`/dashboard/customers/${id}`)
    return { ok: true as const, customer: row }
  } catch (e) {
    if (isUniqueViolation(e)) {
      return { ok: false as const, error: "A customer with that account number already exists" }
    }
    console.error("updateCustomer failed", e)
    return { ok: false as const, error: "Could not save changes. Please try again." }
  }
}

export async function getCustomerById(id: string) {
  const current = await requireUser()
  const scope = applyCustomerScope(current)

  const [row] = await db
    .select()
    .from(customer)
    .where(and(eq(customer.id, id), scope))
    .limit(1)

  return row ?? null
}

/** Every receipt ever issued against this customer profile — never edited, just listed. */
export async function getCustomerReceiptHistory(customerId: string) {
  const current = await requireUser()
  const scope = applyReceiptScope(current)

  const conditions = [eq(receipt.customerId, customerId)]
  if (scope) conditions.push(scope)

  return db
    .select()
    .from(receipt)
    .where(and(...conditions))
    .orderBy(desc(receipt.createdAt))
}

/**
 * Search + filter + pagination (Module 6). page is 1-indexed.
 */
export async function searchCustomers(params: {
  query?: string
  waterSchemeId?: string
  branchId?: string
  page?: number
  pageSize?: number
}) {
  const current = await requireUser()
  if (!canViewReports(current)) throw new Error("Forbidden")

  const scope = applyCustomerScope(current)
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))
  const offset = (page - 1) * pageSize

  const conditions = []
  if (params.query?.trim()) {
    const q = `%${escapeLike(params.query.trim())}%`
    conditions.push(
      or(ilike(customer.name, q), ilike(customer.customerAccount, q), ilike(customer.phone, q)),
    )
  }
  if (params.waterSchemeId) {
    conditions.push(eq(customer.waterSchemeId, params.waterSchemeId))
  }
  if (params.branchId) {
    conditions.push(eq(waterScheme.branchId, params.branchId))
  }
  if (scope) {
    conditions.push(scope)
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        ...getTableColumns(customer),
        schemeName: waterScheme.name,
        branchName: branch.name,
      })
      .from(customer)
      .leftJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
      .leftJoin(branch, eq(waterScheme.branchId, branch.id))
      .where(where)
      .orderBy(desc(customer.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(customer)
      .where(where),
  ])

  return {
    customers: rows,
    total: Number(count),
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(Number(count) / pageSize)),
  }
}

/** Lightweight lookup used by the receipt form's customer picker. */
export async function quickSearchCustomers(query: string) {
  const current = await requireUser()
  if (!canIssueReceipt(current)) throw new Error("Forbidden")

  const scope = applyCustomerScope(current)
  if (!query.trim()) return []
  const q = `%${escapeLike(query.trim())}%`
  return db
    .select()
    .from(customer)
    .where(and(
      or(ilike(customer.name, q), ilike(customer.customerAccount, q), ilike(customer.phone, q)),
      scope
    ))
    .orderBy(customer.name)
    .limit(10)
}

export async function listActiveWaterSchemesForPicker() {
  const current = await requireUser()
  if (!canIssueReceipt(current) && !canCreateCustomer(current)) throw new Error("Forbidden")

  return db
    .select({ id: waterScheme.id, name: waterScheme.name })
    .from(waterScheme)
    .where(eq(waterScheme.active, true))
    .orderBy(waterScheme.name)
}
