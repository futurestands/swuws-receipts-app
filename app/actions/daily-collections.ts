"use server"

import { db } from "@/lib/db"
import {
  dailyCollectionImport,
  dailyCollectionRecord,
  user as userTable,
  customer,
  billingPeriod,
  billingRecord,
  billingRun,
  billingDiscrepancy,
} from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { canUploadBilling } from "@/lib/permissions"
import { eq, ne, desc, and, ilike, or, sql, count, inArray, gt, getTableColumns } from "drizzle-orm"
import { randomUUID, createHash } from "crypto"
import * as XLSX from "xlsx"
import { z } from "zod"
import { revalidatePath } from "next/cache"
import { writeAudit } from "@/lib/audit"
import { getImportMapping, processExcelImport } from "@/lib/import-engine"
import { DEFAULT_DAILY_SYNC_MAPPING } from "@/lib/import-mappings"
import { applyCustomerScope, applyBillingRecordScope, applyUserScope } from "@/lib/scopes"
import { closeExpiredActivePeriods } from "@/lib/billing/close-expired"
import { effectiveBillTakenDate, resolvePeriodIdForCustomerPayment, resolvePeriodIdForPayment } from "@/lib/billing/period-dates"
import { pgInsertChunkSize } from "@/lib/db/bulk"
import { getSettings } from "@/app/actions/settings"
import { findClosedPeriodForLatePayment } from "@/lib/billing/cross-period"

const REQUIRED_COLUMNS = [
  "Account Number",
  "Customer Name",
  "Amount Paid",
  "Payment Date",
  "External Reference",
  "Payment Channel"
]

const DEFAULT_DAILY_IMPORT_MAPPING = {
  accountNumber: "Account Number",
  customerName: "Customer Name",
  amountPaid: "Amount Paid",
  paymentDate: "Payment Date",
  externalReference: "External Reference",
  paymentChannel: "Payment Channel",
  scheme: "Scheme",
  area: "Area"
}

const dailyRowSchema = z.object({
  accountNumber: z.string().trim().min(1, "Account Number is required"),
  customerName: z.string().trim().min(1, "Customer Name is required"),
  amountPaid: z.number().positive("Amount must be greater than zero"),
  paymentDate: z.string().refine(val => !isNaN(Date.parse(val)), "Invalid Payment Date"),
  externalReference: z.string().trim().min(1, "External Reference is required"),
  paymentChannel: z.string().trim().min(1, "Payment Channel is required"),
  scheme: z.string().optional(),
  area: z.string().optional(),
})

export type DailyImportRow = z.infer<typeof dailyRowSchema>

export interface DailyValidationSummary {
  filename: string
  fileHash: string
  businessDate: string
  totalRecords: number
  validRecords: number
  failedRecords: number
  totalAmount: number
  previewRows: { valid: boolean; errors: string[]; data: DailyImportRow }[]
  isDuplicateFile: boolean
  isDuplicateDate: boolean
}

/**
 * Returns metadata for previously uploaded daily collection reports.
 */
export async function listDailyImports() {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")

  const userScope = applyUserScope(current)

  return db
    .select({
      id: dailyCollectionImport.id,
      businessDate: dailyCollectionImport.businessDate,
      filename: dailyCollectionImport.filename,
      totalRecords: dailyCollectionImport.totalRecords,
      totalAmount: dailyCollectionImport.totalAmount,
      status: dailyCollectionImport.status,
      uploadedByName: userTable.name,
      createdAt: dailyCollectionImport.createdAt,
    })
    .from(dailyCollectionImport)
    .innerJoin(userTable, eq(dailyCollectionImport.uploadedById, userTable.id))
    .where(userScope)
    .orderBy(desc(dailyCollectionImport.businessDate), desc(dailyCollectionImport.createdAt))
}

async function calculateHash(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer())
  return createHash("sha256").update(buffer).digest("hex")
}

/**
 * Validates the Daily Collection report structure and data.
 */
export async function validateDailyCollectionImport(formData: FormData): Promise<{ ok: true; summary: DailyValidationSummary } | { ok: false; error: string }> {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")

  const file = formData.get("file") as File
  if (!file || file.size === 0) return { ok: false, error: "No file provided" }

  const fileHash = await calculateHash(file)

  // Duplicate Check
  const [existingHash] = await db.select({ id: dailyCollectionImport.id }).from(dailyCollectionImport).where(eq(dailyCollectionImport.fileHash, fileHash)).limit(1)

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer)
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  const rawData = XLSX.utils.sheet_to_json(firstSheet)

  if (rawData.length === 0) return { ok: false, error: "The file is empty" }

  const results: { valid: boolean; errors: string[]; data: DailyImportRow }[] = []
  let totalAmount = 0
  let validCount = 0
  let businessDate: string | null = null

  // Check columns
  const firstRow = rawData[0] as Record<string, unknown>
  const missingColumns = REQUIRED_COLUMNS.filter(col => !(col in firstRow))
  if (missingColumns.length > 0) return { ok: false, error: `Missing columns: ${missingColumns.join(", ")}` }

  const seenRefs = new Set<string>()

  for (const rawRow of rawData as Array<Record<string, unknown>>) {
    const errors: string[] = []
    const mappedRow: DailyImportRow = {
      accountNumber: String(rawRow["Account Number"] || "").trim(),
      customerName: String(rawRow["Customer Name"] || "").trim(),
      amountPaid: Number(rawRow["Amount Paid"] || 0),
      paymentDate: String(rawRow["Payment Date"] || ""),
      externalReference: String(rawRow["External Reference"] || "").trim(),
      paymentChannel: String(rawRow["Payment Channel"] || "").trim(),
      scheme: rawRow["Scheme"] as string | undefined,
      area: rawRow["Area"] as string | undefined,
    }

    const parsed = dailyRowSchema.safeParse(mappedRow)
    if (!parsed.success) parsed.error.issues.forEach(i => errors.push(i.message))
    if (seenRefs.has(mappedRow.externalReference)) errors.push(`Duplicate Ref: ${mappedRow.externalReference}`)
    seenRefs.add(mappedRow.externalReference)

    const isValid = errors.length === 0
    if (isValid) {
      validCount++; totalAmount += mappedRow.amountPaid;
      if (!businessDate) businessDate = mappedRow.paymentDate
    }
    results.push({ valid: isValid, errors, data: mappedRow })
  }

  return {
    ok: true,
    summary: {
      filename: file.name, fileHash, businessDate: businessDate || "",
      totalRecords: rawData.length, validRecords: validCount, failedRecords: rawData.length - validCount,
      totalAmount, previewRows: results.slice(0, 100), isDuplicateFile: !!existingHash, isDuplicateDate: false
    }
  }
}

/**
 * Commits the Daily Collection Import using FormData to re-process the file on the server.
 * Optimized for high-volume (20k+ records).
 */
export async function commitDailyCollectionImport(formData: FormData) {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")

  const file = formData.get("file") as File
  if (!file || file.size === 0) return { ok: false, error: "No file provided" }

  const startTime = Date.now()
  const importId = randomUUID()

  try {
    const fileHash = await calculateHash(file)
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer)
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    const rawData = XLSX.utils.sheet_to_json(firstSheet) as Record<string, unknown>[]

    if (rawData.length === 0) return { ok: false, error: "The file is empty" }
    if (rawData.length > 30000) return { ok: false, error: "File too large. Maximum 30,000 records allowed per import." }

    console.log(`[DailyImport] Starting commit for ${file.name} (${rawData.length} rows)`)

    await closeExpiredActivePeriods()
    const periods = await db.select({
      id: billingPeriod.id,
      status: billingPeriod.status,
      startDate: billingPeriod.startDate,
      endDate: billingPeriod.endDate,
    }).from(billingPeriod).where(ne(billingPeriod.status, "archived"))
    const activePeriod = periods.find((p) => p.status === "active")

    let totalAmount = 0
    let validCount = 0
    let businessDate: string | null = null
    const validRecords: any[] = []

    // Process rows into memory first
    for (const rawRow of rawData) {
      const mappedRow: DailyImportRow = {
        accountNumber: String(rawRow["Account Number"] || "").trim(),
        customerName: String(rawRow["Customer Name"] || "").trim(),
        amountPaid: Number(rawRow["Amount Paid"] || 0),
        paymentDate: String(rawRow["Payment Date"] || ""),
        externalReference: String(rawRow["External Reference"] || "").trim(),
        paymentChannel: String(rawRow["Payment Channel"] || "").trim(),
        scheme: rawRow["Scheme"] as string | undefined,
        area: rawRow["Area"] as string | undefined,
      }

      const parsed = dailyRowSchema.safeParse(mappedRow)
      if (parsed.success) {
        validCount++
        totalAmount += mappedRow.amountPaid
        if (!businessDate) businessDate = mappedRow.paymentDate
        validRecords.push({
          id: randomUUID(),
          batchId: importId,
          accountNumber: mappedRow.accountNumber,
          customerName: mappedRow.customerName,
          amount: mappedRow.amountPaid,
          paymentDate: new Date(mappedRow.paymentDate),
          externalReference: mappedRow.externalReference,
          paymentChannel: mappedRow.paymentChannel,
          schemeName: mappedRow.scheme,
          branchName: mappedRow.area,
          importStatus: 'imported' as const,
        })
      }
    }

    const batchPeriodId = resolvePeriodIdForPayment(
      businessDate ? new Date(businessDate) : validRecords[0]?.paymentDate ?? null,
      periods,
      activePeriod?.id ?? null,
    )

    await db.transaction(async (tx) => {
      // 1. Insert Metadata
      await tx.insert(dailyCollectionImport).values({
        id: importId,
        businessDate: businessDate ? new Date(businessDate) : new Date(),
        billingPeriodId: batchPeriodId,
        filename: file.name,
        fileHash: fileHash,
        uploadedById: current.id,
        status: 'processed',
        totalRecords: rawData.length,
        totalAmount: totalAmount,
      })

      // 2. Chunked Inserts for Records (500 at a time for safety)
      const CHUNK = pgInsertChunkSize(14)
      for (let i = 0; i < validRecords.length; i += CHUNK) {
        const chunk = validRecords.slice(i, i + CHUNK)
        console.log(`[DailyImport] Inserting chunk ${Math.floor(i / CHUNK) + 1} of ${Math.ceil(validRecords.length / CHUNK)}`)
        await tx.insert(dailyCollectionRecord).values(chunk)
      }

      await writeAudit({
        user: current,
        action: "daily_collection.import",
        entityType: "daily_collection_import",
        entityId: importId,
        details: { filename: file.name, amount: totalAmount, records: validCount }
      }, tx)
    })

    console.log(`[DailyImport] Successfully committed ${validCount} records in ${Date.now() - startTime}ms`)
    revalidatePath("/dashboard/billing/daily")
    return { ok: true, id: importId }
  } catch (err: any) {
    console.error("Daily Collection Import Failed:", err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : "An unexpected error occurred during import. The file might be too large or malformed."
    }
  }
}

const dailySyncSchema = z.object({
  accountNumber: z.coerce.string().trim().min(1, "Account Number is required"),
  totalDue: z.coerce.number().default(0),
  paymentDate: z.preprocess((val) => {
    if (!val) return null
    const d = new Date(val as any)
    return isNaN(d.getTime()) ? null : d
  }, z.date().nullable().optional()),
})

export type DailySyncRow = z.infer<typeof dailySyncSchema>

export interface DailySyncSummary {
  filename: string
  fileHash: string
  totalRecords: number
  validRecords: number
  failedRecords: number
  totalCollection: number
  previewRows: { valid: boolean; errors: string[]; data: DailySyncRow; collection: number }[]
}

/**
 * DAILY BALANCE SYNC (Simplified Import)
 */
export async function validateDailyBalanceSync(formData: FormData): Promise<{ ok: true; summary: DailySyncSummary } | { ok: false; error: string }> {
  try {
    const current = await requireUser()
    if (!canUploadBilling(current)) throw new Error("Forbidden")

    const file = formData.get("file") as File
    if (!file || file.size === 0) return { ok: false, error: "No file provided" }

    const fileHash = await calculateHash(file)

    // 1. Efficient Pre-Processing: Extract account numbers from file before DB lookup
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer)
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    const rawData = XLSX.utils.sheet_to_json(firstSheet) as Record<string, any>[]

    if (rawData.length === 0) return { ok: false, error: "The file is empty" }

    // Resolve custom mapping to find the account number column
    const dbMappingRaw = await getImportMapping("import.daily.collections")
    const mapping = { ...DEFAULT_DAILY_SYNC_MAPPING } as Record<string, any>
    if (dbMappingRaw) {
      for (const [k, v] of Object.entries(dbMappingRaw)) {
        const lowerK = k.toLowerCase()
        if (lowerK === "accountnumber" || lowerK === "customeraccount") {
          mapping.accountNumber = [v, ...(Array.isArray(mapping.accountNumber) ? mapping.accountNumber : [mapping.accountNumber])]
        }
      }
    }

    // Identify account number column in file
    const accountAliases = Array.isArray(mapping.accountNumber) ? mapping.accountNumber : [mapping.accountNumber]
    const firstRow = rawData[0]
    const accountCol = Object.keys(firstRow).find(h =>
      accountAliases.some(a => String(h).toLowerCase().replace(/[^a-z0-9]/g, "") === String(a).toLowerCase().replace(/[^a-z0-9]/g, ""))
    ) || accountAliases[0]

    const accountNumbersInFile = Array.from(new Set(
      rawData.map(row => String(row[accountCol as string] || "").trim()).filter(Boolean)
    ))

    // 2. Bulk Fetch only relevant customers with scoping
    const customerScope = applyCustomerScope(current)
    const filteredCustomers = await db
      .select({ id: customer.id, account: customer.customerAccount, balance: customer.accountBalance })
      .from(customer)
      .where(and(
        inArray(customer.customerAccount, accountNumbersInFile),
        customerScope
      ))

    const customerMap = new Map(filteredCustomers.map(c => [c.account?.toLowerCase().trim(), c]))

    // Re-resolve full mapping for the engine
    if (dbMappingRaw) {
      for (const [k, v] of Object.entries(dbMappingRaw)) {
        const lowerK = k.toLowerCase()
        if (lowerK === "totaldue" || lowerK === "totalamountdue") {
          mapping.totalDue = [v, ...(Array.isArray(mapping.totalDue) ? mapping.totalDue : [mapping.totalDue])]
        } else if (lowerK === "paymentdate" || lowerK === "lastpaymentdate") {
          mapping.paymentDate = [v, ...(Array.isArray(mapping.paymentDate) ? mapping.paymentDate : [mapping.paymentDate])]
        } else if (lowerK !== "accountnumber" && lowerK !== "customeraccount") {
          mapping[k] = v
        }
      }
    }

    const engineSummary = await processExcelImport({
      file,
      schema: dailySyncSchema as any,
      mapping: mapping as any,
      onValidateRow: (data: DailySyncRow) => {
        const errors: string[] = []
        if (!customerMap.has(data.accountNumber.toLowerCase().trim())) {
          errors.push(`Account not found or access denied: ${data.accountNumber}`)
        }
        return { errors, warnings: [] }
      }
    })

    let totalCollection = 0
    const rows = engineSummary.rows.map(r => {
      let collection = 0
      if (r.valid) {
        const cust = customerMap.get(r.data.accountNumber.toLowerCase().trim())!
        collection = Math.max(0, Number(cust.balance) - r.data.totalDue)
        totalCollection += collection
      }
      return { ...r, collection }
    })

    return {
      ok: true,
      summary: {
        filename: file.name,
        fileHash,
        totalRecords: engineSummary.totalRows,
        validRecords: engineSummary.validRows,
        failedRecords: engineSummary.errorRows,
        totalCollection,
        previewRows: rows.slice(0, 100)
      }
    }
  } catch (err: any) {
    console.error("Daily Balance Sync Validation Failed:", err)
    return { ok: false, error: err instanceof Error ? err.message : "Failed to validate balance sync" }
  }
}

/**
 * COMMITS THE BALANCE SYNC (High-Volume Hardened)
 * Processes 20k+ records by chunking all DB operations and re-parsing file on server.
 */
export async function commitDailyBalanceSync(formData: FormData) {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")

  const file = formData.get("file") as File
  if (!file || file.size === 0) return { ok: false, error: "No file provided" }

  const startTime = Date.now()
  const importId = randomUUID()

  try {
    const fileHash = await calculateHash(file)
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer)
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    const rawData = XLSX.utils.sheet_to_json(firstSheet) as Record<string, any>[]

    if (rawData.length === 0) return { ok: false, error: "The file is empty" }
    console.log(`[BalanceSync] Starting commit for ${file.name} (${rawData.length} rows)`)
    await closeExpiredActivePeriods()

    // Identify account number and total due columns
    const dbMappingRaw = await getImportMapping("import.daily.collections")
    const mapping = { ...DEFAULT_DAILY_SYNC_MAPPING } as Record<string, any>
    if (dbMappingRaw) {
       for (const [k, v] of Object.entries(dbMappingRaw)) {
         const lowerK = k.toLowerCase()
         if (lowerK === "accountnumber" || lowerK === "customeraccount") mapping.accountNumber = [v, ...(Array.isArray(mapping.accountNumber) ? mapping.accountNumber : [mapping.accountNumber])]
         if (lowerK === "totaldue" || lowerK === "totalamountdue") mapping.totalDue = [v, ...(Array.isArray(mapping.totalDue) ? mapping.totalDue : [mapping.totalDue])]
         if (lowerK === "paymentdate" || lowerK === "lastpaymentdate") mapping.paymentDate = [v, ...(Array.isArray(mapping.paymentDate) ? mapping.paymentDate : [mapping.paymentDate])]
       }
    }

    const firstRow = rawData[0]
    const accountAliases = Array.isArray(mapping.accountNumber) ? mapping.accountNumber : [mapping.accountNumber]
    const accountCol = Object.keys(firstRow).find(h => accountAliases.some(a => String(h).toLowerCase().replace(/[^a-z0-9]/g, "") === String(a).toLowerCase().replace(/[^a-z0-9]/g, ""))) || accountAliases[0]

    const dueAliases = Array.isArray(mapping.totalDue) ? mapping.totalDue : [mapping.totalDue]
    const dueCol = Object.keys(firstRow).find(h => dueAliases.some(a => String(h).toLowerCase().replace(/[^a-z0-9]/g, "") === String(a).toLowerCase().replace(/[^a-z0-9]/g, ""))) || dueAliases[0]

    const dateAliases = Array.isArray(mapping.paymentDate) ? mapping.paymentDate : [mapping.paymentDate]
    const dateCol = Object.keys(firstRow).find(h => dateAliases.some(a => String(h).toLowerCase().replace(/[^a-z0-9]/g, "") === String(a).toLowerCase().replace(/[^a-z0-9]/g, "")))

    const periods = await db.select().from(billingPeriod).where(ne(billingPeriod.status, 'archived'))
    const activePeriod = periods.find(p => p.status === 'active')
    const graceDays = (await getSettings()).billingGraceDays ?? 14

    // 1. Map all valid data in memory. Period is resolved after we load each customer's bills.
    const validRows: { accountNumber: string, totalDue: number, paymentDate: Date | null, resolvedPeriodId: string | null }[] = []
    const accountsInFile = new Set<string>()

    for (const row of rawData) {
      const acc = String(row[accountCol as string] || "").trim()
      const due = Number(row[dueCol as string] || 0)

      let pDate: Date | null = null
      if (dateCol && row[dateCol as string]) {
        const d = new Date(row[dateCol as string])
        if (!isNaN(d.getTime())) pDate = d
      }

      if (acc && !isNaN(due)) {
        validRows.push({ accountNumber: acc, totalDue: due, paymentDate: pDate, resolvedPeriodId: null })
        accountsInFile.add(acc)
      }
    }

    if (validRows.length === 0) return { ok: true, id: importId }

    // 2. Chunked Customer Fetching (Avoid parameter limit)
    const customerScope = applyCustomerScope(current)
    const custMap = new Map<string, { id: string, account: string, name: string, balance: number }>()
    const accountArray = Array.from(accountsInFile)
    const CHUNK_SIZE = pgInsertChunkSize(4)

    console.log(`[BalanceSync] Fetching ${accountArray.length} customers in chunks...`)
    for (let i = 0; i < accountArray.length; i += CHUNK_SIZE) {
      const chunk = accountArray.slice(i, i + CHUNK_SIZE)
      const fetched = await db
        .select({ id: customer.id, account: customer.customerAccount, name: customer.name, balance: customer.accountBalance })
        .from(customer)
        .where(and(inArray(customer.customerAccount, chunk), customerScope))

      fetched.forEach(c => {
        if (c.account) custMap.set(c.account.toLowerCase().trim(), c as any)
      })
    }

    // 3. Load this customer's bills across live periods, then apply the Pegasus taken-date cutoff.
    const billingScope = applyBillingRecordScope(current)
    const billMap = new Map<string, any>()
    const billsByCustomer = new Map<string, { id: string; billingPeriodId: string; takenAt: Date | null }[]>()
    const customerIds = Array.from(custMap.values()).map(c => c.id)
    const livePeriodIds = periods.map((p) => p.id)

    console.log(`[BalanceSync] Fetching billing records for ${livePeriodIds.length} periods in chunks...`)
    if (livePeriodIds.length > 0 && customerIds.length > 0) {
      for (let i = 0; i < customerIds.length; i += CHUNK_SIZE) {
        const chunk = customerIds.slice(i, i + CHUNK_SIZE)
        const fetched = await db
          .select({
            ...getTableColumns(billingRecord),
            runUploadedAt: billingRun.uploadedAt,
          })
          .from(billingRecord)
          .innerJoin(billingRun, eq(billingRecord.billingRunId, billingRun.id))
          .where(and(
            inArray(billingRecord.billingPeriodId, livePeriodIds),
            inArray(billingRecord.customerId, chunk),
            billingScope
          ))
        fetched.forEach((b) => {
          billMap.set(`${b.customerId}_${b.billingPeriodId}`, b)
          const list = billsByCustomer.get(b.customerId) || []
          list.push({
            id: b.id,
            billingPeriodId: b.billingPeriodId,
            takenAt: effectiveBillTakenDate({
              billingDate: b.billingDate,
              runUploadedAt: b.runUploadedAt,
              createdAt: b.createdAt,
            }),
          })
          billsByCustomer.set(b.customerId, list)
        })
      }
    }

    for (const row of validRows) {
      const cust = custMap.get(row.accountNumber.toLowerCase().trim())
      if (!cust) continue
      row.resolvedPeriodId = resolvePeriodIdForCustomerPayment(
        row.paymentDate,
        billsByCustomer.get(cust.id) ?? [],
        periods,
        activePeriod?.id ?? null,
      )
    }

    let totalCollection = 0
    let successfulRecords = 0

    const existingFlagKeys = new Set<string>()
    for (let i = 0; i < customerIds.length; i += CHUNK_SIZE) {
      const chunk = customerIds.slice(i, i + CHUNK_SIZE)
      const openFlags = await db
        .select({
          customerId: billingDiscrepancy.customerId,
          billingPeriodId: billingDiscrepancy.billingPeriodId,
        })
        .from(billingDiscrepancy)
        .where(and(
          eq(billingDiscrepancy.sourceType, "cross_period_payment"),
          eq(billingDiscrepancy.status, "open"),
          inArray(billingDiscrepancy.customerId, chunk),
        ))
      openFlags.forEach((f) => existingFlagKeys.add(`${f.customerId}_${f.billingPeriodId}`))
    }

    const periodCounts = new Map<string, number>()
    for (const row of validRows) {
      if (!row.resolvedPeriodId) continue
      periodCounts.set(row.resolvedPeriodId, (periodCounts.get(row.resolvedPeriodId) ?? 0) + 1)
    }
    const batchPeriodId = [...periodCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      ?? activePeriod?.id
      ?? null
    const batchBusinessDate = validRows.find((r) => r.paymentDate)?.paymentDate ?? new Date()

    await db.transaction(async (tx) => {
      // 4. Metadata — period follows payment dates, including closed windows.
      await tx.insert(dailyCollectionImport).values({
        id: importId,
        businessDate: batchBusinessDate,
        billingPeriodId: batchPeriodId,
        filename: file.name,
        fileHash: fileHash,
        uploadedById: current.id,
        status: 'processed',
        totalRecords: rawData.length,
        successfulRecords: 0, // Will update later if needed or just keep totals
        totalAmount: 0, // Will update after loop
      })

      // 5. Batch Operations in Chunks
      for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
        const chunk = validRows.slice(i, i + CHUNK_SIZE)
        console.log(`[BalanceSync] Processing update chunk ${Math.floor(i / CHUNK_SIZE) + 1}...`)

        const findable = chunk.filter(r => custMap.has(r.accountNumber.toLowerCase().trim()))
        if (findable.length === 0) continue

        // A. Batch Update Customer Balances
        const customerValuesList = findable.map(r => {
          const cust = custMap.get(r.accountNumber.toLowerCase().trim())!
          return sql`(${cust.id}::text, ${r.totalDue}::numeric)`
        }).reduce((acc, curr) => sql`${acc}, ${curr}`)

        await tx.execute(sql`
          UPDATE customer AS c
          SET "accountBalance" = v.new_balance, "updatedAt" = now()
          FROM (VALUES ${customerValuesList}) AS v(id, new_balance)
          WHERE c.id = v.id
        `)

        // B. Batch Update Billing Record totalDue (State-Aware per Period)
        // Group chunk by resolvedPeriodId to ensure updates hit the correct period's bill
        const byPeriod = new Map<string, typeof chunk>()
        chunk.forEach(r => {
          if (!r.resolvedPeriodId) return
          const list = byPeriod.get(r.resolvedPeriodId) || []
          list.push(r)
          byPeriod.set(r.resolvedPeriodId, list)
        })

        for (const [pId, periodRows] of byPeriod.entries()) {
          const findableInPeriod = periodRows.filter(r => custMap.has(r.accountNumber.toLowerCase().trim()))
          if (findableInPeriod.length === 0) continue

          const periodValuesList = findableInPeriod.map(r => {
            const cust = custMap.get(r.accountNumber.toLowerCase().trim())!
            return sql`(${cust.id}::text, ${r.totalDue}::numeric)`
          }).reduce((acc, curr) => sql`${acc}, ${curr}`)

          await tx.execute(sql`
            UPDATE billing_record
            SET "totalDue" = v.new_balance, "updatedAt" = now()
            FROM (VALUES ${periodValuesList}) AS v(id, new_balance)
            WHERE billing_record."customerId" = v.id
            AND billing_record."billingPeriodId" = ${pId}
          `)
        }

        // C. Collections and Recoveries
        const collectionsToInsert: any[] = []
        const billUpdateValues: any[] = []
        const crossPeriodFlags: Array<{
          id: string
          customerId: string
          billingPeriodId: string
          existingValue: number
          attemptedValue: number
          reason: string
        }> = []

        for (const row of findable) {
          const cust = custMap.get(row.accountNumber.toLowerCase().trim())!

          /**
           * ACCURATE COLLECTION MATH (Aug 28 Hardening):
           * We must distinguish between "Clearing Debt" and "Existing Credits".
           * If a customer already had a 1M credit, and the new file still shows 1M credit,
           * we collected ZERO today.
           */
          const oldBalance = Number(cust.balance)
          const newBalance = row.totalDue

          /**
           * MIGRATION GUARD (Aug 31 Forensic Hardening):
           * We only count genuine balance reductions as collections.
           * If we discover a credit for the first time on an account that was
           * previously in debt or zero, we only count the debt-clearing portion.
           * This prevents "Credit Discovery Spikes" from legacy data migration.
           */
          let collection = 0
          if (oldBalance >= 0 && newBalance < 0) {
            collection = oldBalance // Paid the debt, the rest is legacy credit.
          } else {
            collection = Math.max(0, oldBalance - newBalance)
          }

          if (collection <= 0) {
            successfulRecords++
            continue
          }

          const attributedName = periods.find(p => p.id === row.resolvedPeriodId)?.periodName || "the active period"
          const lateFor = row.resolvedPeriodId
            ? findClosedPeriodForLatePayment(
              row.paymentDate,
              row.resolvedPeriodId,
              periods,
              graceDays,
            )
            : null
          if (lateFor) {
            const flagKey = `${cust.id}_${lateFor.id}`
            if (!existingFlagKeys.has(flagKey)) {
              existingFlagKeys.add(flagKey)
              const daysAfterEnd = Math.ceil((row.paymentDate!.getTime() - lateFor.endDate.getTime()) / 86_400_000)
              crossPeriodFlags.push({
                id: randomUUID(),
                customerId: cust.id,
                billingPeriodId: lateFor.id,
                existingValue: Math.round(collection),
                attemptedValue: daysAfterEnd,
                reason: `Payment dated ${row.paymentDate!.toISOString().slice(0, 10)} posted to ${attributedName} but is ${daysAfterEnd} day(s) after ${lateFor.periodName} ended. It may belong to the closed period.`,
              })
            }
          }

          totalCollection += collection
          successfulRecords++

          const activeBill = row.resolvedPeriodId
            ? billMap.get(`${cust.id}_${row.resolvedPeriodId}`)
            : undefined
          if (activeBill) {
            const totalArrears = Number(activeBill.arrears)
            const arrearsRecovery = Math.min(collection, totalArrears)
            const currentRecovery = Math.max(0, collection - arrearsRecovery)

            const newTotalRecovery = Number(activeBill.recoveryAmount) + currentRecovery
            const newArrearsRecovery = Number(activeBill.arrearsRecovery) + arrearsRecovery
            const remainingBill = Number(activeBill.billAmount) - newTotalRecovery
            const newStatus = remainingBill <= 0 ? 'paid' : (newTotalRecovery > 0 ? 'partially_paid' : activeBill.status)

            billUpdateValues.push(sql`(${activeBill.id}::text, ${newTotalRecovery}::numeric, ${newArrearsRecovery}::numeric, ${newStatus})`)
          }

          collectionsToInsert.push({
            id: randomUUID(),
            batchId: importId,
            accountNumber: row.accountNumber,
            customerName: cust.name,
            amount: collection,
            paymentDate: row.paymentDate || new Date(),
            externalReference: `SYNC-${importId.slice(0, 8)}-${(i + collectionsToInsert.length).toString().padStart(5, '0')}`,
            paymentChannel: "EBS Balance Sync",
            remarks: row.paymentDate ? "Real transaction date" : "Inferred from balance change (Sync Date)",
            importStatus: 'matched' as const,
          })
        }

        if (billUpdateValues.length > 0) {
          const billValuesList = billUpdateValues.reduce((acc, curr) => sql`${acc}, ${curr}`)
          await tx.execute(sql`
            UPDATE billing_record
            SET "recoveryAmount" = v.rec_amt, "arrearsRecovery" = v.arr_rec, "status" = v.status, "updatedAt" = now()
            FROM (VALUES ${billValuesList}) AS v(id, rec_amt, arr_rec, status)
            WHERE billing_record.id = v.id
          `)
        }

        if (collectionsToInsert.length > 0) {
          const INSERT_CHUNK = pgInsertChunkSize(14)
          for (let c = 0; c < collectionsToInsert.length; c += INSERT_CHUNK) {
            await tx.insert(dailyCollectionRecord).values(collectionsToInsert.slice(c, c + INSERT_CHUNK))
          }
        }

        if (crossPeriodFlags.length > 0) {
          const FLAG_CHUNK = pgInsertChunkSize(10)
          for (let c = 0; c < crossPeriodFlags.length; c += FLAG_CHUNK) {
            await tx.insert(billingDiscrepancy).values(
              crossPeriodFlags.slice(c, c + FLAG_CHUNK).map((f) => ({
                id: f.id,
                customerId: f.customerId,
                billingPeriodId: f.billingPeriodId,
                sourceType: "cross_period_payment",
                reportedById: current.id,
                existingValue: f.existingValue,
                attemptedValue: f.attemptedValue,
                reason: f.reason,
                status: "open",
              })),
            )
          }
        }
      }

      // Update final totals in metadata
      await tx.update(dailyCollectionImport)
        .set({
          totalAmount: Math.round(totalCollection),
          successfulRecords: successfulRecords,
          processingDuration: Date.now() - startTime
        })
        .where(eq(dailyCollectionImport.id, importId))

      await writeAudit({
        user: current,
        action: "daily_collection.balance_sync",
        entityType: "daily_collection_import",
        entityId: importId,
        details: { filename: file.name, records: successfulRecords, totalCollection }
      }, tx)
    })

    console.log(`[BalanceSync] Completed in ${Date.now() - startTime}ms. Total collection: ${totalCollection}`)
    revalidatePath("/dashboard/billing/daily")
    return { ok: true, id: importId }
  } catch (err: any) {
    console.error("Daily Balance Sync Failed:", err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : "A database error occurred. Large files might need to be split into 10,000 records."
    }
  }
}

export async function downloadDailyCollectionTemplate(format: "xlsx" | "csv") {
  await requireUser()

  const mapping = { ...DEFAULT_DAILY_IMPORT_MAPPING } as Record<string, string | string[] | number>
  const headers: string[] = []
  const sampleRow: Record<string, any> = {}
  const keysToProcess = ["accountNumber", "customerName", "amountPaid", "paymentDate", "externalReference", "paymentChannel"]

  for (const key of keysToProcess) {
    const value = mapping[key]
    if (value !== undefined) {
      const header = Array.isArray(value) ? String(value[0]) : String(value)
      if (headers.includes(header)) continue
      headers.push(header)

      // Fill sample values
      if (key === "accountNumber") sampleRow[header] = "6000000000"
      else if (key === "amountPaid") sampleRow[header] = 50000
      else if (key === "paymentDate") sampleRow[header] = new Date().toISOString().split("T")[0]
      else sampleRow[header] = "Sample Data"
    }
  }

  const ws = XLSX.utils.json_to_sheet([sampleRow], { header: headers })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Template")

  return format === "xlsx"
    ? XLSX.write(wb, { type: "buffer", bookType: "xlsx" }).toString("base64")
    : Buffer.from(XLSX.utils.sheet_to_csv(ws)).toString("base64")
}

export async function getDailyImportDetails(id: string) {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")

  const userScope = applyUserScope(current)

  const [batch] = await db
    .select({
      id: dailyCollectionImport.id,
      businessDate: dailyCollectionImport.businessDate,
      filename: dailyCollectionImport.filename,
      totalRecords: dailyCollectionImport.totalRecords,
      totalAmount: dailyCollectionImport.totalAmount,
      status: dailyCollectionImport.status,
      uploadedByName: userTable.name,
      createdAt: dailyCollectionImport.createdAt
    })
    .from(dailyCollectionImport)
    .innerJoin(userTable, eq(dailyCollectionImport.uploadedById, userTable.id))
    .where(and(eq(dailyCollectionImport.id, id), userScope))
    .limit(1)

  return batch || null
}

export async function getDailyImportRecords(params: { batchId: string, page: number, limit: number, search?: string, channel?: string, status?: string }) {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")

  // Ensure user has access to this batch via uploader scope
  const userScope = applyUserScope(current)
  const [batchExists] = await db
    .select({ id: dailyCollectionImport.id })
    .from(dailyCollectionImport)
    .innerJoin(userTable, eq(dailyCollectionImport.uploadedById, userTable.id))
    .where(and(eq(dailyCollectionImport.id, params.batchId), userScope))
    .limit(1)

  if (!batchExists) throw new Error("Unauthorized or Batch not found")

  const offset = (params.page - 1) * params.limit
  const cond = [eq(dailyCollectionRecord.batchId, params.batchId)]
  if (params.search) {
    cond.push(or(
      ilike(dailyCollectionRecord.accountNumber, `%${params.search}%`),
      ilike(dailyCollectionRecord.customerName, `%${params.search}%`),
      ilike(dailyCollectionRecord.externalReference, `%${params.search}%`)
    )!)
  }
  if (params.channel && params.channel !== 'all') cond.push(eq(dailyCollectionRecord.paymentChannel, params.channel))
  if (params.status && params.status !== 'all') cond.push(eq(dailyCollectionRecord.importStatus, params.status))

  const [total] = await db.select({ count: count() }).from(dailyCollectionRecord).where(and(...cond))
  const records = await db.select().from(dailyCollectionRecord).where(and(...cond)).limit(params.limit).offset(offset).orderBy(dailyCollectionRecord.customerName)

  return {
    records,
    total: Number(total?.count || 0),
    page: params.page,
    totalPages: Math.ceil(Number(total?.count || 0) / params.limit)
  }
}

/**
 * DELETES A DAILY IMPORT BATCH (Phase 2B Hardening)
 *
 * IMPLEMENTS FORENSIC ROLLBACK:
 * If this was a 'Balance Sync' batch, we reverse the balance changes
 * made to customers and billing records before deleting.
 */
export async function deleteDailyImport(id: string) {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")

  try {
    const userScope = applyUserScope(current)
    const [batch] = await db
      .select({
        id: dailyCollectionImport.id,
        filename: dailyCollectionImport.filename,
        businessDate: dailyCollectionImport.businessDate,
        status: dailyCollectionImport.status,
        billingPeriodId: dailyCollectionImport.billingPeriodId
      })
      .from(dailyCollectionImport)
      .innerJoin(userTable, eq(dailyCollectionImport.uploadedById, userTable.id))
      .where(and(eq(dailyCollectionImport.id, id), userScope))
      .limit(1)

    if (!batch) return { ok: false, error: "Import not found or you don't have permission to delete it" }

    if (batch.billingPeriodId) {
      const [period] = await db
        .select({ status: billingPeriod.status, periodName: billingPeriod.periodName })
        .from(billingPeriod)
        .where(eq(billingPeriod.id, batch.billingPeriodId))
        .limit(1)
      if (period && (period.status === "closed" || period.status === "archived")) {
        return {
          ok: false,
          error: `Cannot delete a collection from a ${period.status} period.`,
        }
      }
    }

    // 1. Identify matched records that affected balances
    const matchedRecords = await db
      .select()
      .from(dailyCollectionRecord)
      .where(and(
        eq(dailyCollectionRecord.batchId, id),
        eq(dailyCollectionRecord.importStatus, 'matched')
      ))

    // 2. INTERFERENCE CHECK: If any NEWER batch exists for these customers, block deletion.
    // This prevents "Debt Time-Travel" where rolling back an old payment creates
    // an impossible balance state compared to newer records.
    if (matchedRecords.length > 0) {
      const [newerBatch] = await db
        .select({ id: dailyCollectionImport.id })
        .from(dailyCollectionImport)
        .where(and(
          gt(dailyCollectionImport.businessDate, batch.businessDate),
          eq(dailyCollectionImport.status, 'processed')
        ))
        .limit(1)

      if (newerBatch) {
        throw new Error("Cannot delete this batch. A newer Daily Collection has already been processed. Please delete newer batches first to maintain debt history.")
      }
    }

    await db.transaction(async (tx) => {
      // 3. INTERNAL SQL JOIN REVERSE (Aug 28 Hardening)
      // This is the absolute fastest way to restore balances.
      // Instead of looping in JavaScript (which caused stack overflows and timeouts),
      // we tell PostgreSQL to join the tables and do the math internally.
      // This reduces 18,000+ operations down to 2 atomic internal database updates.

      // A. Restore Customer Balances
      await tx.execute(sql`
        UPDATE customer AS c
        SET "accountBalance" = c."accountBalance" + r.amount, "updatedAt" = now()
        FROM daily_collection_record AS r
        WHERE c."customerAccount" = r."accountNumber"
        AND r."batchId" = ${id}
        AND r."importStatus" = 'matched'
      `)

      // B. Restore Billing Records (if applicable)
      if (batch.billingPeriodId) {
        await tx.execute(sql`
          UPDATE billing_record AS br
          SET
            "totalDue" = br."totalDue"::numeric + r.amount,
            "status" = 'partially_paid',
            "updatedAt" = now()
          FROM daily_collection_record AS r
          JOIN customer AS c ON c."customerAccount" = r."accountNumber"
          WHERE br."customerId" = c.id
          AND br."billingPeriodId" = ${batch.billingPeriodId}
          AND r."batchId" = ${id}
          AND r."importStatus" = 'matched'
        `)
      }

      // 4. Delete the data records and metadata
      await tx.delete(dailyCollectionRecord).where(eq(dailyCollectionRecord.batchId, id))
      await tx.delete(dailyCollectionImport).where(eq(dailyCollectionImport.id, id))
      await tx.delete(dailyCollectionRecord).where(eq(dailyCollectionRecord.batchId, id))
      await tx.delete(dailyCollectionImport).where(eq(dailyCollectionImport.id, id))

      await writeAudit({
        user: current,
        action: "daily_collection.delete_rollback",
        entityType: "daily_collection_import",
        entityId: id,
        details: { filename: batch.filename, rolledBackRecords: matchedRecords.length }
      }, tx)
    })

    revalidatePath("/dashboard/billing/daily")
    return { ok: true }
  } catch (err: any) {
    console.error("Failed to delete import with rollback:", err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to delete import"
    }
  }
}
