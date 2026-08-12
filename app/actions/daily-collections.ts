"use server"

import { db } from "@/lib/db"
import {
  dailyCollectionImport,
  dailyCollectionRecord,
  user as userTable,
  customer,
  billingPeriod
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

  const engineSummary = await processExcelImport({
    file, schema: dailySyncSchema as any, mapping: DEFAULT_DAILY_SYNC_MAPPING as any,
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
  const [activePeriod] = await db.select({ id: billingPeriod.id }).from(billingPeriod).where(eq(billingPeriod.status, 'active')).limit(1)

  try {
    await db.transaction(async (tx) => {
      await tx.insert(dailyCollectionImport).values({
        id: importId, businessDate: new Date(), billingPeriodId: activePeriod?.id, filename: summary.filename,
        fileHash: summary.fileHash, uploadedById: current.id, status: 'processed', totalRecords: summary.totalRecords, totalAmount: summary.totalCollection,
      })

      const validRows = summary.rows.filter(r => r.valid)
      const accounts = validRows.map(r => r.data.accountNumber.toLowerCase())
      const customers = await tx.select({ id: customer.id, account: customer.customerAccount, name: customer.name }).from(customer).where(inArray(customer.customerAccount, accounts))
      const custMap = new Map(customers.map(c => [c.account?.toLowerCase(), c]))

      const CHUNK = 400
      for (let i = 0; i < validRows.length; i += CHUNK) {
        const chunk = validRows.slice(i, i + CHUNK)
        const valuesList = chunk.map(r => sql`(${custMap.get(r.data.accountNumber.toLowerCase())!.id}, ${r.data.totalDue}::numeric)`).reduce((a, c) => sql`${a}, ${c}`)
        await tx.execute(sql`UPDATE customer AS c SET "accountBalance" = v.new_balance, "updatedAt" = now() FROM (VALUES ${valuesList}) AS v(id, new_balance) WHERE c.id = v.id`)
      }

      const collections = validRows.filter(r => r.collection > 0).map(r => ({
        id: randomUUID(), batchId: importId, accountNumber: r.data.accountNumber, customerName: custMap.get(r.data.accountNumber.toLowerCase())!.name,
        amount: r.collection, paymentDate: new Date(), externalReference: `SYNC-${importId.slice(0, 8)}`, paymentChannel: "EBS Balance Sync", importStatus: 'matched' as const,
      }))
      for (let i = 0; i < collections.length; i += CHUNK) await tx.insert(dailyCollectionRecord).values(collections.slice(i, i + CHUNK))

      await writeAudit({ user: current, action: "daily_collection.balance_sync", entityType: "daily_collection_import", entityId: importId, details: { filename: summary.filename, amount: summary.totalCollection } }, tx)
    })

    logFinancial("Daily Balance Sync Complete", { filename: summary.filename, amount: summary.totalCollection }, current)
    revalidatePath("/dashboard/billing/daily")
    return { ok: true, id: importId }
  } catch (err: any) { return { ok: false, error: err.message } }
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
