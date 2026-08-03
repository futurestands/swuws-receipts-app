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

const customerImportSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  customerAccount: z.coerce.string().trim().min(1, "Account number is required"),
  phone: z.coerce.string().trim().optional(),
  address: z.string().trim().optional(),
  schemeName: z.coerce.string().trim().min(1, "Water Scheme is required"),
  meterRef: z.coerce.string().trim().optional(),
  serialNo: z.coerce.string().trim().optional(),
  openingArrears: z.coerce.number().default(0),
  category: z.string().trim().toLowerCase().default("domestic"), // domestic, institutional, psp, commercial
  notes: z.string().trim().optional(),
})

export type CustomerImportRow = z.infer<typeof customerImportSchema>

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

  const mapping = (await getImportMapping("import.customers.bulk")) || {
    name: "Name",
    customerAccount: "CustomerRef",
    phone: "Phone",
    address: "VillageName",
    schemeName: "SchemeName",
    meterRef: "MeterRef",
    serialNo: "MeterSerial",
    openingArrears: ["OpeningArrears", "Arrears", "Balance Brought Forward", "BalanceBroughtForward", "Brought Forward"],
    category: "Category",
    notes: "Notes",
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
          category: data.category || existing.category,
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
          category: data.category || "domestic",
          openingArrears: data.openingArrears,
          accountBalance: data.openingArrears,
          notes: data.notes || null,
          createdById: current.id,
        })
        importedCount++
        reportRows.push({ ...data, Result: "Created", Details: "New record added" })
      }
    } catch (e: unknown) {
      failedCount++
      const message = e instanceof Error ? e.message : "Database error"
      reportRows.push({ ...data, Result: "Failed", Details: message })
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

  // 1. Resolve Headers from Template Hub (Unified resilient resolution)
  const mapping = (await getImportMapping("import.customers.bulk")) || {
    name: "Name",
    customerAccount: "CustomerRef",
    phone: "Phone",
    address: "VillageName",
    schemeName: "SchemeName",
    meterRef: "MeterRef",
    serialNo: "MeterSerial",
    openingArrears: "OpeningArrears",
    category: "Category",
    notes: "Notes",
  }

  const headers = Object.values(mapping)
  const sampleRow: Record<string, string | number> = {}
  Object.entries(mapping).forEach(([key, col]) => {
    // Basic defaults for samples
    if (key === 'openingArrears') sampleRow[col as string] = 50000
    else if (key === 'name') sampleRow[col as string] = "Jane Doe"
    else if (key === 'customerAccount') sampleRow[col as string] = "C-98765"
    else if (key === 'schemeName') sampleRow[col as string] = "Mbarara Central"
    else if (key === 'category') sampleRow[col as string] = "domestic"
    else sampleRow[col as string] = "Sample Value"
  })

  const worksheet = XLSX.utils.json_to_sheet([sampleRow], { header: headers })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Customers")
  return XLSX.write(workbook, { type: "base64", bookType: "xlsx" })
}
