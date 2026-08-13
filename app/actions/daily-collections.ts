"use server"

import { db } from "@/lib/db"
import {
  dailyCollectionImport,
  dailyCollectionRecord,
  user as userTable,
  customer,
  billingPeriod,
  billingRecord
} from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { canUploadBilling } from "@/lib/permissions"
import { eq, desc, and, ilike, or, sql, count, inArray } from "drizzle-orm"
import { randomUUID, createHash } from "crypto"
import * as XLSX from "xlsx"
import { z } from "zod"
import { revalidatePath } from "next/cache"
import { writeAudit } from "@/lib/audit"
import { getImportMapping, processExcelImport } from "@/lib/import-engine"
import { DEFAULT_DAILY_SYNC_MAPPING } from "@/lib/import-mappings"
import { logEvent, logFinancial } from "@/lib/logger"

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
  rows: { valid: boolean; errors: string[]; data: DailyImportRow }[]
  isDuplicateFile: boolean
  isDuplicateDate: boolean
}

/**
 * Returns metadata for previously uploaded daily collection reports.
 */
export async function listDailyImports() {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")

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
      totalAmount, rows: results, isDuplicateFile: !!existingHash, isDuplicateDate: false
    }
  }
}

/**
 * Commits the Daily Collection Import.
 */
export async function commitDailyCollectionImport(summary: DailyValidationSummary) {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")

  const importId = randomUUID()
  const [activePeriod] = await db.select({ id: billingPeriod.id }).from(billingPeriod).where(eq(billingPeriod.status, 'active')).limit(1)

  try {
    await db.transaction(async (tx) => {
      await tx.insert(dailyCollectionImport).values({
        id: importId, businessDate: new Date(summary.businessDate), billingPeriodId: activePeriod?.id,
        filename: summary.filename, fileHash: summary.fileHash, uploadedById: current.id,
        status: 'processed', totalRecords: summary.totalRecords, totalAmount: summary.totalAmount,
      })

      const validRows = summary.rows.filter(r => r.valid)
      if (validRows.length > 0) {
        const records = validRows.map(row => ({
          id: randomUUID(), batchId: importId, accountNumber: row.data.accountNumber, customerName: row.data.customerName,
          amount: row.data.amountPaid, paymentDate: new Date(row.data.paymentDate), externalReference: row.data.externalReference,
          paymentChannel: row.data.paymentChannel, schemeName: row.data.scheme, branchName: row.data.area, importStatus: 'imported' as const,
        }))
        const CHUNK = 1000
        for (let i = 0; i < records.length; i += CHUNK) await tx.insert(dailyCollectionRecord).values(records.slice(i, i + CHUNK))
      }

      await writeAudit({ user: current, action: "daily_collection.import", entityType: "daily_collection_import", entityId: importId, details: { filename: summary.filename, amount: summary.totalAmount } }, tx)
    })

    revalidatePath("/dashboard/billing/daily")
    return { ok: true, id: importId }
  } catch (err: any) { return { ok: false, error: err.message } }
}

const dailySyncSchema = z.object({
  accountNumber: z.coerce.string().trim().min(1, "Account Number is required"),
  totalDue: z.coerce.number().default(0),
})

export type DailySyncRow = z.infer<typeof dailySyncSchema>

export interface DailySyncSummary {
  filename: string
  fileHash: string
  totalRecords: number
  validRecords: number
  failedRecords: number
  totalCollection: number
  rows: { valid: boolean; errors: string[]; data: DailySyncRow; collection: number }[]
}

/**
 * DAILY BALANCE SYNC (Simplified Import)
 */
export async function validateDailyBalanceSync(formData: FormData): Promise<{ ok: true; summary: DailySyncSummary } | { ok: false; error: string }> {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")

  const file = formData.get("file") as File
  if (!file || file.size === 0) return { ok: false, error: "No file" }

  const fileHash = await calculateHash(file)
  const allCustomers = await db.select({ id: customer.id, account: customer.customerAccount, balance: customer.accountBalance }).from(customer)
  const customerMap = new Map(allCustomers.map(c => [c.account?.toLowerCase(), c]))

  // Resolve custom mapping from Admin > Templates
  const dbMappingRaw = await getImportMapping("import.daily.collections")
  const mapping = { ...DEFAULT_DAILY_SYNC_MAPPING } as Record<string, any>

  if (dbMappingRaw) {
    for (const [k, v] of Object.entries(dbMappingRaw)) {
      const lowerK = k.toLowerCase()
      if (lowerK === "accountnumber" || lowerK === "customeraccount") {
        mapping.accountNumber = [v, ...(Array.isArray(mapping.accountNumber) ? mapping.accountNumber : [mapping.accountNumber])]
      } else if (lowerK === "totaldue" || lowerK === "totalamountdue") {
        mapping.totalDue = [v, ...(Array.isArray(mapping.totalDue) ? mapping.totalDue : [mapping.totalDue])]
      } else {
        mapping[k] = v
      }
    }
  }

  const engineSummary = await processExcelImport({
    file, schema: dailySyncSchema as any, mapping: mapping as any,
    onValidateRow: (data: DailySyncRow) => {
      const errors: string[] = []
      if (!customerMap.get(data.accountNumber.toLowerCase())) errors.push(`Not found: ${data.accountNumber}`)
      return { errors, warnings: [] }
    }
  })

  let totalCollection = 0
  const rows = engineSummary.rows.map(r => {
    let collection = 0
    if (r.valid) {
      const cust = customerMap.get(r.data.accountNumber.toLowerCase())!
      collection = Math.max(0, Number(cust.balance) - r.data.totalDue)
      totalCollection += collection
    }
    return { ...r, collection }
  })

  return { ok: true, summary: { filename: file.name, fileHash, totalRecords: engineSummary.totalRows, validRecords: engineSummary.validRows, failedRecords: engineSummary.errorRows, totalCollection, rows } }
}

/**
 * COMMITS THE BALANCE SYNC
 */
export async function commitDailyBalanceSync(summary: DailySyncSummary) {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")

  const importId = randomUUID()
  const startTime = Date.now()

  // Find current active period to link this import
  const [activePeriod] = await db.select({ id: billingPeriod.id }).from(billingPeriod).where(eq(billingPeriod.status, 'active')).limit(1)

  try {
    const validRows = summary.rows.filter(r => r.valid)
    if (validRows.length === 0) return { ok: true, id: importId }

    // 1. Fetch Customers in bulk for Mapping (ensure we have IDs and Names)
    // We use a broader fetch to avoid casing issues with inArray
    const accounts = Array.from(new Set(validRows.map(r => r.data.accountNumber.trim())))

    const customers = await db
      .select({ id: customer.id, account: customer.customerAccount, name: customer.name })
      .from(customer)
      .where(inArray(customer.customerAccount, accounts))

    const custMap = new Map(customers.map(c => [c.account?.toLowerCase().trim(), c]))

    await db.transaction(async (tx) => {
      // 2. Metadata
      await tx.insert(dailyCollectionImport).values({
        id: importId,
        businessDate: new Date(),
        billingPeriodId: activePeriod?.id,
        filename: summary.filename,
        fileHash: summary.fileHash,
        uploadedById: current.id,
        status: 'processed',
        totalRecords: summary.totalRecords,
        successfulRecords: summary.validRecords,
        failedRecords: summary.failedRecords,
        totalAmount: summary.totalCollection,
        processingDuration: Date.now() - startTime,
      })

      // 3. Batch Update Balances
      const CHUNK_SIZE = 300
      for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
        const chunk = validRows.slice(i, i + CHUNK_SIZE)

        // Filter out rows where customer wasn't found in map (safety)
        const findable = chunk.filter(r => custMap.has(r.data.accountNumber.toLowerCase().trim()))
        if (findable.length === 0) continue

        const valuesList = findable.map(r => {
          const cust = custMap.get(r.data.accountNumber.toLowerCase().trim())!
          return sql`(${cust.id}, ${r.data.totalDue}::numeric)`
        }).reduce((acc, curr) => sql`${acc}, ${curr}`)

        await tx.execute(sql`
          UPDATE customer AS c
          SET "accountBalance" = v.new_balance, "updatedAt" = now()
          FROM (VALUES ${valuesList}) AS v(id, new_balance)
          WHERE c.id = v.id
        `)

        // CRITICAL FIX: Also update the billingRecord snapshot so the dashboard math sees the recovery
        await tx.execute(sql`
          UPDATE billing_record AS br
          SET "totalDue" = v.new_balance, "updatedAt" = now()
          FROM (VALUES ${valuesList}) AS v(id, new_balance)
          WHERE br."customerId" = v.id
          AND br."billingPeriodId" = ${activePeriod?.id || ''}
        `)
      }

      // 4. Register Collections (Individual Customer-Level Split)
      const collectionsToInsert: any[] = []
      const billUpdates: any[] = []

      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i]
        const collection = row.collection
        if (collection <= 0) continue

        const cust = custMap.get(row.data.accountNumber.toLowerCase().trim())
        if (!cust) continue

        // Logic: Split collection between Arrears and Current Bill for this specific customer
        // We look for their active bill in the current period
        const [activeBill] = await tx
          .select()
          .from(billingRecord)
          .where(and(
            eq(billingRecord.customerId, cust.id),
            eq(billingRecord.billingPeriodId, activePeriod?.id || "")
          ))
          .limit(1)

        let arrearsRecovery = 0
        let currentRecovery = 0

        if (activeBill) {
          const totalArrears = Number(activeBill.arrears)
          arrearsRecovery = Math.min(collection, totalArrears)
          currentRecovery = Math.max(0, collection - arrearsRecovery)

          // Queue bill status update
          const newTotalRecovery = Number(activeBill.recoveryAmount) + currentRecovery
          const newArrearsRecovery = Number(activeBill.arrearsRecovery) + arrearsRecovery
          const remainingBill = Number(activeBill.billAmount) - newTotalRecovery

          billUpdates.push({
            id: activeBill.id,
            recoveryAmount: newTotalRecovery.toString(),
            arrearsRecovery: newArrearsRecovery.toString(),
            status: remainingBill <= 0 ? 'paid' : (newTotalRecovery > 0 ? 'partially_paid' : activeBill.status)
          })
        } else {
          // If no active bill found, treat all as Arrears Recovery (Historical)
          arrearsRecovery = collection
        }

        collectionsToInsert.push({
          id: randomUUID(),
          batchId: importId,
          accountNumber: row.data.accountNumber,
          customerName: cust.name,
          amount: collection,
          paymentDate: new Date(),
          externalReference: `SYNC-${importId.slice(0, 8)}-${(i + 1).toString().padStart(4, '0')}`,
          paymentChannel: "EBS Balance Sync",
          importStatus: 'matched' as const,
        })
      }

      // Execute Bill Updates
      for (const update of billUpdates) {
        await tx.update(billingRecord)
          .set({
            recoveryAmount: update.recoveryAmount,
            arrearsRecovery: update.arrearsRecovery,
            status: update.status,
            updatedAt: new Date()
          })
          .where(eq(billingRecord.id, update.id))
      }

      // Execute Collection Inserts
      if (collectionsToInsert.length > 0) {
        for (let i = 0; i < collectionsToInsert.length; i += CHUNK_SIZE) {
          await tx.insert(dailyCollectionRecord).values(collectionsToInsert.slice(i, i + CHUNK_SIZE))
        }
      }

      await writeAudit({
        user: current,
        action: "daily_collection.balance_sync",
        entityType: "daily_collection_import",
        entityId: importId,
        details: { filename: summary.filename, records: summary.totalRecords, totalCollection: summary.totalCollection }
      }, tx)
    })

    logFinancial("Daily Balance Sync Complete", { filename: summary.filename, amount: summary.totalCollection }, current)
    revalidatePath("/dashboard/billing/daily")
    return { ok: true, id: importId }
  } catch (err: unknown) {
    console.error("Daily Balance Sync Failed:", err)
    return { ok: false, error: err instanceof Error ? err.message : "Failed to sync balances" }
  }
}

export async function downloadDailyCollectionTemplate(format: "xlsx" | "csv") {
  await requireUser()
  const dbMapping = await getImportMapping("import.daily.collections")
  const mapping: Record<string, string | string[]> = dbMapping || { ...DEFAULT_DAILY_IMPORT_MAPPING }
  const headers = Object.values(mapping).map(v => Array.isArray(v) ? v[0] : v) as string[]
  const sample: Record<string, string> = {}
  Object.entries(mapping).forEach(([k, v]) => {
    const col = Array.isArray(v) ? v[0] : v
    if (k === 'accountNumber') sample[col] = "6000000000"
    else if (k === 'amountPaid') sample[col] = "50000"
    else sample[col] = "Sample"
  })
  const ws = XLSX.utils.json_to_sheet([sample], { header: headers })
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Template")
  return format === "xlsx" ? XLSX.write(wb, { type: "buffer", bookType: "xlsx" }).toString("base64") : Buffer.from(XLSX.utils.sheet_to_csv(ws)).toString("base64")
}

export async function getDailyImportDetails(id: string) {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")
  const [batch] = await db.select({ id: dailyCollectionImport.id, businessDate: dailyCollectionImport.businessDate, filename: dailyCollectionImport.filename, totalRecords: dailyCollectionImport.totalRecords, totalAmount: dailyCollectionImport.totalAmount, status: dailyCollectionImport.status, uploadedByName: userTable.name, createdAt: dailyCollectionImport.createdAt }).from(dailyCollectionImport).innerJoin(userTable, eq(dailyCollectionImport.uploadedById, userTable.id)).where(eq(dailyCollectionImport.id, id)).limit(1)
  return batch || null
}

export async function getDailyImportRecords(params: { batchId: string, page: number, limit: number, search?: string, channel?: string, status?: string }) {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")
  const offset = (params.page - 1) * params.limit
  const cond = [eq(dailyCollectionRecord.batchId, params.batchId)]
  if (params.search) cond.push(or(ilike(dailyCollectionRecord.accountNumber, `%${params.search}%`), ilike(dailyCollectionRecord.customerName, `%${params.search}%`), ilike(dailyCollectionRecord.externalReference, `%${params.search}%`))!)
  if (params.channel && params.channel !== 'all') cond.push(eq(dailyCollectionRecord.paymentChannel, params.channel))
  if (params.status && params.status !== 'all') cond.push(eq(dailyCollectionRecord.importStatus, params.status))
  const [total] = await db.select({ count: count() }).from(dailyCollectionRecord).where(and(...cond))
  const records = await db.select().from(dailyCollectionRecord).where(and(...cond)).limit(params.limit).offset(offset).orderBy(dailyCollectionRecord.customerName)
  return { records, total: Number(total?.count || 0), page: params.page, totalPages: Math.ceil(Number(total?.count || 0) / params.limit) }
}

/**
 * DELETES A DAILY IMPORT BATCH (Phase 2B Hardening)
 * This removes the import record and all its associated collection records.
 * Note: It does NOT roll back customer balance changes (reconciliation logic).
 */
export async function deleteDailyImport(id: string) {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")

  try {
    const [batch] = await db
      .select({ filename: dailyCollectionImport.filename })
      .from(dailyCollectionImport)
      .where(eq(dailyCollectionImport.id, id))
      .limit(1)

    if (!batch) return { ok: false, error: "Import not found" }

    await db.transaction(async (tx) => {
      // 1. Delete granular records (cascades but manual is safer for auditing)
      await tx.delete(dailyCollectionRecord).where(eq(dailyCollectionRecord.batchId, id))

      // 2. Delete the import metadata
      await tx.delete(dailyCollectionImport).where(eq(dailyCollectionImport.id, id))

      await writeAudit({
        user: current,
        action: "daily_collection.delete",
        entityType: "daily_collection_import",
        entityId: id,
        details: { filename: batch.filename }
      }, tx)
    })

    revalidatePath("/dashboard/billing/daily")
    return { ok: true }
  } catch (err: any) {
    console.error("Failed to delete import:", err)
    return { ok: false, error: err.message || "Failed to delete import" }
  }
}
