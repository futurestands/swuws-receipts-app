"use server"

import { db } from "@/lib/db"
import {
  billingPeriod,
  billingRun,
  billingRecord,
  billingUpload,
  customer,
  waterScheme,
  user as userTable,
  receipt,
  managedTemplate,
  templateVersion,
  dailyCollectionRecord,
  reconciliationMatch,
  auditLog,
} from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { writeAudit } from "@/lib/audit"
import {
  canUploadBilling,
  canManageCollectionPeriods,
  canActivateCollectionPeriod,
  canArchiveCollectionPeriod,
  canIssueReceipt
} from "@/lib/permissions"
import { validateWriteScope, applyCustomerScope } from "@/lib/scopes"
import { and, eq, sql, desc, or, inArray, count, sum, notInArray } from "drizzle-orm"
import * as XLSX from "xlsx"
import { z } from "zod"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { createNotification } from "./notifications"
import { processExcelImport, getImportMapping, type ImportSummary } from "@/lib/import-engine"
import { logFinancial } from "@/lib/logger"

/**
 * Validation Schema for a single billing row.
 */
const billingImportSchema = z.object({
  accountNumber: z.coerce.string().trim().min(1, "Account number is required"),
  billAmount: z.coerce.number().min(0, "Bill amount cannot be negative"),
  arrears: z.coerce.number().default(0),
  currentCharges: z.coerce.number().min(0, "Current charges cannot be negative"),
  totalDue: z.coerce.number().min(0, "Total due cannot be negative"),
  dueDate: z.coerce.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid due date format",
  }),
})

export type BillingImportRow = z.infer<typeof billingImportSchema>

export type BillingImportSummary = ImportSummary<BillingImportRow> & {
  schemeId: string
  billingPeriodId: string
}

/**
 * Fetch authorized schemes for the current user.
 */
export async function getAuthorizedSchemes() {
  const current = await requireUser()
  const schemes = await db
    .select({
      id: waterScheme.id,
      name: waterScheme.name,
      branchId: waterScheme.branchId,
    })
    .from(waterScheme)
    .where(eq(waterScheme.active, true))
    .orderBy(waterScheme.name)

  const authorized = await Promise.all(
    schemes.map((s) => validateWriteScope(current, "system.settings.manage", { branchId: s.branchId, schemeId: s.id }))
  )
  return schemes.filter((_, i) => authorized[i])
}

/**
 * Fetch available collection periods (internal billing_period).
 */
export async function getCollectionPeriods() {
  await requireUser()
  return db
    .select()
    .from(billingPeriod)
    .orderBy(desc(billingPeriod.year), desc(billingPeriod.month))
}

/** Legacy alias for getCollectionPeriods */
export const getBillingPeriods = getCollectionPeriods

/**
 * Create a new collection period (internal billing_period).
 */
export async function createCollectionPeriod(data: {
  month: number;
  year: number;
  name: string;
  start: string;
  end: string;
  description?: string;
}) {
  const current = await requireUser()
  if (!canManageCollectionPeriods(current)) {
    throw new Error("Forbidden")
  }

  const id = randomUUID()
  await db.transaction(async (tx) => {
    await tx.insert(billingPeriod).values({
      id,
      month: data.month,
      year: data.year,
      periodName: data.name,
      startDate: new Date(data.start),
      endDate: new Date(data.end),
      description: data.description,
      status: "active",
      isOpen: true, // Legacy field
    })

    await writeAudit({
      user: current,
      action: "collection.period.create",
      entityType: "billing_period",
      entityId: id,
      details: { name: data.name, month: data.month, year: data.year },
    }, tx)
  })

  revalidatePath("/dashboard/billing")
  return { ok: true, id }
}

/**
 * Validates and transitions the status of a collection period.
 */
export async function updateCollectionPeriodStatus(id: string, newStatus: string, remarks?: string) {
  const current = await requireUser()

  const [period] = await db
    .select()
    .from(billingPeriod)
    .where(eq(billingPeriod.id, id))
    .limit(1)

  if (!period) throw new Error("Collection period not found")

  const oldStatus = period.status

  // Strict Lifecycle Validation
  const allowedTransitions: Record<string, string[]> = {
    'draft': ['validated'],
    'validated': ['active', 'draft'],
    'active': ['closed'],
    'closed': ['archived'],
    'archived': []
  }

  if (!allowedTransitions[oldStatus]?.includes(newStatus)) {
    throw new Error(`Invalid status transition from ${oldStatus} to ${newStatus}`)
  }

  // Permission Checks
  if (newStatus === 'active' || newStatus === 'closed') {
    if (!canActivateCollectionPeriod(current)) throw new Error("Forbidden")
  } else if (newStatus === 'archived') {
    if (!canArchiveCollectionPeriod(current)) throw new Error("Forbidden")
  } else {
    if (!canManageCollectionPeriods(current)) throw new Error("Forbidden")
  }

  // Single Active Period Constraint
  if (newStatus === 'active') {
    const [existingActive] = await db
      .select({ id: billingPeriod.id })
      .from(billingPeriod)
      .where(eq(billingPeriod.status, 'active'))
      .limit(1)

    if (existingActive) {
      throw new Error("Another Collection Period is already active. Please close it first.")
    }
  }

  await db.transaction(async (tx) => {
    const updateData: any = { status: newStatus, updatedAt: new Date() }

    // Tracking columns
    if (newStatus === 'validated') {
      updateData.validatedAt = new Date()
      updateData.validatedById = current.id
    } else if (newStatus === 'active') {
      updateData.activatedAt = new Date()
      updateData.activatedById = current.id
      updateData.isOpen = true // Sync legacy field
    } else if (newStatus === 'closed') {
      updateData.closedAt = new Date()
      updateData.closedById = current.id
      updateData.isOpen = false // Sync legacy field
    } else if (newStatus === 'archived') {
      updateData.archivedAt = new Date()
      updateData.archivedById = current.id
    }

    await tx.update(billingPeriod).set(updateData).where(eq(billingPeriod.id, id))

    await writeAudit({
      user: current,
      action: `collection.period.${newStatus}`,
      entityType: "billing_period",
      entityId: id,
      details: {
        previousStatus: oldStatus,
        newStatus,
        remarks
      },
    }, tx)

    // Notify Agents on Activation (Phase 5B Expansion)
    if (newStatus === 'active') {
      const agents = await tx
        .select({ id: userTable.id })
        .from(userTable)
        .where(eq(userTable.active, true))

      for (const agent of agents) {
        if (agent.id === current.id) continue // Don't notify self
        await createNotification({
          userId: agent.id,
          type: "period_active",
          title: "New Billing Period Open",
          message: `The collection period "${period.periodName}" is now active. You can begin capturing meter readings.`,
          priority: "high",
          relatedEntityType: "billing_period",
          relatedEntityId: id
        }, tx)
      }
    }
  })

  revalidatePath("/dashboard/billing")
  revalidatePath("/dashboard")
  return { ok: true }
}

/**
 * ARCHIVE COLLECTION PERIOD (Financial Governance)
 *
 * Permanently locks a period and marks its billing records as archived.
 * This keeps the active dashboard clean while preserving data for reports.
 */
export async function archiveCollectionPeriod(id: string) {
  const current = await requireUser()
  if (!canArchiveCollectionPeriod(current)) throw new Error("Forbidden")

  const [period] = await db
    .select()
    .from(billingPeriod)
    .where(eq(billingPeriod.id, id))
    .limit(1)

  if (!period) throw new Error("Collection period not found")
  if (period.status !== "closed") {
    throw new Error("Only CLOSED periods can be archived.")
  }

  try {
    await db.transaction(async (tx) => {
      // 1. Update all billing records to archived
      await tx
        .update(billingRecord)
        .set({ status: "cancelled", updatedAt: new Date() }) // Using 'cancelled' as archived proxy if no 'archived' status exists, or adding it?
        // Let's check billingRecord status in schema
        .where(eq(billingRecord.billingPeriodId, id))

      // 2. Update period status
      await tx
        .update(billingPeriod)
        .set({
          status: "archived",
          archivedAt: new Date(),
          archivedById: current.id,
          updatedAt: new Date(),
        })
        .where(eq(billingPeriod.id, id))

      // 3. Audit Log
      await writeAudit(
        {
          user: current,
          action: "collection.period.archive",
          entityType: "billing_period",
          entityId: id,
          details: { name: period.periodName },
        },
        tx,
      )
    })

    logFinancial("Collection Period Archived", {
      id,
      name: period.periodName
    }, current)

    revalidatePath("/dashboard/billing")
    return { ok: true }
  } catch (e: any) {
    console.error("archiveCollectionPeriod failed", e)
    return { ok: false, error: e.message || "Failed to archive period" }
  }
}

/**
 * Validates the uploaded billing file.
 */
export async function validateBillingImport(
  formData: FormData,
): Promise<{ ok: true; summary: BillingImportSummary } | { ok: false; error: string }> {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")

  const schemeId = formData.get("schemeId") as string
  const billingPeriodId = formData.get("billingPeriodId") as string
  const file = formData.get("file") as File

  if (!schemeId || !billingPeriodId || !file) {
    return { ok: false, error: "Missing required fields" }
  }

  // 1. Verify Collection Period exists and is in DRAFT status
  const [period] = await db
    .select()
    .from(billingPeriod)
    .where(eq(billingPeriod.id, billingPeriodId))
    .limit(1)

  if (!period) return { ok: false, error: "Selected billing period does not exist" }
  if (period.status === 'closed' || period.status === 'archived') {
    return { ok: false, error: `Imports are not allowed in ${period.status} status.` }
  }

  // 2. Scope Validation
  const [scheme] = await db
    .select({ branchId: waterScheme.branchId })
    .from(waterScheme)
    .where(eq(waterScheme.id, schemeId))
    .limit(1)

  if (!scheme || !(await validateWriteScope(current, "billing.import", { branchId: scheme.branchId, schemeId }))) {
    return { ok: false, error: "You are not authorized to upload for this scheme" }
  }

  // 3. Prevent duplicate uploads for the same scheme/period
  const [existingRun] = await db
    .select({ id: billingRun.id })
    .from(billingRun)
    .where(and(eq(billingRun.schemeId, schemeId), eq(billingRun.billingPeriodId, billingPeriodId)))
    .limit(1)

  if (existingRun) {
    return { ok: false, error: "Monthly billing has already been imported for this scheme and period" }
  }

  const schemeCustomers = await db
    .select({ id: customer.id, account: customer.customerAccount })
    .from(customer)
    .where(eq(customer.waterSchemeId, schemeId))

  const customerMap = new Map(schemeCustomers.map((c) => [c.account?.toLowerCase(), c]))
  const seenInUpload = new Set<string>()

  // Resolve dynamic mapping
  const mapping = (await getImportMapping('import.billing.monthly')) as any || {
    accountNumber: "AccountNumber",
    billAmount: "BillAmount",
    arrears: "Arrears",
    currentCharges: "CurrentCharges",
    totalDue: "TotalDue",
    dueDate: "DueDate"
  }

  const engineSummary = await processExcelImport({
    file,
    schema: billingImportSchema,
    mapping,
    onValidateRow: (data) => {
      const errors: string[] = []
      const warnings: string[] = []

      const accLower = data.accountNumber?.toLowerCase()
      const targetCustomer = customerMap.get(accLower)

      if (!targetCustomer) {
        errors.push(`Customer account ${data.accountNumber} not found in this scheme`)
      }

      if (seenInUpload.has(accLower)) {
        errors.push("Duplicate account number in the upload file")
      }
      seenInUpload.add(accLower)

      return { errors, warnings }
    }
  })

  return {
    ok: true,
    summary: {
      ...engineSummary,
      schemeId,
      billingPeriodId,
    } as any,
  }
}

/**
 * Executes the billing import transactionally.
 */
export async function importBilling(
  summary: BillingImportSummary,
  filename: string,
): Promise<{ ok: true; imported: number; failed: number; report: string } | { ok: false; error: string }> {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")

  const validRows = summary.rows.filter((r) => r.valid)
  if (validRows.length === 0) return { ok: false, error: "No valid rows to import" }

  // Re-verify period status
  const [period] = await db
    .select({ status: billingPeriod.status, periodName: billingPeriod.periodName })
    .from(billingPeriod)
    .where(eq(billingPeriod.id, summary.billingPeriodId))
    .limit(1)
  if (period?.status === 'closed' || period?.status === 'archived') {
    return { ok: false, error: "Billing period is closed or archived" }
  }

  const schemeCustomers = await db
    .select({ id: customer.id, account: customer.customerAccount })
    .from(customer)
    .where(eq(customer.waterSchemeId, summary.schemeId))
  const customerMap = new Map(schemeCustomers.map((c) => [c.account?.toLowerCase(), c.id]))

  const runId = randomUUID()
  let importedCount = 0
  let totalAmount = 0
  const reportRows: any[] = []

  try {
    await db.transaction(async (tx) => {
      await writeAudit({
        user: current,
        action: "billing.import.start",
        entityType: "billing_period",
        entityId: summary.billingPeriodId,
        details: { filename, schemeId: summary.schemeId },
      }, tx)

      await tx.insert(billingRun).values({
        id: runId,
        schemeId: summary.schemeId,
        billingPeriodId: summary.billingPeriodId,
        uploadedById: current.id,
        sourceFile: filename,
        status: "completed",
        totalCustomers: validRows.length,
        totalAmount: 0,
      })

      const recordsToInsert = validRows.map((row) => {
        const custId = customerMap.get(row.data.accountNumber.toLowerCase())!
        totalAmount += row.data.totalDue
        return {
          id: randomUUID(),
          billingRunId: runId,
          billingPeriodId: summary.billingPeriodId,
          customerId: custId,
          accountNumber: row.data.accountNumber,
          billAmount: row.data.billAmount,
          arrears: row.data.arrears,
          currentCharges: row.data.currentCharges,
          totalDue: row.data.totalDue,
          dueDate: new Date(row.data.dueDate),
          status: "pending",
        }
      })

      const CHUNK_SIZE = 2000
      for (let i = 0; i < recordsToInsert.length; i += CHUNK_SIZE) {
        await tx.insert(billingRecord).values(recordsToInsert.slice(i, i + CHUNK_SIZE))
      }

      await tx.update(billingRun).set({ totalAmount }).where(eq(billingRun.id, runId))
      await tx.insert(billingUpload).values({
        id: randomUUID(),
        billingRunId: runId,
        filename,
        storagePath: "system/imports/billing",
        uploadedById: current.id,
        importedRecords: validRows.length,
        failedRecords: summary.errorRows,
      })

      await writeAudit({
        user: current,
        action: "billing.import.complete",
        entityType: "billing_run",
        entityId: runId,
        details: { schemeId: summary.schemeId, imported: validRows.length },
      }, tx)

      // 5. Synchronize Customer Balances with EBS Source of Truth
      // For every imported bill, we set the customer's LIVE balance to match the TotalDue
      for (const record of recordsToInsert) {
        await tx
          .update(customer)
          .set({
            accountBalance: record.totalDue,
            updatedAt: new Date()
          })
          .where(eq(customer.id, record.customerId))
      }

      importedCount = validRows.length
    })

    logFinancial("Billing Imported", {
      filename,
      imported: importedCount,
      totalAmount
    }, current)

    summary.rows.forEach((r) => {
      reportRows.push({ ...r.data, Result: r.valid ? "Success" : "Failed", Details: r.errors.join("; ") })
    })

    revalidatePath("/dashboard/billing")
    const worksheet = XLSX.utils.json_to_sheet(reportRows)
    return {
      ok: true,
      imported: importedCount,
      failed: summary.errorRows,
      report: XLSX.utils.sheet_to_csv(worksheet)
    }
  } catch (e: any) {
    console.error("Billing import failed", e)
    await writeAudit({
      user: current,
      action: "billing.import.failed",
      entityType: "billing_period",
      entityId: summary.billingPeriodId,
      details: { error: e.message },
    })
    return { ok: false, error: e.message || "A database error occurred during import" }
  }
}

export async function downloadBillingTemplate() {
  await requireUser()
  const headers = ["AccountNumber", "BillAmount", "Arrears", "CurrentCharges", "TotalDue", "DueDate"]
  const data = [
    { AccountNumber: "C-12345", BillAmount: 50000, Arrears: 10000, CurrentCharges: 40000, TotalDue: 50000, DueDate: new Date().toISOString().split("T")[0] },
  ]
  const worksheet = XLSX.utils.json_to_sheet(data, { header: headers })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "BillingTemplate")
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }).toString("base64")
}

export async function getCollectionSummary() {
  const current = await requireUser()

  // Get active period, or the most recent one if none is active
  // Join with users for the timeline
  const [displayPeriod] = await db
    .select({
      id: billingPeriod.id,
      month: billingPeriod.month,
      year: billingPeriod.year,
      periodName: billingPeriod.periodName,
      startDate: billingPeriod.startDate,
      endDate: billingPeriod.endDate,
      status: billingPeriod.status,
      createdAt: billingPeriod.createdAt,
      validatedAt: billingPeriod.validatedAt,
      activatedAt: billingPeriod.activatedAt,
      closedAt: billingPeriod.closedAt,
      archivedAt: billingPeriod.archivedAt,
      validatedByName: sql<string | null>`(SELECT name FROM "user" WHERE id = ${billingPeriod.validatedById})`,
      activatedByName: sql<string | null>`(SELECT name FROM "user" WHERE id = ${billingPeriod.activatedById})`,
      closedByName: sql<string | null>`(SELECT name FROM "user" WHERE id = ${billingPeriod.closedById})`,
      archivedByName: sql<string | null>`(SELECT name FROM "user" WHERE id = ${billingPeriod.archivedById})`,
    })
    .from(billingPeriod)
    .where(or(
      eq(billingPeriod.status, 'active'),
      eq(billingPeriod.status, 'draft'),
      eq(billingPeriod.status, 'validated'),
      eq(billingPeriod.status, 'closed')
    ))
    .orderBy(
      sql`case
        when ${billingPeriod.status} = 'active' then 0
        else 1
      end`,
      desc(billingPeriod.year),
      desc(billingPeriod.month)
    )
    .limit(1)

  if (!displayPeriod) return null

  /**
   * METRIC INTENT & FUTURE COMPATIBILITY (Alignment Phase 1)
   *
   * totalAmountBilled: Collection Period Billing Import (from external system).
   * totalCollected: Future Daily Collection Import from External Billing System.
   * receiptsToday: Operational receipt count (Receipts Printed).
   * totalAmount: Today's Cash Receipts value recorded within this application.
   *
   * These labels prepare the system for future implementation of:
   * - Daily Collection Import
   * - Collection Reconciliation
   * - Business Day Closing
   * - Over-Collection Reporting
   */

  // Period Metrics
  const [stats] = await db
    .select({
      totalBills: count(billingRecord.id),
      customersImported: sql<number>`count(distinct ${billingRecord.customerId})::int`,
      totalAmountBilled: sum(billingRecord.totalDue),
    })
    .from(billingRecord)
    .where(eq(billingRecord.billingPeriodId, displayPeriod.id))

  // OFFICIAL COLLECTIONS: Confirmed via External Billing System (EBS)
  // Sum of matched records for THIS billing period
  const [ebsStats] = await db
    .select({
      totalConfirmed: sum(dailyCollectionRecord.amount),
    })
    .from(dailyCollectionRecord)
    .innerJoin(reconciliationMatch, eq(dailyCollectionRecord.id, reconciliationMatch.dailyCollectionRecordId))
    .innerJoin(receipt, eq(reconciliationMatch.receiptId, receipt.id))
    .innerJoin(billingRecord, eq(receipt.billingRecordId, billingRecord.id))
    .where(and(
      eq(billingRecord.billingPeriodId, displayPeriod.id),
      eq(dailyCollectionRecord.importStatus, 'matched')
    ))

  // OPERATIONAL CASH: Receipts printed but not yet necessarily confirmed by bank
  // Exclude voided receipts
  const voidedIdsSubquery = db
    .select({ id: auditLog.entityId })
    .from(auditLog)
    .where(eq(auditLog.action, 'receipt.void'))

  const [cashStats] = await db
    .select({
      totalCashInHand: sum(receipt.amount),
      receiptsToday: sql<number>`count(case when date(${receipt.createdAt}) = current_date then 1 end)::int`,
      customersPaidToday: sql<number>`count(distinct case when date(${receipt.createdAt}) = current_date then ${receipt.customerId} end)::int`,
    })
    .from(receipt)
    .leftJoin(billingRecord, eq(receipt.billingRecordId, billingRecord.id))
    .where(and(
      eq(billingRecord.billingPeriodId, displayPeriod.id),
      notInArray(receipt.id, voidedIdsSubquery)
    ))

  const recentUploads = await db
    .select({
      id: billingRun.id,
      schemeName: waterScheme.name,
      uploadedAt: billingRun.uploadedAt,
      totalCustomers: billingRun.totalCustomers,
      totalAmount: billingRun.totalAmount,
      status: billingRun.status,
    })
    .from(billingRun)
    .innerJoin(waterScheme, eq(billingRun.schemeId, waterScheme.id))
    .where(eq(billingRun.billingPeriodId, displayPeriod.id))
    .orderBy(desc(billingRun.uploadedAt)).limit(5)

  const totalBilled = Number(stats?.totalAmountBilled || 0)
  const totalCollected = Number(ebsStats?.totalConfirmed || 0)
  const cashInHand = Number(cashStats?.totalCashInHand || 0)
  const outstanding = Math.max(0, totalBilled - totalCollected)
  const progress = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0

  // Days remaining logic
  const now = new Date()
  const end = new Date(displayPeriod.endDate)
  const diffTime = end.getTime() - now.getTime()
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  return {
    displayPeriod,
    isActive: displayPeriod.status === 'active',
    totalBills: Number(stats?.totalBills || 0),
    customersImported: Number(stats?.customersImported || 0),
    totalBilled,
    totalCollected, // This is now CONFIRMED EBS money
    cashInHand,    // This is OPERATIONAL cash from receipts
    outstanding,
    progress,
    receiptsToday: Number(cashStats?.receiptsToday || 0),
    customersPaidToday: Number(cashStats?.customersPaidToday || 0),
    daysRemaining: Math.max(0, daysRemaining),
    recentUploads
  }
}

export async function getBillingHistory(limit = 100) {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")

  return db
    .select({
      id: billingRun.id,
      schemeName: waterScheme.name,
      periodName: billingPeriod.periodName,
      uploadedAt: billingRun.uploadedAt,
      totalCustomers: billingRun.totalCustomers,
      totalAmount: billingRun.totalAmount,
      status: billingRun.status,
      uploadedByName: userTable.name,
    })
    .from(billingRun)
    .innerJoin(waterScheme, eq(billingRun.schemeId, waterScheme.id))
    .innerJoin(billingPeriod, eq(billingRun.billingPeriodId, billingPeriod.id))
    .innerJoin(userTable, eq(billingRun.uploadedById, userTable.id))
    .orderBy(desc(billingRun.uploadedAt))
    .limit(limit)
}

/**
 * Fetch open (unpaid or partially paid) bills for a specific customer.
 */
export async function getOpenBillsForCustomer(customerId: string) {
  const current = await requireUser()
  if (!canIssueReceipt(current)) throw new Error("Forbidden")

  // Confirm the customer is within the caller's scope before returning their
  // billing data. Legitimate callers only ever pass a customerId that came
  // from a scope-filtered picker (quickSearchCustomers), so this is a no-op
  // for real usage and only blocks a customerId from outside the caller's scope.
  const [inScope] = await db
    .select({ id: customer.id })
    .from(customer)
    .where(and(eq(customer.id, customerId), applyCustomerScope(current)))
    .limit(1)
  if (!inScope) return []

  return db
    .select({
      id: billingRecord.id,
      totalDue: billingRecord.totalDue,
      status: billingRecord.status,
      periodName: billingPeriod.periodName,
      dueDate: billingRecord.dueDate,
    })
    .from(billingRecord)
    .innerJoin(billingPeriod, eq(billingRecord.billingPeriodId, billingPeriod.id))
    .where(
      and(
        eq(billingRecord.customerId, customerId),
        or(eq(billingRecord.status, "pending"), eq(billingRecord.status, "partially_paid"))
      )
    )
    .orderBy(desc(billingPeriod.year), desc(billingPeriod.month))
}

/**
 * Fetch details of a specific billing run.
 */
export async function getBillingRunDetails(runId: string) {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")

  const [run] = await db
    .select({
      id: billingRun.id,
      schemeName: waterScheme.name,
      periodName: billingPeriod.periodName,
      uploadedAt: billingRun.uploadedAt,
      totalCustomers: billingRun.totalCustomers,
      totalAmount: billingRun.totalAmount,
      status: billingRun.status,
      uploadedByName: userTable.name,
    })
    .from(billingRun)
    .innerJoin(waterScheme, eq(billingRun.schemeId, waterScheme.id))
    .innerJoin(billingPeriod, eq(billingRun.billingPeriodId, billingPeriod.id))
    .innerJoin(userTable, eq(billingRun.uploadedById, userTable.id))
    .where(eq(billingRun.id, runId))
    .limit(1)

  if (!run) return null

  const records = await db
    .select({
      id: billingRecord.id,
      customerName: customer.name,
      accountNumber: billingRecord.accountNumber,
      totalDue: billingRecord.totalDue,
      status: billingRecord.status,
    })
    .from(billingRecord)
    .innerJoin(customer, eq(billingRecord.customerId, customer.id))
    .where(eq(billingRecord.billingRunId, runId))
    .orderBy(customer.name)

  return { run, records }
}
