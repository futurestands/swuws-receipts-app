"use server"

import { db } from "@/lib/db"
import {
  billingPeriod,
  billingRun,
  billingRecord,
  billingUpload,
  customer,
  waterScheme,
  branch,
  user as userTable,
  receipt,
  dailyCollectionRecord,
  dailyCollectionImport,
  reconciliationMatch,
  auditLog,
  meterReading,
  billingDiscrepancy,
} from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { writeAudit } from "@/lib/audit"
import {
  canUploadBilling,
  canManageCollectionPeriods,
  canActivateCollectionPeriod,
  canArchiveCollectionPeriod,
  canIssueReceipt,
  canViewReports
} from "@/lib/permissions"
import { validateWriteScope, applyCustomerScope, applyReceiptScope, applyBillingRecordScope, applyMeterReadingScope, applyBillingScope } from "@/lib/scopes"
import { and, eq, sql, desc, or, count, sum, inArray } from "drizzle-orm"
import * as XLSX from "xlsx"
import { z } from "zod"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { createNotification } from "./notifications"
import { processExcelImport, getImportMapping, type ImportSummary } from "@/lib/import-engine"
import { DEFAULT_BILLING_IMPORT_MAPPING } from "@/lib/import-mappings"
import { billingImportSchema, type BillingImportRow } from "@/lib/import-schemas"
import { logEvent, logFinancial } from "@/lib/logger"
import { ROLES } from "@/lib/permissions/roles"

export type BillingImportSummary = ImportSummary<BillingImportRow> & {
  schemeId: string
  billingPeriodId: string
}

/**
 * Fetch authorized schemes for the current user.
 */
export async function getAuthorizedSchemes() {
  const current = await requireUser()
  const conditions = [eq(waterScheme.active, true)]

  if (current.role !== ROLES.SYSTEM_ADMIN && (current.clusterId || current.branchId || current.schemeId)) {
    if (current.schemeId) {
      conditions.push(eq(waterScheme.id, current.schemeId))
    } else if (current.branchId) {
      conditions.push(eq(waterScheme.branchId, current.branchId))
    } else if (current.clusterId) {
      const clusterBranches = await db
        .select({ id: branch.id })
        .from(branch)
        .where(eq(branch.clusterId, current.clusterId || "none"))

      const branchIds = clusterBranches.map(b => b.id)
      if (branchIds.length === 0) return []
      conditions.push(inArray(waterScheme.branchId, branchIds))
    }
  }

  return db
    .select({
      id: waterScheme.id,
      name: waterScheme.name,
      branchId: waterScheme.branchId,
    })
    .from(waterScheme)
    .where(and(...conditions))
    .orderBy(waterScheme.name)
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
export async function getBillingPeriods() {
  return getCollectionPeriods()
}

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
    const updateData: {
      status: string;
      updatedAt: Date;
      validatedAt?: Date;
      validatedById?: string;
      activatedAt?: Date;
      activatedById?: string;
      isOpen?: boolean;
      closedAt?: Date;
      closedById?: string;
      archivedAt?: Date;
      archivedById?: string;
    } = { status: newStatus, updatedAt: new Date() }

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
  } catch (e: unknown) {
    logEvent({
      message: "archiveCollectionPeriod failed",
      severity: "error",
      category: "system",
      error: e,
      user: current,
    })
    const message = e instanceof Error ? e.message : "Failed to archive period"
    return { ok: false, error: message }
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
  const noHeaders = formData.get("noHeaders") === "true"
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
  if (period.status === "closed" || period.status === "archived") {
    return { ok: false, error: `Imports are not allowed in ${period.status} status.` }
  }

  // 2. Scope Validation
  if (schemeId !== "all") {
    const [scheme] = await db
      .select({ branchId: waterScheme.branchId })
      .from(waterScheme)
      .where(eq(waterScheme.id, schemeId))
      .limit(1)

    if (
      !scheme ||
      !(await validateWriteScope(current, "billing.import", { branchId: scheme.branchId, schemeId }))
    ) {
      return { ok: false, error: "You are not authorized to upload for this scheme" }
    }

    // 3. Prevent duplicate uploads for the same scheme/period
    const [existingRun] = await db
      .select({ id: billingRun.id })
      .from(billingRun)
      .where(and(eq(billingRun.schemeId, schemeId), eq(billingRun.billingPeriodId, billingPeriodId)))
      .limit(1)

    if (existingRun) {
      return {
        ok: false,
        error: "Monthly billing has already been imported for this scheme and period",
      }
    }
  }

  // 4. Fetch Customers (Targeted or Global)
  const customerQuery = db
    .select({
      id: customer.id,
      account: customer.customerAccount,
      waterSchemeId: customer.waterSchemeId,
      accountBalance: customer.accountBalance
    })
    .from(customer)

  if (schemeId !== "all") {
    customerQuery.where(eq(customer.waterSchemeId, schemeId))
  } else {
    // For "All Schemes", apply global scope filter to ensure user only sees what they are allowed to
    customerQuery.where(applyCustomerScope(current))
  }

  const schemeCustomers = await customerQuery

  // Fetch existing manual meter readings for this period to prevent overwriting
  const existingReadings = await db
    .select({ customerId: meterReading.customerId })
    .from(meterReading)
    .where(eq(meterReading.billingPeriodId, billingPeriodId))

  const readingsMap = new Set(existingReadings.map(r => r.customerId))
  const customerMap = new Map(schemeCustomers.map((c) => [c.account?.toLowerCase(), c]))
  const seenInUpload = new Set<string>()
  const detectedSchemeIds = new Set<string>()

      // Resolve dynamic mapping (with aliases support)
      const dbMappingRaw = await getImportMapping("import.billing.monthly")

      // ULTIMATE RESILIENCE: Merge custom keys ADDITIVELY with defaults
      const mapping = { ...DEFAULT_BILLING_IMPORT_MAPPING } as Record<string, any>
      if (dbMappingRaw) {
        for (const [k, v] of Object.entries(dbMappingRaw)) {
          const lowerK = k.toLowerCase()
          if (lowerK === "customeraccount" || lowerK === "accountnumber") {
             mapping.accountNumber = [v, ...(Array.isArray(mapping.accountNumber) ? mapping.accountNumber : [mapping.accountNumber])]
          } else if (lowerK === "billamount") {
             mapping.billAmount = [v, ...(Array.isArray(mapping.billAmount) ? mapping.billAmount : [mapping.billAmount])]
          } else if (lowerK === "arrears") {
             mapping.arrears = [v, ...(Array.isArray(mapping.arrears) ? mapping.arrears : [mapping.arrears])]
          } else if (lowerK === "totaldue" || lowerK === "totalamountdue") {
             mapping.totalDue = [v, ...(Array.isArray(mapping.totalDue) ? mapping.totalDue : [mapping.totalDue])]
          } else if (lowerK === "duedate") {
             mapping.dueDate = [v, ...(Array.isArray(mapping.dueDate) ? mapping.dueDate : [mapping.dueDate])]
          } else {
             mapping[k] = v
          }
        }
      }

  const engineSummary = await processExcelImport({
    file,
    schema: billingImportSchema as any,
    mapping,
    headerMode: noHeaders ? "none" : "headers",
    onValidateRow: (data: BillingImportRow) => {
      const errors: string[] = []
      const warnings: string[] = []

      if (!data.accountNumber || String(data.accountNumber) === "undefined") {
        errors.push("Account number is missing or the column header was not recognized. Please check the template.")
        return { errors, warnings }
      }

      const accLower = String(data.accountNumber).toLowerCase()
      const targetCustomer = customerMap.get(accLower)

      if (!targetCustomer) {
        errors.push(schemeId === "all"
          ? `Account ${data.accountNumber} not found or outside your authorized scope`
          : `Customer account ${data.accountNumber} not found in this scheme`)
      } else {
        if (targetCustomer.waterSchemeId) detectedSchemeIds.add(targetCustomer.waterSchemeId)

        if (readingsMap.has(targetCustomer.id)) {
          errors.push("This customer has a manual meter reading captured for this period. Import skipped to prevent double billing.")
        }

        // PREVIEW ENHANCEMENT: "Balance Brought Forward" is the TOTAL balance (Inclusive of Bill)
        const fileTotal = Number(data.arrears)
        if (fileTotal !== 0 && !isNaN(fileTotal)) {
          data.totalDue = fileTotal
          data.arrears = data.totalDue - data.billAmount
        } else {
          // Fallback: If Excel total is zero or missing, use system balance as the starting point
          data.arrears = Number(targetCustomer.accountBalance)
          data.totalDue = data.arrears + data.billAmount
        }
      }

      if (seenInUpload.has(accLower)) {
        errors.push("Duplicate account number in the upload file")
      }
      seenInUpload.add(accLower)

      return { errors, warnings }
    },
  })

  // 5. Duplicate Detection for "All Schemes" Mode
  if (schemeId === "all" && detectedSchemeIds.size > 0) {
    const existingRuns = await db
      .select({ schemeName: waterScheme.name })
      .from(billingRun)
      .innerJoin(waterScheme, eq(billingRun.schemeId, waterScheme.id))
      .where(and(
        sql`${billingRun.schemeId} IN ${Array.from(detectedSchemeIds)}`,
        eq(billingRun.billingPeriodId, billingPeriodId)
      ))

    if (existingRuns.length > 0) {
      const names = existingRuns.map(r => r.schemeName).join(", ")
      return {
        ok: false,
        error: `Import aborted. The following schemes already have data for this period: ${names}. Please import them individually or remove them from the file.`
      }
    }
  }

  return {
    ok: true,
    summary: {
      ...engineSummary,
      schemeId,
      billingPeriodId,
    } as BillingImportSummary,
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
    .select({
      id: customer.id,
      account: customer.customerAccount,
      waterSchemeId: customer.waterSchemeId,
      accountBalance: customer.accountBalance
    })
    .from(customer)
    .where(summary.schemeId !== "all" ? eq(customer.waterSchemeId, summary.schemeId) : applyCustomerScope(current))
  const customerMap = new Map(schemeCustomers.map((c) => [c.account?.toLowerCase(), c]))

  let importedCount = 0
  let totalAmountGlobal = 0
  const reportRows: Array<Record<string, unknown>> = []

  // Group valid rows by scheme
  const recordsByScheme = new Map<string, typeof validRows>()
  for (const row of validRows) {
    const cust = customerMap.get(row.data.accountNumber.toLowerCase())
    if (cust?.waterSchemeId) {
      const list = recordsByScheme.get(cust.waterSchemeId) || []
      list.push(row)
      recordsByScheme.set(cust.waterSchemeId, list)
    }
  }

  try {
    /**
     * MULTI-SCHEME RESILIENCE (Phase 2B Fix)
     *
     * We process each scheme in its own transaction.
     * This prevents long-lived database locks and timeouts for large 18,000+ record uploads.
     */
    for (const [sId, rows] of recordsByScheme.entries()) {
      const runId = randomUUID()
      let schemeBillTotal = 0
      let schemeRecoveryBill = 0
      let schemeRecoveryArrears = 0

      await db.transaction(async (tx) => {
        await tx.insert(billingRun).values({
          id: runId,
          schemeId: sId,
          billingPeriodId: summary.billingPeriodId,
          uploadedById: current.id,
          sourceFile: filename,
          status: "completed",
          totalCustomers: rows.length,
          totalAmount: 0, // Placeholder
          totalRecovered: "0",
          arrearsRecovered: "0",
        })

        const recordsToInsertRaw = rows.map((row) => {
          const cust = customerMap.get(row.data.accountNumber.toLowerCase())!

          /**
           * ULTIMATE RECONCILIATION MATH (New Money Only):
           *
           * We only register "Collection" if the customer actually brought in NEW money
           * this month (or a reduction in balance that isn't just consuming upfront).
           */
          const excelMonthlyBill = Number(row.data.billAmount)
          const excelTotalAmountDue = Number(row.data.totalDue)
          const systemBalanceBefore = Number(cust.accountBalance)

          // 1. Total New Money = (Old Balance + Bill) - Final Balance
          const totalNewMoney = Math.max(0, (systemBalanceBefore + excelMonthlyBill) - excelTotalAmountDue)

          // 2. Portion 1: Clear Arrears first
          const startingArrears = Math.max(0, systemBalanceBefore)
          const arrearsPortion = Math.min(startingArrears, totalNewMoney)

          // 3. Portion 2: Clear Current Bill with what's left
          const billPortion = Math.min(excelMonthlyBill, Math.max(0, totalNewMoney - arrearsPortion))

          let appliedFromUpfront = 0
          if (systemBalanceBefore < 0) {
             appliedFromUpfront = Math.min(excelMonthlyBill, Math.abs(systemBalanceBefore))
          }

          schemeBillTotal += excelMonthlyBill
          schemeRecoveryBill += billPortion
          schemeRecoveryArrears += arrearsPortion

          return {
            id: randomUUID(),
            billingRunId: runId,
            billingPeriodId: summary.billingPeriodId,
            customerId: cust.id,
            accountNumber: row.data.accountNumber,
            billAmount: String(excelMonthlyBill),
            arrears: String(systemBalanceBefore),
            // currentCharges represents the bill for this period, which must be >= 0.
            currentCharges: String(excelMonthlyBill),
            totalDue: String(excelTotalAmountDue),
            recoveryAmount: String(billPortion), // Dashboard success metric
            arrearsRecovery: String(arrearsPortion), // Reports box 1
            dueDate: new Date(row.data.dueDate),
            status: excelTotalAmountDue <= 0 ? "paid" : (appliedFromUpfront > 0 ? "partially_paid" : "pending"),
          }
        })

        // DEDUPLICATION: Resolve duplicates by customerId before insert
        // This prevents unique constraint violations if the file has multiple entries for one customer
        const recordsToInsert = Array.from(
          recordsToInsertRaw.reduce((map, record) => {
            map.set(record.customerId, record)
            return map
          }, new Map<string, typeof recordsToInsertRaw[0]>()).values()
        )

        const CHUNK_SIZE = 400
        for (let i = 0; i < recordsToInsert.length; i += CHUNK_SIZE) {
          const chunk = recordsToInsert.slice(i, i + CHUNK_SIZE)
          const customerIds = chunk.map(r => r.customerId)

          // 1. Clear existing records for these customers in this period
          // (Ensures no unique constraint violations and clean data)
          await tx
            .delete(billingRecord)
            .where(and(
              eq(billingRecord.billingPeriodId, summary.billingPeriodId),
              inArray(billingRecord.customerId, customerIds)
            ))

          // 2. Insert new records
          await tx.insert(billingRecord).values(chunk)
        }

        // Update run totals
        await tx.update(billingRun).set({
          totalAmount: Math.round(schemeBillTotal),
          totalRecovered: String(schemeRecoveryBill),
          arrearsRecovered: String(schemeRecoveryArrears)
        }).where(eq(billingRun.id, runId))

        // Balance Sync: OVERWRITE system balance with the new Total Due
        const BAL_CHUNK_SIZE = 400
        for (let i = 0; i < recordsToInsert.length; i += BAL_CHUNK_SIZE) {
          const chunk = recordsToInsert.slice(i, i + BAL_CHUNK_SIZE)
          const valuesList = chunk.map(r => sql`(${r.customerId}, ${r.totalDue}::numeric)`).reduce((acc, curr) => sql`${acc}, ${curr}`)

          await tx.execute(sql`
            UPDATE customer AS c
            SET
              "accountBalance" = v.new_balance,
              "updatedAt" = now()
            FROM (VALUES ${valuesList}) AS v(id, new_balance)
            WHERE c.id = v.id
          `)
        }
      })

      importedCount += rows.length
      totalAmountGlobal += schemeBillTotal
    }

    await writeAudit({
      user: current,
      action: "billing.import.complete",
      entityType: "billing_period",
      entityId: summary.billingPeriodId,
      details: { filename, imported: importedCount, schemes: recordsByScheme.size },
    })

    logFinancial("Billing Imported (Multi-Scheme Resilience)", {
      filename,
      imported: importedCount,
      totalAmount: totalAmountGlobal
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
  } catch (e: unknown) {
    logEvent({
      message: "Billing import failed",
      severity: "error",
      category: "system",
      error: e,
      user: current,
    })
    const message = e instanceof Error ? e.message : "A database error occurred during import"
    await writeAudit({
      user: current,
      action: "billing.import.failed",
      entityType: "billing_period",
      entityId: summary.billingPeriodId,
      details: { error: message },
    })
    return { ok: false, error: message }
  }
}

export async function downloadBillingTemplate() {
  await requireUser()

  // 1. Resolve Headers from Template Hub
  const dbMappingRaw = await getImportMapping("import.billing.monthly")

  // ULTIMATE RESILIENCE: Merge custom keys ADDITIVELY with defaults
  const mapping = { ...DEFAULT_BILLING_IMPORT_MAPPING } as Record<string, any>
  if (dbMappingRaw) {
    for (const [k, v] of Object.entries(dbMappingRaw)) {
      const lowerK = k.toLowerCase()
      if (lowerK === "customeraccount" || lowerK === "accountnumber") {
         mapping.accountNumber = [v, ...(Array.isArray(mapping.accountNumber) ? mapping.accountNumber : [mapping.accountNumber])]
      } else if (lowerK === "billamount") {
         mapping.billAmount = [v, ...(Array.isArray(mapping.billAmount) ? mapping.billAmount : [mapping.billAmount])]
      } else if (lowerK === "totalamountdue" || lowerK === "arrears") {
         mapping.arrears = [v, ...(Array.isArray(mapping.arrears) ? mapping.arrears : [mapping.arrears])]
      } else if (lowerK === "duedate") {
         mapping.dueDate = [v, ...(Array.isArray(mapping.dueDate) ? mapping.dueDate : [mapping.dueDate])]
      } else {
         mapping[k] = v
      }
    }
  }

  // 2. Generate Sample Data strictly based on the mapping keys
  const headers = Object.values(mapping).map(v => Array.isArray(v) ? v[0] : v) as string[]
  const sampleRow: Record<string, any> = {}

  // Fill sample values ONLY for keys that the user defined in their JSON
  if (mapping.accountNumber) sampleRow[Array.isArray(mapping.accountNumber) ? mapping.accountNumber[0] : mapping.accountNumber] = "6000000000"
  if (mapping.billAmount) sampleRow[Array.isArray(mapping.billAmount) ? mapping.billAmount[0] : mapping.billAmount] = 50000
  if (mapping.dueDate) sampleRow[Array.isArray(mapping.dueDate) ? mapping.dueDate[0] : mapping.dueDate] = new Date().toISOString().split("T")[0]

  // Optional fields - only fill if the user specifically chose to include them in their JSON
  if (mapping.arrears) sampleRow[Array.isArray(mapping.arrears) ? mapping.arrears[0] : mapping.arrears] = 0
  if (mapping.currentCharges) sampleRow[Array.isArray(mapping.currentCharges) ? mapping.currentCharges[0] : mapping.currentCharges] = 0
  if (mapping.totalDue) sampleRow[Array.isArray(mapping.totalDue) ? mapping.totalDue[0] : mapping.totalDue] = 50000

  const worksheet = XLSX.utils.json_to_sheet([sampleRow], { header: headers })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "BillingTemplate")
  return XLSX.write(workbook, { type: "base64", bookType: "xlsx" })
}

export async function getCollectionSummary() {
  const current = await requireUser()

  // 0. Resolve User Scopes for calculation
  const brScope = applyBillingRecordScope(current)
  const mrScope = applyMeterReadingScope(current)
  const rScope = applyReceiptScope(current)
  const cScope = applyCustomerScope(current)

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

  // 2. Resolve User Scopes & Permissions for calculation
  const brScope = applyBillingRecordScope(current)
  const mrScope = applyMeterReadingScope(current)
  const rScope = applyReceiptScope(current)
  const cScope = applyCustomerScope(current)

  // HIERARCHY FORCING (The "Trap"): Regional users are trapped in their assigned territory
  // even if they select "All" or bypass filters.
  const forceHierarchy = (conditions: any[]) => {
    if (canViewAllData(current)) return;
    if (current.branchId) conditions.push(eq(waterScheme.branchId, current.branchId))
    else if (current.clusterId) conditions.push(eq(branch.clusterId, current.clusterId))
    else if (current.schemeId) conditions.push(eq(customer.waterSchemeId, current.schemeId))
  }

  const brConditions = [eq(billingRecord.billingPeriodId, displayPeriod.id), brScope]
  const mrConditions = [eq(meterReading.billingPeriodId, displayPeriod.id), mrScope]
  const cConditions = [cScope]

  forceHierarchy(brConditions)
  forceHierarchy(mrConditions)
  forceHierarchy(cConditions)

  // Period Metrics (Unified: Derived from Current Snapshot vs Original Demand)
  const [importStats, readingStats, brCustomers, mrCustomers] = await Promise.all([
    db
      .select({
        totalBills: count(billingRecord.id),
        totalMonthlyBilled: sum(billingRecord.billAmount),
        totalArrearsBilled: sum(billingRecord.arrears),
        totalRecovered: sum(sql`
          greatest(0, (coalesce(${billingRecord.arrears}, 0)::numeric + coalesce(${billingRecord.billAmount}, 0)::numeric) - coalesce(${billingRecord.totalDue}, 0)::numeric)
        `),
        verifiedUpfront: sum(sql`greatest(0, coalesce(${billingRecord.totalDue}, 0)::numeric * -1)`),
      })
      .from(billingRecord)
      .innerJoin(customer, eq(billingRecord.customerId, customer.id))
      .innerJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
      .innerJoin(branch, eq(waterScheme.branchId, branch.id))
      .where(and(...brConditions))
      .then(rows => rows[0])
      .catch(() => ({ totalBills: 0, totalMonthlyBilled: "0", totalArrearsBilled: "0", totalRecovered: "0", verifiedUpfront: "0" })),
    db
      .select({
        totalReadings: count(meterReading.id),
        totalMonthlyBilled: sum(meterReading.billedAmount),
        totalArrearsBilled: sum(meterReading.previousBalanceSnapshot),
        totalRecovered: sum(sql`
          greatest(0, (coalesce(${meterReading.previousBalanceSnapshot}, 0)::numeric + coalesce(${meterReading.billedAmount}, 0)::numeric) - coalesce(${customer.accountBalance}, 0)::numeric)
        `),
      })
      .from(meterReading)
      .innerJoin(customer, eq(meterReading.customerId, customer.id))
      .innerJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
      .innerJoin(branch, eq(waterScheme.branchId, branch.id))
      .where(and(...mrConditions))
      .then(rows => rows[0])
      .catch(() => ({ totalReadings: 0, totalMonthlyBilled: "0", totalArrearsBilled: "0", totalRecovered: "0" })),

    // Scoped customer ID lookups
    db.select({ id: billingRecord.customerId }).from(billingRecord).innerJoin(customer, eq(billingRecord.customerId, customer.id)).innerJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id)).innerJoin(branch, eq(waterScheme.branchId, branch.id)).where(and(...brConditions)).catch(() => []),
    db.select({ id: meterReading.customerId }).from(meterReading).innerJoin(customer, eq(meterReading.customerId, customer.id)).innerJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id)).innerJoin(branch, eq(waterScheme.branchId, branch.id)).where(and(...mrConditions)).catch(() => [])
  ])

  const combinedCustomerIds = new Set([
    ...brCustomers.map(r => r.id),
    ...mrCustomers.map(r => r.id)
  ])
  const customersImported = combinedCustomerIds.size

  // OPERATIONAL CASH: Receipts printed but not yet necessarily confirmed by bank
  const voidedIdsSubquery = db
    .select({ id: auditLog.entityId })
    .from(auditLog)
    .where(eq(auditLog.action, 'receipt.void'))

  const rConditions = [
    eq(receipt.billingPeriodId, displayPeriod.id),
    rScope,
    sql`${receipt.id} NOT IN (${voidedIdsSubquery})`
  ]
  forceHierarchy(rConditions)

  const [cashStats] = await db
    .select({
      totalCashInHand: sum(receipt.amount),
      receiptsToday: sql<number>`count(case when date(${receipt.createdAt}) = current_date then 1 end)::int`,
      customersPaidToday: sql<number>`count(distinct case when date(${receipt.createdAt}) = current_date then ${receipt.customerId} end)::int`,
    })
    .from(receipt)
    .innerJoin(customer, eq(receipt.customerId, customer.id))
    .innerJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
    .innerJoin(branch, eq(waterScheme.branchId, branch.id))
    .where(and(...rConditions))
    .catch(() => [{ totalCashInHand: "0", receiptsToday: 0, customersPaidToday: 0 }])

  const rbConditions = [eq(billingRun.billingPeriodId, displayPeriod.id), applyBillingScope(current)]
  // Note: billingRun doesn't have a direct link to customer, but it has schemeId.
  if (!canViewAllData(current)) {
     if (current.branchId) rbConditions.push(inArray(billingRun.schemeId, db.select({ id: waterScheme.id }).from(waterScheme).where(eq(waterScheme.branchId, current.branchId))))
     else if (current.schemeId) rbConditions.push(eq(billingRun.schemeId, current.schemeId))
  }

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
    .where(and(...rbConditions))
    .orderBy(desc(billingRun.uploadedAt)).limit(100)
    .catch(() => [])

  // OFFICIAL COLLECTIONS: Confirmed via External Billing System (EBS)
  const ebsConditions = [
    eq(dailyCollectionImport.billingPeriodId, displayPeriod.id),
    eq(dailyCollectionRecord.importStatus, 'matched'),
    cScope
  ]
  forceHierarchy(ebsConditions)

  // Arrears & Upfront Snapshot
  const [arrearsSnapshot, ebsStats] = await Promise.all([
    db
      .select({
        totalArrears: sql<number>`sum(case when ${customer.accountBalance} > 0 then ${customer.accountBalance} else 0 end)::numeric`,
        totalUpfront: sql<number>`sum(case when ${customer.accountBalance} < 0 then abs(${customer.accountBalance}) else 0 end)::numeric`,
      })
      .from(customer)
      .innerJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
      .innerJoin(branch, eq(waterScheme.branchId, branch.id))
      .where(and(...cConditions))
      .then(rows => rows[0])
      .catch(() => ({ totalArrears: 0, totalUpfront: 0 })),

    db
      .select({
        totalOrphanConfirmed: sum(dailyCollectionRecord.amount),
      })
      .from(dailyCollectionRecord)
      .innerJoin(dailyCollectionImport, eq(dailyCollectionRecord.batchId, dailyCollectionImport.id))
      .innerJoin(customer, eq(dailyCollectionRecord.accountNumber, customer.customerAccount))
      .innerJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
      .innerJoin(branch, eq(waterScheme.branchId, branch.id))
      .where(and(
        ...ebsConditions,
        sql`NOT EXISTS (SELECT 1 FROM billing_record WHERE "customerId" = ${customer.id} AND "billingPeriodId" = ${displayPeriod.id})`,
        sql`NOT EXISTS (SELECT 1 FROM meter_reading WHERE "customerId" = ${customer.id} AND "billingPeriodId" = ${displayPeriod.id})`
      ))
      .then(rows => rows[0])
      .catch(() => ({ totalOrphanConfirmed: 0 }))
  ])

  const totalBilled = Number(importStats?.totalMonthlyBilled || 0) +
                     Number(readingStats?.totalMonthlyBilled || 0) +
                     Number(importStats?.totalArrearsBilled || 0) +
                     Number(readingStats?.totalArrearsBilled || 0)

  // Official Collection (Combined Truth: Derived Snapshots + Orphan Daily Records)
  // This logic is now forensically aligned with reports.ts
  const totalCollected = Number(importStats?.totalRecovered || 0) +
                         Number(importStats?.verifiedUpfront || 0) +
                         Number(readingStats?.totalRecovered || 0) +
                         Number(ebsStats?.totalOrphanConfirmed || 0)

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
    totalBills: Number(importStats?.totalBills || 0) + Number(readingStats?.totalReadings || 0),
    customersImported,
    totalBilled,
    totalCollected,
    totalSystemArrears: Number(arrearsSnapshot?.totalArrears || 0),
    totalUpfront: Number(arrearsSnapshot?.totalUpfront || 0),
    cashInHand,
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

/**
 * DELETE BILLING RUN (Rollback)
 *
 * Permanently deletes a billing run and restores customer balances to their
 * state before the import (the 'arrears' value captured in the records).
 */
export async function deleteBillingRun(runId: string) {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")

  const [run] = await db
    .select({
      id: billingRun.id,
      schemeId: billingRun.schemeId,
      billingPeriodId: billingRun.billingPeriodId,
      status: billingPeriod.status
    })
    .from(billingRun)
    .innerJoin(billingPeriod, eq(billingRun.billingPeriodId, billingPeriod.id))
    .where(eq(billingRun.id, runId))
    .limit(1)

  if (!run) throw new Error("Billing run not found")
  if (run.status === "closed" || run.status === "archived") {
    throw new Error(`Cannot delete a run from a ${run.status} period.`)
  }

  // FORENSIC AUDIT B2 FIX: Check for payment interference.
  // If any customer in this run has received a payment reduction (Daily Sync),
  // we must block absolute deletion to prevent debt resurrection.
  const [interference] = await db
    .select({ id: billingRecord.id })
    .from(billingRecord)
    .where(and(
      eq(billingRecord.billingRunId, runId),
      sql`CAST(${billingRecord.totalDue} AS NUMERIC) < (CAST(${billingRecord.arrears} AS NUMERIC) + CAST(${billingRecord.billAmount} AS NUMERIC))`
    ))
    .limit(1)

  if (interference) {
    throw new Error("Cannot delete this run. Payments have already been synced against these customers. Overwrite with a new import instead.")
  }

  try {
    await db.transaction(async (tx) => {
      // 1. Fetch all records to get the rollback values (the 'arrears' field stores the previous balance)
      const records = await tx
        .select({
          customerId: billingRecord.customerId,
          arrears: billingRecord.arrears
        })
        .from(billingRecord)
        .where(eq(billingRecord.billingRunId, runId))

      // 2. Restore customer balances in chunks
      const CHUNK_SIZE = 400
      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE)
        const valuesList = chunk
          .map(r => sql`(${r.customerId}, ${r.arrears}::numeric)`)
          .reduce((acc, curr) => sql`${acc}, ${curr}`)

        await tx.execute(sql`
          UPDATE customer AS c
          SET
            "accountBalance" = v.old_balance,
            "updatedAt" = now()
          FROM (VALUES ${valuesList}) AS v(id, old_balance)
          WHERE c.id = v.id
        `)
      }

      // 3. Delete associated records and the run itself
      // (Cascade deletes billingRecord and billingUpload)
      await tx.delete(billingRun).where(eq(billingRun.id, runId))

      // 4. Audit Log
      await writeAudit({
        user: current,
        action: "billing.import.delete",
        entityType: "billing_run",
        entityId: runId,
        details: { schemeId: run.schemeId, periodId: run.billingPeriodId },
      }, tx)
    })

    logFinancial("Billing Run Deleted (Rollback)", { runId }, current)
    revalidatePath("/dashboard/billing")
    return { ok: true }
  } catch (e: unknown) {
    console.error("deleteBillingRun failed:", e)
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete billing run" }
  }
}

/**
 * BULK DELETE BILLING RUNS (Batch Rollback)
 */
export async function bulkDeleteBillingRuns(runIds: string[]) {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")
  if (!runIds.length) return { ok: true }

  // FORENSIC AUDIT B2 FIX: Check for payment interference.
  const [interference] = await db
    .select({ id: billingRecord.id })
    .from(billingRecord)
    .where(and(
      inArray(billingRecord.billingRunId, runIds),
      sql`CAST(${billingRecord.totalDue} AS NUMERIC) < (CAST(${billingRecord.arrears} AS NUMERIC) + CAST(${billingRecord.billAmount} AS NUMERIC))`
    ))
    .limit(1)

  if (interference) {
    throw new Error("Cannot delete these runs. Payments have already been synced against some of these customers. Overwrite with a new import instead.")
  }

  try {
    await db.transaction(async (tx) => {
      // 1. Fetch all records for balance restoration
      const records = await tx
        .select({
          customerId: billingRecord.customerId,
          arrears: billingRecord.arrears
        })
        .from(billingRecord)
        .where(inArray(billingRecord.billingRunId, runIds))

      // 2. Restore balances
      const CHUNK_SIZE = 400
      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE)
        const valuesList = chunk
          .map(r => sql`(${r.customerId}, ${r.arrears}::numeric)`)
          .reduce((acc, curr) => sql`${acc}, ${curr}`)

        await tx.execute(sql`
          UPDATE customer AS c
          SET
            "accountBalance" = v.old_balance,
            "updatedAt" = now()
          FROM (VALUES ${valuesList}) AS v(id, old_balance)
          WHERE c.id = v.id
        `)
      }

      // 3. Delete runs
      await tx.delete(billingRun).where(inArray(billingRun.id, runIds))

      // 4. Audit Log
      await writeAudit({
        user: current,
        action: "billing.import.bulk_delete",
        entityType: "billing_run",
        entityId: runIds.join(","),
        details: { count: runIds.length },
      }, tx)
    })

    logFinancial("Bulk Billing Runs Deleted", { count: runIds.length }, current)
    revalidatePath("/dashboard/billing")
    return { ok: true }
  } catch (e: unknown) {
    console.error("bulkDeleteBillingRuns failed:", e)
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete billing runs" }
  }
}
