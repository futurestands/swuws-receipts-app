"use server"

import { db } from "@/lib/db"
import {
  customer,
  waterScheme,
  managedTemplate,
  templateVersion,
} from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { writeAudit } from "@/lib/audit"
import { canUploadCustomers } from "@/lib/permissions"
import { eq, sql } from "drizzle-orm"
import * as XLSX from "xlsx"
import { z } from "zod"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { processExcelImport, getImportMapping, type ImportSummary } from "@/lib/import-engine"
import { DEFAULT_CUSTOMER_IMPORT_MAPPING } from "@/lib/import-mappings"
import { customerImportSchema, type CustomerImportRow } from "@/lib/import-schemas"

export type CustomerImportSummary = ImportSummary<CustomerImportRow>

async function getSchemeMap() {
  const schemes = await db.select().from(waterScheme)
  return new Map(schemes.map((s) => [s.name.toLowerCase(), s.id]))
}

export async function validateCustomerImport(formData: FormData): Promise<{ ok: true; summary: CustomerImportSummary } | { ok: false; error: string }> {
  const current = await requireUser()
  if (!canUploadCustomers(current)) throw new Error("Forbidden")

  const file = formData.get("file") as File
  const allowUpdates = formData.get("allowUpdates") === "true"
  if (!file) return { ok: false, error: "No file provided" }

  const schemeMap = await getSchemeMap()
  const existingCustomers = await db.select({ account: customer.customerAccount }).from(customer)
  const existingAccounts = new Set(existingCustomers.map((c) => c.account?.toLowerCase()))
  const seenInUpload = new Set<string>()

  const dbMapping = await getImportMapping("import.customers.bulk")
  const mapping = {
    ...DEFAULT_CUSTOMER_IMPORT_MAPPING,
    ...(dbMapping as any)
  } as Record<string, string | string[] | number>

  const summary = await processExcelImport({
    file,
    schema: customerImportSchema,
    mapping,
    onValidateRow: (data) => {
      const errors: string[] = []
      const warnings: string[] = []

      if (data.customerAccount) {
        const accLower = String(data.customerAccount).toLowerCase()
        if (existingAccounts.has(accLower)) {
          if (allowUpdates) {
            warnings.push("Existing customer: Details will be updated")
          } else {
            errors.push("Account number already exists in the system")
          }
        }
        if (seenInUpload.has(accLower)) {
          errors.push("Duplicate account number in the upload file")
        }
        seenInUpload.add(accLower)
      }

      if (data.schemeName) {
        if (!schemeMap.has(String(data.schemeName).toLowerCase())) {
          errors.push(`Water Scheme not found: ${data.schemeName}`)
        }
      }

      return { errors, warnings }
    }
  })

  return { ok: true, summary: summary as CustomerImportSummary }
}

export async function importCustomers(summary: CustomerImportSummary): Promise<{ ok: true; imported: number; updated: number; failed: number; report: string } | { ok: false; error: string }> {
  const current = await requireUser()
  if (!canUploadCustomers(current)) throw new Error("Forbidden")

  const validRows = summary.rows.filter((r) => r.valid)
  if (validRows.length === 0) return { ok: false, error: "No valid rows to import" }

  const schemeMap = await getSchemeMap()
  let importedCount = 0
  let updatedCount = 0
  let failedCount = 0
  const reportRows: Array<Record<string, unknown>> = []

  const startTime = Date.now()

  // PERFORMANCE UPGRADE: Use Bulk Chunking (Batch size 400 for balance of speed and reliability)
  const CHUNK_SIZE = 400
  for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
    const chunk = validRows.slice(i, i + CHUNK_SIZE)

    try {
      await db.transaction(async (tx) => {
        // Pre-map the data for Drizzle
        const batchValues = chunk.map(row => {
          const { data } = row
          const schemeId = schemeMap.get(data.schemeName.toLowerCase()) || null
          return {
            id: randomUUID(),
            name: data.name,
            customerAccount: data.customerAccount,
            phone: data.phone || null,
            address: data.address || null,
            waterSchemeId: schemeId,
            meterRef: data.meterRef || null,
            serialNo: data.serialNo || null,
            category: data.category || "domestic",
            openingArrears: data.openingArrears,
            accountBalance: String(data.openingArrears),
            notes: data.notes || null,
            createdById: current.id,
            updatedAt: new Date(),
          }
        })

        // Execute "Upsert" (Update on Conflict)
        // If the customerAccount already exists, we update the existing record
        // instead of failing the batch.
        await tx
          .insert(customer)
          .values(batchValues)
          .onConflictDoUpdate({
            target: customer.customerAccount,
            set: {
              name: sql`EXCLUDED.name`,
              phone: sql`COALESCE(EXCLUDED.phone, customer.phone)`,
              address: sql`COALESCE(EXCLUDED.address, customer.address)`,
              waterSchemeId: sql`COALESCE(EXCLUDED."waterSchemeId", customer."waterSchemeId")`,
              meterRef: sql`COALESCE(EXCLUDED."meterRef", customer."meterRef")`,
              serialNo: sql`COALESCE(EXCLUDED."serialNo", customer."serialNo")`,
              category: sql`COALESCE(EXCLUDED.category, customer.category)`,
              openingArrears: sql`EXCLUDED."openingArrears"`,
              accountBalance: sql`EXCLUDED."accountBalance"`,
              updatedAt: new Date(),
            }
          })
      })

      // Since we are in a high-performance path, we assume success for the batch
      // if no error was thrown. We count them all as 'processed'.
      importedCount += chunk.length
      chunk.forEach(row => {
        reportRows.push({ ...row.data, Result: "Success", Details: "Processed via Bulk Engine" })
      })
    } catch (e: unknown) {
      // If a bulk chunk fails (rare with pre-validation), fall back to row-by-row
      // for this specific chunk to preserve accuracy and identify errors.
      console.warn(`Chunk starting at ${i} failed. Falling back to individual processing...`)

      for (const row of chunk) {
        const { data } = row
        const schemeId = schemeMap.get(data.schemeName.toLowerCase())

        try {
          const [existing] = await db
            .select()
            .from(customer)
            .where(eq(customer.customerAccount, data.customerAccount))
            .limit(1)

          if (existing) {
            await db.update(customer).set({
              name: data.name,
              phone: data.phone || existing.phone,
              address: data.address || existing.address,
              waterSchemeId: schemeId || existing.waterSchemeId,
              meterRef: data.meterRef || existing.meterRef,
              serialNo: data.serialNo || existing.serialNo,
              category: data.category || existing.category,
              openingArrears: data.openingArrears,
              accountBalance: String(data.openingArrears),
              updatedAt: new Date(),
            }).where(eq(customer.id, existing.id))
            updatedCount++
            reportRows.push({ ...data, Result: "Updated", Details: "Merged via Recovery Path" })
          } else {
            await db.insert(customer).values({
              id: randomUUID(),
              name: data.name,
              customerAccount: data.customerAccount,
              phone: data.phone || null,
              address: data.address || null,
              waterSchemeId: schemeId || null,
              meterRef: data.meterRef || null,
              serialNo: data.serialNo || null,
              category: data.category || "domestic",
              openingArrears: data.openingArrears,
              accountBalance: String(data.openingArrears),
              notes: data.notes || null,
              createdById: current.id,
            })
            importedCount++
            reportRows.push({ ...data, Result: "Created", Details: "Added via Recovery Path" })
          }
        } catch (rowError: unknown) {
          failedCount++
          const msg = rowError instanceof Error ? rowError.message : "Database error"
          reportRows.push({ ...data, Result: "Failed", Details: msg })
        }
      }
    }
  }

  // Include rows that failed the initial validation in the final report
  summary.rows.filter(r => !r.valid).forEach(r => {
    reportRows.push({ ...r.data, Result: "Validation Failed", Details: r.errors.join("; ") })
    failedCount++
  })

  await writeAudit({
    user: current,
    action: "customer.bulk_import_upsert",
    entityType: "customer",
    details: {
      total: summary.totalRows,
      processed: importedCount + updatedCount,
      failed: failedCount,
      durationMs: Date.now() - startTime
    },
  })

  revalidatePath("/dashboard/customers")

  const worksheet = XLSX.utils.json_to_sheet(reportRows)
  const csvReport = XLSX.utils.sheet_to_csv(worksheet)

  return {
    ok: true,
    imported: importedCount,
    updated: updatedCount,
    failed: failedCount,
    report: csvReport,
  }
}

export async function downloadCustomerTemplate() {
  await requireUser()

  // 1. Resolve Headers from Template Hub (Unified resilient resolution)
  const dbMapping = await getImportMapping("import.customers.bulk")
  const mapping = {
    ...DEFAULT_CUSTOMER_IMPORT_MAPPING,
    ...(dbMapping as any)
  } as Record<string, string | string[] | number>

  const headers = Object.values(mapping).map(v => Array.isArray(v) ? v[0] : v) as string[]
  const sampleRow: Record<string, string | number> = {}
  Object.entries(mapping).forEach(([key, colOrList]) => {
    const col = Array.isArray(colOrList) ? colOrList[0] : colOrList
    if (typeof col !== 'string') return

    // Basic defaults for samples
    if (key === 'openingArrears') sampleRow[col] = 50000
    else if (key === 'name') sampleRow[col] = "Jane Doe"
    else if (key === 'customerAccount') sampleRow[col] = "C-98765"
    else if (key === 'schemeName') sampleRow[col] = "Mbarara Central"
    else if (key === 'category') sampleRow[col] = "domestic"
    else sampleRow[col] = "Sample Value"
  })

  const worksheet = XLSX.utils.json_to_sheet([sampleRow], { header: headers })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Customers")
  return XLSX.write(workbook, { type: "base64", bookType: "xlsx" })
}
