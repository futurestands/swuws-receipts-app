"use server"

import { db } from "@/lib/db"
import { customer, waterScheme } from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { writeAudit } from "@/lib/audit"
import { canUploadCustomers } from "@/lib/permissions"
import { eq, sql } from "drizzle-orm"
import * as XLSX from "xlsx"
import { z } from "zod"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"

const customerImportSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  customerAccount: z.string().trim().min(1, "Account number is required"),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  schemeName: z.string().trim().min(1, "Water Scheme is required"),
  notes: z.string().trim().optional(),
})

export type CustomerImportRow = z.infer<typeof customerImportSchema>

export type CustomerValidationResult = {
  valid: boolean
  errors: string[]
  warnings: string[]
  data: CustomerImportRow
}

export type CustomerImportSummary = {
  totalRows: number
  validRows: number
  warningRows: number
  errorRows: number
  rows: CustomerValidationResult[]
}

async function getSchemeMap() {
  const schemes = await db.select().from(waterScheme)
  return new Map(schemes.map((s) => [s.name.toLowerCase(), s.id]))
}

export async function validateCustomerImport(formData: FormData): Promise<{ ok: true; summary: CustomerImportSummary } | { ok: false; error: string }> {
  const current = await requireUser()
  if (!canUploadCustomers(current)) throw new Error("Forbidden")

  const file = formData.get("file") as File
  if (!file) return { ok: false, error: "No file provided" }

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer)
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  const rawData = XLSX.utils.sheet_to_json(firstSheet)

  if (rawData.length === 0) return { ok: false, error: "The file is empty" }

  const schemeMap = await getSchemeMap()
  const existingCustomers = await db.select({ account: customer.customerAccount }).from(customer)
  const existingAccounts = new Set(existingCustomers.map((c) => c.account?.toLowerCase()))
  const seenInUpload = new Set<string>()

  const results: CustomerValidationResult[] = []
  let validCount = 0
  let errorCount = 0
  let warningCount = 0

  for (const rawRow of rawData as any[]) {
    const errors: string[] = []
    const warnings: string[] = []

    const mappedRow: CustomerImportRow = {
      name: String(rawRow.Name || "").trim(),
      customerAccount: String(rawRow.AccountNumber || rawRow["Account Number"] || "").trim(),
      phone: String(rawRow.Phone || "").trim(),
      address: String(rawRow.Address || "").trim(),
      schemeName: String(rawRow.WaterScheme || rawRow["Water Scheme"] || "").trim(),
      notes: String(rawRow.Notes || "").trim(),
    }

    const parsed = customerImportSchema.safeParse(mappedRow)
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => errors.push(issue.message))
    }

    if (mappedRow.customerAccount) {
      const accLower = mappedRow.customerAccount.toLowerCase()
      if (existingAccounts.has(accLower)) {
        errors.push("Account number already exists in the system")
      }
      if (seenInUpload.has(accLower)) {
        errors.push("Duplicate account number in the upload file")
      }
      seenInUpload.add(accLower)
    }

    if (mappedRow.schemeName) {
      if (!schemeMap.has(mappedRow.schemeName.toLowerCase())) {
        errors.push(`Water Scheme not found: ${mappedRow.schemeName}`)
      }
    }

    const isValid = errors.length === 0
    if (isValid) {
      validCount++
    } else {
      errorCount++
    }

    results.push({
      valid: isValid,
      errors,
      warnings,
      data: mappedRow,
    })
  }

  return {
    ok: true,
    summary: {
      totalRows: rawData.length,
      validRows: validCount,
      warningRows: warningCount,
      errorRows: errorCount,
      rows: results,
    },
  }
}

export async function importCustomers(summary: CustomerImportSummary): Promise<{ ok: true; imported: number; failed: number; report: string } | { ok: false; error: string }> {
  const current = await requireUser()
  if (!canUploadCustomers(current)) throw new Error("Forbidden")

  const validRows = summary.rows.filter((r) => r.valid)
  if (validRows.length === 0) return { ok: false, error: "No valid rows to import" }

  const schemeMap = await getSchemeMap()
  let importedCount = 0
  let failedCount = 0
  const reportRows: any[] = []

  for (const row of validRows) {
    const { data } = row
    const schemeId = schemeMap.get(data.schemeName.toLowerCase())

    try {
      await db.insert(customer).values({
        id: randomUUID(),
        name: data.name,
        customerAccount: data.customerAccount,
        phone: data.phone || null,
        address: data.address || null,
        waterSchemeId: schemeId || null,
        notes: data.notes || null,
        createdById: current.id,
      })
      importedCount++
      reportRows.push({ ...data, Result: "Success", Details: "Customer created" })
    } catch (e: any) {
      console.error(`Import failed for ${data.customerAccount}`, e)
      failedCount++
      reportRows.push({ ...data, Result: "Failed", Details: e.message || "Unknown error" })
    }
  }

  // Include invalid rows in the report
  summary.rows.filter(r => !r.valid).forEach(r => {
    reportRows.push({ ...r.data, Result: "Validation Failed", Details: r.errors.join("; ") })
  })

  await writeAudit({
    user: current,
    action: "customer.bulk_import",
    entityType: "customer",
    details: { imported: importedCount, failed: failedCount },
  })

  revalidatePath("/dashboard/customers")

  const worksheet = XLSX.utils.json_to_sheet(reportRows)
  const csvReport = XLSX.utils.sheet_to_csv(worksheet)

  return {
    ok: true,
    imported: importedCount,
    failed: failedCount,
    report: csvReport,
  }
}

export async function downloadCustomerTemplate() {
  await requireUser()
  const headers = ["Name", "AccountNumber", "Phone", "Address", "WaterScheme", "Notes"]
  const data = [
    {
      Name: "Jane Doe",
      AccountNumber: "C-12345",
      Phone: "+256700000000",
      Address: "123 Main St, Sector 4",
      WaterScheme: "Mbarara Central",
      Notes: "Regular payer",
    },
  ]

  const worksheet = XLSX.utils.json_to_sheet(data, { header: headers })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Customers")
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
  return buffer.toString("base64")
}
