"use server"

import { db } from "@/lib/db"
import { customer, receipt, waterScheme, branch } from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { writeAudit } from "@/lib/audit"
import { and, desc, eq, ilike, or, sql, getTableColumns, gte, lte } from "drizzle-orm"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import * as XLSX from "xlsx"
import { z } from "zod"
import { isUniqueViolation } from "@/lib/db/errors"
import {
  canCreateCustomer,
  canEditCustomer,
  canViewReports,
  canIssueReceipt
} from "@/lib/permissions"
import { applyCustomerScope, applyReceiptScope, validateWriteScope } from "@/lib/scopes"
import { hasPermission } from "@/lib/iam"
import { logEvent } from "@/lib/logger"

const customerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  customerAccount: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(30).optional(), // Audit note: Address field is short, but schema is text.
  waterSchemeId: z.string().trim().optional(),
  notes: z.string().trim().max(1000).optional(),
  active: z.boolean().optional(),
  lastReading: z.number().min(0).optional(),
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
        active: data.active ?? true,
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
    logEvent({
      message: "createCustomer failed",
      severity: "error",
      category: "system",
      error: e,
      user: current,
    })
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
        active: data.active,
        lastReading: data.lastReading !== undefined ? data.lastReading : undefined,
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
    logEvent({
      message: "updateCustomer failed",
      severity: "error",
      category: "system",
      error: e,
      user: current,
    })
    return { ok: false as const, error: "Could not save changes. Please try again." }
  }
}

/**
 * Implements logic for the seeded 'customers.delete' permission.
 * Does not remove data; marks as inactive.
 */
export async function setCustomerActive(id: string, active: boolean) {
  const current = await requireUser()
  if (!(await hasPermission(current, "customers.delete"))) throw new Error("Forbidden")

  const target = await getCustomerById(id)
  if (!target || !(await validateWriteScope(current, "customers.edit", { schemeId: target.waterSchemeId }))) {
    return { ok: false as const, error: "You are not authorized to modify this customer" }
  }

  await db
    .update(customer)
    .set({ active, updatedAt: new Date() })
    .where(eq(customer.id, id))

  await writeAudit({
    user: current,
    action: active ? "customer.activate" : "customer.deactivate",
    entityType: "customer",
    entityId: id,
  })

  revalidatePath("/dashboard/customers")
  return { ok: true as const }
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
  minBalance?: number
  maxBalance?: number
  page?: number
  pageSize?: number
  showInactive?: boolean
}) {
  const current = await requireUser()
  if (!canViewReports(current)) throw new Error("Forbidden")

  const scope = applyCustomerScope(current)
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))
  const offset = (page - 1) * pageSize

  const conditions = []
  if (!params.showInactive) {
    conditions.push(eq(customer.active, true))
  }
  if (params.query?.trim()) {
    const q = `%${escapeLike(params.query.trim())}%`
    // Goal Alignment: Explicitly cast columns to text to prevent 'Operator does not exist'
    // errors on cloud databases if numeric data is encountered.
    conditions.push(
      or(
        ilike(customer.name, q),
        sql`${customer.customerAccount}::text ilike ${q}`,
        sql`${customer.phone}::text ilike ${q}`
      ),
    )
  }
  if (params.waterSchemeId) {
    conditions.push(eq(customer.waterSchemeId, params.waterSchemeId))
  }
  if (params.branchId) {
    conditions.push(eq(waterScheme.branchId, params.branchId))
  }
  if (params.minBalance !== undefined) {
    conditions.push(gte(customer.accountBalance, String(params.minBalance)))
  }
  if (params.maxBalance !== undefined) {
    conditions.push(lte(customer.accountBalance, String(params.maxBalance)))
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

/**
 * Exports matching customers to an Excel file (Module 6 Enhancement).
 */
export async function exportCustomersExcel(params: {
  query?: string
  waterSchemeId?: string
  branchId?: string
  minBalance?: number
  maxBalance?: number
  showInactive?: boolean
}) {
  const current = await requireUser()
  if (!canViewReports(current)) throw new Error("Forbidden")

  const scope = applyCustomerScope(current)
  const conditions = []
  if (!params.showInactive) {
    conditions.push(eq(customer.active, true))
  }
  if (params.query?.trim()) {
    const q = `%${escapeLike(params.query.trim())}%`
    conditions.push(
      or(
        ilike(customer.name, q),
        sql`${customer.customerAccount}::text ilike ${q}`,
        sql`${customer.phone}::text ilike ${q}`
      ),
    )
  }
  if (params.waterSchemeId && params.waterSchemeId !== "all") {
    conditions.push(eq(customer.waterSchemeId, params.waterSchemeId))
  }
  if (params.branchId && params.branchId !== "all") {
    conditions.push(eq(waterScheme.branchId, params.branchId))
  }
  if (params.minBalance !== undefined) {
    conditions.push(gte(customer.accountBalance, String(params.minBalance)))
  }
  if (params.maxBalance !== undefined) {
    conditions.push(lte(customer.accountBalance, String(params.maxBalance)))
  }
  if (scope) {
    conditions.push(scope)
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const rows = await db
    .select({
      name: customer.name,
      account: customer.customerAccount,
      phone: customer.phone,
      address: customer.address,
      scheme: waterScheme.name,
      branch: branch.name,
      arrears: customer.accountBalance,
      status: customer.active,
      registered: customer.createdAt,
    })
    .from(customer)
    .leftJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
    .leftJoin(branch, eq(waterScheme.branchId, branch.id))
    .where(where)
    .orderBy(customer.name)

  const data = rows.map((r) => ({
    "Name": r.name,
    "Account #": r.account || "—",
    "Phone": r.phone || "—",
    "Address": r.address || "—",
    "Water Scheme": r.scheme || "—",
    "Branch": r.branch || "—",
    "Arrears (UGX)": Number(r.arrears),
    "Status": r.status ? "Active" : "Inactive",
    "Registered On": r.registered?.toLocaleDateString("en-GB") || "—",
  }))

  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Customers")

  // Set column widths for better readability
  const wscols = [
    { wch: 25 }, // Name
    { wch: 15 }, // Account #
    { wch: 15 }, // Phone
    { wch: 20 }, // Address
    { wch: 20 }, // Water Scheme
    { wch: 15 }, // Branch
    { wch: 15 }, // Arrears
    { wch: 10 }, // Status
    { wch: 15 }, // Registered On
  ]
  worksheet["!cols"] = wscols

  return XLSX.write(workbook, { type: "base64", bookType: "xlsx" })
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
      eq(customer.active, true),
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
