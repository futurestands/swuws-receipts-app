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

const customerImportSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  customerAccount: z.string().trim().min(1, "Account number is required"),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  schemeName: z.string().trim().min(1, "Water Scheme is required"),
  meterRef: z.string().trim().optional(),
  serialNo: z.string().trim().optional(),
  openingArrears: z.coerce.number().default(0),
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

/**
 * Internal: Resolves column mapping from the Template Management system.
 */
async function getImportMapping(code: string) {
  const [template] = await db.select().from(managedTemplate).where(eq(managedTemplate.code, code)).limit(1)
  if (!template?.activeVersionId) return null

  const [version] = await db.select().from(templateVersion).where(eq(templateVersion.id, template.activeVersionId)).limit(1)
  if (!version) return null

  try {
    return JSON.parse(version.content)
  } catch {
    return null
  }
}

export async function validateCustomerImport(formData: FormData): Promise<{ ok: true; summary: CustomerImportSummary } | { ok: false; error: string }> {
  const current = await requireUser()
  if (!canUploadCustomers(current)) throw new Error("Forbidden")

  const file = formData.get("file") as File
  const allowUpdates = formData.get("allowUpdates") === "true" // New param
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

  // Resolve dynamic mapping
  const mapping = await getImportMapping('import.customers.bulk') || {
    name: "Name",
    customerAccount: "CustomerRef",
    phone: "Phone",
    address: "VillageName",
    schemeName: "SchemeName",
    meterRef: "MeterRef",
    serialNo: "MeterSerial",
    openingArrears: "OpeningArrears",
    notes: "Notes"
  }

  const results: CustomerValidationResult[] = []
  let validCount = 0
  let errorCount = 0
  let warningCount = 0

  for (const rawRow of rawData as any[]) {
    const errors: string[] = []
    const warnings: string[] = []

      const mappedRow: CustomerImportRow = {
        name: String(rawRow[mapping.name] || "").trim(),
        customerAccount: String(rawRow[mapping.customerAccount] || "").trim(),
        phone: String(rawRow[mapping.phone] || "").trim(),
        address: String(rawRow[mapping.address] || "").trim(),
        schemeName: String(rawRow[mapping.schemeName] || "").trim(),
        meterRef: String(rawRow[mapping.meterRef] || "").trim(),
        serialNo: String(rawRow[mapping.serialNo] || "").trim(),
        openingArrears: Number(rawRow[mapping.openingArrears] || 0),
        notes: String(rawRow[mapping.notes] || "").trim(),
      }

    const parsed = customerImportSchema.safeParse(mappedRow)
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => errors.push(issue.message))
    }

    if (mappedRow.customerAccount) {
      const accLower = mappedRow.customerAccount.toLowerCase()
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

export async function importCustomers(summary: CustomerImportSummary): Promise<{ ok: true; imported: number; updated: number; failed: number; report: string } | { ok: false; error: string }> {
  const current = await requireUser()
  if (!canUploadCustomers(current)) throw new Error("Forbidden")

  const validRows = summary.rows.filter((r) => r.valid)
  if (validRows.length === 0) return { ok: false, error: "No valid rows to import" }

  const schemeMap = await getSchemeMap()
  let importedCount = 0
  let updatedCount = 0
  let failedCount = 0
  const reportRows: any[] = []

  // Finding 4 Fix: Process in batches but handle individual row failures
  for (const row of validRows) {
    const { data } = row
    const schemeId = schemeMap.get(data.schemeName.toLowerCase())

    try {
      // Step 1: Check if customer exists
      const [existing] = await db
        .select()
        .from(customer)
        .where(eq(customer.customerAccount, data.customerAccount))
        .limit(1)

      if (existing) {
        // Step 2: UPDATE (Upsert)
        await db.update(customer).set({
          name: data.name,
          phone: data.phone || existing.phone,
          address: data.address || existing.address,
          waterSchemeId: schemeId || existing.waterSchemeId,
          meterRef: data.meterRef || existing.meterRef,
          serialNo: data.serialNo || existing.serialNo,
          openingArrears: data.openingArrears, // Arrears update is explicit
          accountBalance: data.openingArrears, // Reset balance to new arrears snapshot
          updatedAt: new Date(),
        }).where(eq(customer.id, existing.id))

        updatedCount++
        reportRows.push({ ...data, Result: "Updated", Details: "Existing record merged" })
      } else {
        // Step 3: INSERT (New)
        await db.insert(customer).values({
          id: randomUUID(),
          name: data.name,
          customerAccount: data.customerAccount,
          phone: data.phone || null,
          address: data.address || null,
          waterSchemeId: schemeId || null,
          meterRef: data.meterRef || null,
          serialNo: data.serialNo || null,
          openingArrears: data.openingArrears,
          accountBalance: data.openingArrears,
          notes: data.notes || null,
          createdById: current.id,
        })
        importedCount++
        reportRows.push({ ...data, Result: "Created", Details: "New record added" })
      }
    } catch (e: any) {
      failedCount++
      reportRows.push({ ...data, Result: "Failed", Details: e.message || "Database error" })
    }
  }

  // Include rows that failed the initial validation in the final report
  summary.rows.filter(r => !r.valid).forEach(r => {
    reportRows.push({ ...r.data, Result: "Validation Failed", Details: r.errors.join("; ") })
  })

  await writeAudit({
    user: current,
    action: "customer.bulk_import_upsert",
    entityType: "customer",
    details: { imported: importedCount, updated: updatedCount, failed: failedCount },
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
  const headers = ["MeterRef", "MeterSerial", "CustomerRef", "Name", "Phone", "VillageName", "SchemeName", "UmbrellaName", "CustomerType", "OpeningArrears", "CreationDate"]
  const data = [
    {
      MeterRef: "M-001",
      MeterSerial: "SN-12345",
      CustomerRef: "C-98765",
      Name: "Jane Doe",
      Phone: "+256700000000",
      VillageName: "Sector 4",
      SchemeName: "Mbarara Central",
      UmbrellaName: "SWUWS",
      CustomerType: "Domestic",
      OpeningArrears: 50000,
      CreationDate: new Date().toISOString().split("T")[0]
    },
  ]

  const worksheet = XLSX.utils.json_to_sheet(data, { header: headers })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Customers")
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
  return buffer.toString("base64")
}
