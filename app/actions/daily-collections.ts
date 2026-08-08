"use server"

import { db } from "@/lib/db"
import { dailyCollectionImport, dailyCollectionRecord, user as userTable } from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { canUploadBilling } from "@/lib/permissions"
import { eq, desc, and, ilike, or, sql, count } from "drizzle-orm"
import { randomUUID, createHash } from "crypto"
import * as XLSX from "xlsx"
import { z } from "zod"
import { revalidatePath } from "next/cache"
import { writeAudit } from "@/lib/audit"
import { getImportMapping } from "@/lib/import-engine"
import { logEvent } from "@/lib/logger"

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
 * DAILY COLLECTION MODULE (Phase 2A Foundation)
 *
 * This module prepares the system for future implementation of:
 * - Daily Collection Import (File Parsing)
 * - Collection Validation
 * - Collection Reconciliation (Matching Receipts to External Data)
 * - Business Day Closing
 * - Official Collection Metrics for Dashboard
 *
 * These features are intentionally deferred to Phase 2B and beyond.
 */

/**
 * Returns metadata for previously uploaded daily collection reports.
 */
export async function listDailyImports() {
  const current = await requireUser()

  // Restricted to users authorized for collection/billing administration
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
    .orderBy(desc(dailyCollectionImport.businessDate))
}

/**
 * Calculates SHA-256 hash of a file for duplicate detection.
 */
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

  const startTime = Date.now()
  const fileHash = await calculateHash(file)

  // 1. Duplicate File Check
  const [existingHash] = await db
    .select({ id: dailyCollectionImport.id })
    .from(dailyCollectionImport)
    .where(eq(dailyCollectionImport.fileHash, fileHash))
    .limit(1)

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer)
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  const rawData = XLSX.utils.sheet_to_json(firstSheet)

  if (rawData.length === 0) return { ok: false, error: "The file is empty" }

  const results: { valid: boolean; errors: string[]; data: DailyImportRow }[] = []
  let totalAmount = 0
  let validCount = 0
  let errorCount = 0
  let businessDate: string | null = null

  // Check columns
  const firstRow = rawData[0] as Record<string, unknown>
  const missingColumns = REQUIRED_COLUMNS.filter(col => !(col in firstRow))
  if (missingColumns.length > 0) {
    return { ok: false, error: `Missing required columns: ${missingColumns.join(", ")}` }
  }

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
    if (!parsed.success) {
      parsed.error.issues.forEach(i => errors.push(i.message))
    }

    if (seenRefs.has(mappedRow.externalReference)) {
      errors.push(`Duplicate External Reference: ${mappedRow.externalReference}`)
    }
    seenRefs.add(mappedRow.externalReference)

    const isValid = errors.length === 0
    if (isValid) {
      validCount++
      totalAmount += mappedRow.amountPaid
      // Use the first valid row to determine business date
      if (!businessDate) businessDate = mappedRow.paymentDate
    } else {
      errorCount++
    }

    results.push({ valid: isValid, errors, data: mappedRow })
  }

  // 2. Duplicate Date Check
  let isDuplicateDate = false
  if (businessDate) {
    const [existingDate] = await db
      .select({ id: dailyCollectionImport.id })
      .from(dailyCollectionImport)
      .where(and(
        eq(dailyCollectionImport.businessDate, new Date(businessDate)),
        eq(dailyCollectionImport.status, 'processed')
      ))
      .limit(1)
    isDuplicateDate = !!existingDate
  }

  return {
    ok: true,
    summary: {
      filename: file.name,
      fileHash,
      businessDate: businessDate || "",
      totalRecords: rawData.length,
      validRecords: validCount,
      failedRecords: errorCount,
      totalAmount,
      rows: results,
      isDuplicateFile: !!existingHash,
      isDuplicateDate
    }
  }
}

/**
 * Commits the Daily Collection Import to history and persists individual records.
 * (Phase 2C Transactional Persistence)
 */
export async function commitDailyCollectionImport(summary: DailyValidationSummary) {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")

  if (summary.isDuplicateFile && current.role !== 'admin') {
    throw new Error("Duplicate file hash detected. Only System Administrators can override this.")
  }

  const startTime = Date.now()
  const importId = randomUUID()

  try {
    await db.transaction(async (tx) => {
      // 1. Create Metadata Batch Entry
      await tx.insert(dailyCollectionImport).values({
        id: importId,
        businessDate: new Date(summary.businessDate),
        filename: summary.filename,
        fileHash: summary.fileHash,
        uploadedById: current.id,
        status: 'processed',
        totalRecords: summary.totalRecords,
        successfulRecords: summary.validRecords,
        failedRecords: summary.failedRecords,
        totalAmount: summary.totalAmount,
        processingDuration: Date.now() - startTime,
      })

      // 2. Persist Individual Valid Records
      const validRows = summary.rows.filter(r => r.valid)
      if (validRows.length > 0) {
        const recordsToInsert = validRows.map(row => ({
          id: randomUUID(),
          batchId: importId,
          accountNumber: row.data.accountNumber,
          customerName: row.data.customerName,
          amount: row.data.amountPaid,
          paymentDate: new Date(row.data.paymentDate),
          externalReference: row.data.externalReference,
          paymentChannel: row.data.paymentChannel,
          schemeName: row.data.scheme,
          branchName: row.data.area,
          importStatus: 'imported',
        }))

        // Chunked batch insert for performance
        const CHUNK_SIZE = 1000
        for (let i = 0; i < recordsToInsert.length; i += CHUNK_SIZE) {
          await tx.insert(dailyCollectionRecord).values(recordsToInsert.slice(i, i + CHUNK_SIZE))
        }
      }

      // 3. Log Audit
      await writeAudit({
        user: current,
        action: "daily_collection.import",
        entityType: "daily_collection_import",
        entityId: importId,
        details: {
          filename: summary.filename,
          businessDate: summary.businessDate,
          records: summary.totalRecords,
          amount: summary.totalAmount,
        }
      }, tx)
    })

    revalidatePath("/dashboard/billing/daily")
    return { ok: true, id: importId }
  } catch (err: unknown) {
    logEvent({
      message: "Daily import failed",
      severity: "error",
      category: "system",
      error: err,
      user: current,
    })
    const message = err instanceof Error ? err.message : "Failed to commit import"
    return { ok: false, error: message }
  }
}

/**
 * Fetch a single import batch details.
 */
export async function getDailyImportDetails(id: string) {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")

  const [batch] = await db
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
    .where(eq(dailyCollectionImport.id, id))
    .limit(1)

  return batch || null
}

/**
 * Search and paginate imported records for a specific batch.
 */
export async function getDailyImportRecords(params: {
  batchId: string
  page: number
  limit: number
  search?: string
  channel?: string
  status?: string
}) {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")

  const offset = (params.page - 1) * params.limit

  const conditions = [eq(dailyCollectionRecord.batchId, params.batchId)]
  if (params.search) {
    conditions.push(or(
      ilike(dailyCollectionRecord.accountNumber, `%${params.search}%`),
      ilike(dailyCollectionRecord.customerName, `%${params.search}%`),
      ilike(dailyCollectionRecord.externalReference, `%${params.search}%`)
    )!)
  }
  if (params.channel && params.channel !== 'all') {
    conditions.push(eq(dailyCollectionRecord.paymentChannel, params.channel))
  }
  if (params.status && params.status !== 'all') {
    conditions.push(eq(dailyCollectionRecord.importStatus, params.status))
  }

  const [totalResult] = await db
    .select({ count: count() })
    .from(dailyCollectionRecord)
    .where(and(...conditions))

  const records = await db
    .select()
    .from(dailyCollectionRecord)
    .where(and(...conditions))
    .limit(params.limit)
    .offset(offset)
    .orderBy(dailyCollectionRecord.customerName)

  return {
    records,
    total: Number(totalResult?.count || 0),
    page: params.page,
    totalPages: Math.ceil(Number(totalResult?.count || 0) / params.limit)
  }
}

/**
 * Generates a template file for Daily Collection imports.
 */
export async function downloadDailyCollectionTemplate(format: "xlsx" | "csv") {
  await requireUser()

  // Resolve headers from Template Hub
  const dbMapping = await getImportMapping("import.daily.collections")

  /**
   * STRICT TEMPLATE ALIGNMENT (Phase 2B Fix)
   *
   * We now use the DB mapping EXCLUSIVELY if it exists.
   * Mandatory columns are NO LONGER injected. What is in the JSON is what is in the Excel.
   */
  const mapping: Record<string, string | string[]> = dbMapping || { ...DEFAULT_DAILY_IMPORT_MAPPING }

  // 2. Generate Sample Data strictly based on the mapping keys
  const headers = Object.values(mapping).map(v => Array.isArray(v) ? v[0] : v) as string[]
  const sampleRow: Record<string, string> = {}

  // Fill sample values ONLY for keys that the user defined in their JSON
  Object.entries(mapping).forEach(([key, colOrList]) => {
    const col = Array.isArray(colOrList) ? colOrList[0] : colOrList
    if (key === 'accountNumber') sampleRow[col] = "6000000000"
    else if (key === 'customerName') sampleRow[col] = "Sample Customer"
    else if (key === 'amountPaid') sampleRow[col] = "50000"
    else if (key === 'paymentDate') sampleRow[col] = new Date().toISOString().split('T')[0]
    else if (key === 'externalReference') sampleRow[col] = "REF-" + Math.random().toString(36).toUpperCase().slice(-8)
    else if (key === 'paymentChannel') sampleRow[col] = "MTN Mobile Money"
    else sampleRow[col] = "Optional Value"
  })

  const worksheet = XLSX.utils.json_to_sheet([sampleRow], { header: headers })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "DailyCollections")

  if (format === "xlsx") {
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
    return buffer.toString("base64")
  } else {
    const csv = XLSX.utils.sheet_to_csv(worksheet)
    return Buffer.from(csv).toString("base64")
  }
}
