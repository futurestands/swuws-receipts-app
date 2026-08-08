"use server"

import { db } from "@/lib/db"
import { tariffConfiguration, waterScheme, branch } from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { writeAudit } from "@/lib/audit"
import { canConfigureSystem } from "@/lib/permissions"
import { validateWriteScope } from "@/lib/scopes"
import { eq, and, sql } from "drizzle-orm"
import * as XLSX from "xlsx"
import { z } from "zod"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { processExcelImport, getImportMapping, type ImportSummary } from "@/lib/import-engine"
import { DEFAULT_TARIFF_IMPORT_MAPPING } from "@/lib/import-mappings"
import { tariffImportSchema, type TariffImportRow } from "@/lib/import-schemas"
import { logEvent } from "@/lib/logger"

export type TariffImportSummary = ImportSummary<TariffImportRow>

export async function validateTariffImport(formData: FormData): Promise<{ ok: true; summary: TariffImportSummary } | { ok: false; error: string }> {
  const current = await requireUser()
  if (!canConfigureSystem(current)) throw new Error("Forbidden")

  const file = formData.get("file") as File
  if (!file) return { ok: false, error: "No file provided" }

  // Existence check maps
  const [branches, schemes, existingTariffs] = await Promise.all([
    db.select().from(branch),
    db.select().from(waterScheme),
    db.select().from(tariffConfiguration),
  ])
  const branchMap = new Map(branches.map(b => [b.name.toLowerCase(), b.id]))
  const schemeMap = new Map(schemes.map(s => [s.name.toLowerCase(), s.id]))

  // Map to quickly check for existing tariffs: "type:id:category" -> true
  const existingSet = new Set(existingTariffs.map(t =>
    `${t.targetType}:${t.targetId}:${t.customerCategory?.toLowerCase()}`
  ))

  const dbMapping = await getImportMapping('import.tariffs.bulk')
  const mapping = { ...DEFAULT_TARIFF_IMPORT_MAPPING, ...(dbMapping as any) } as Record<string, string>

  const summary = await processExcelImport({
    file,
    schema: tariffImportSchema,
    mapping,
    onValidateRow: async (data) => {
      const errors: string[] = []
      const warnings: string[] = []

      const targetNameStr = String(data.targetName)
      const nameLower = targetNameStr.toLowerCase()
      let targetId: string | undefined

      if (data.targetType === "branch") {
        targetId = branchMap.get(nameLower)
        if (!targetId) errors.push(`Branch "${targetNameStr}" not found`)
      } else {
        targetId = schemeMap.get(nameLower)
        if (!targetId) errors.push(`Scheme "${targetNameStr}" not found`)
      }

      if (targetId) {
        const isAuthorized = await validateWriteScope(current, "system.settings.manage", {
          branchId: data.targetType === "branch" ? targetId : undefined,
          schemeId: data.targetType === "scheme" ? targetId : undefined
        })
        if (!isAuthorized) {
          errors.push("Access Denied: You are not authorized to manage tariffs for this area.")
        } else {
          // Check for existing to show "Update" vs "New"
          const key = `${data.targetType}:${targetId}:${data.customerCategory?.toLowerCase() || 'domestic'}`
          if (existingSet.has(key)) {
            warnings.push("Update: This will override an existing tariff.")
          } else {
            warnings.push("New: This will create a new tariff entry.")
          }
        }
      }

      return { errors, warnings }
    }
  })

  return { ok: true, summary: summary as TariffImportSummary }
}

export async function executeTariffImport(summary: TariffImportSummary): Promise<{ ok: true; count: number; report: string } | { ok: false; error: string }> {
  const current = await requireUser()
  if (!canConfigureSystem(current)) throw new Error("Forbidden")

  const validRows = summary.rows.filter(r => r.valid)
  if (validRows.length === 0) return { ok: false, error: "No valid rows to import" }

  const [branches, schemes] = await Promise.all([
    db.select().from(branch),
    db.select().from(waterScheme),
  ])
  const branchMap = new Map(branches.map(b => [b.name.toLowerCase(), b.id]))
  const schemeMap = new Map(schemes.map(s => [s.name.toLowerCase(), s.id]))

  const reportRows: Array<Record<string, unknown>> = []
  let count = 0

  try {
    await db.transaction(async (tx) => {
      for (const row of validRows) {
        const { data } = row
        const targetId = data.targetType === "branch"
          ? branchMap.get(data.targetName.toLowerCase())!
          : schemeMap.get(data.targetName.toLowerCase())!

        // Goal Alignment: Verify scope for each individual tariff update
        const isAuthorized = await validateWriteScope(current, "system.settings.manage", {
          branchId: data.targetType === "branch" ? targetId : undefined,
          schemeId: data.targetType === "scheme" ? targetId : undefined
        })

        if (!isAuthorized) {
          reportRows.push({ ...data, Result: "Failed", Details: "Access Denied: You are not authorized to manage tariffs for this area." })
          continue
        }

        // Upsert logic: check if exists
        const [existing] = await tx
          .select({ id: tariffConfiguration.id })
          .from(tariffConfiguration)
          .where(and(
            eq(tariffConfiguration.targetType, data.targetType),
            eq(tariffConfiguration.targetId, targetId),
            eq(tariffConfiguration.customerCategory, data.customerCategory)
          ))
          .limit(1)

        if (existing) {
          await tx.update(tariffConfiguration)
            .set({
              unitPrice: String(data.unitPrice),
              serviceFee: String(data.serviceFee),
              vatPercentage: data.vatPercentage,
              active: data.active,
              updatedAt: new Date(),
            })
            .where(eq(tariffConfiguration.id, existing.id))
          reportRows.push({ ...data, Result: "Updated" })
        } else {
          await tx.insert(tariffConfiguration).values({
            id: randomUUID(),
            targetType: data.targetType,
            targetId: targetId,
            customerCategory: data.customerCategory,
            unitPrice: String(data.unitPrice),
            serviceFee: String(data.serviceFee),
            vatPercentage: data.vatPercentage,
            active: data.active,
          })
          reportRows.push({ ...data, Result: "Created" })
        }
        count++
      }

      await writeAudit({
        user: current,
        action: "tariff.bulk_import",
        details: { count, totalRows: summary.rows.length }
      }, tx)
    })

    revalidatePath("/admin")
    const worksheet = XLSX.utils.json_to_sheet(reportRows)
    return { ok: true, count, report: XLSX.utils.sheet_to_csv(worksheet) }
  } catch (e: unknown) {
    logEvent({
      message: "Tariff import failed",
      severity: "error",
      category: "system",
      error: e,
      user: current,
    })
    const message = e instanceof Error ? e.message : "Failed to execute bulk import"
    return { ok: false, error: message }
  }
}

export async function downloadTariffTemplate() {
  await requireUser()

  // 1. Resolve Mapping from Template Hub
  const dbMapping = await getImportMapping('import.tariffs.bulk')

  /**
   * STRICT TEMPLATE ALIGNMENT (Phase 2B Fix)
   *
   * We now use the DB mapping EXCLUSIVELY if it exists.
   * Mandatory columns are NO LONGER injected. What is in the JSON is what is in the Excel.
   */
  const mapping: Record<string, string | string[]> = dbMapping || { ...DEFAULT_TARIFF_IMPORT_MAPPING }

  // 2. Generate Sample Data strictly based on the mapping keys
  const headers = Object.values(mapping).map(v => Array.isArray(v) ? v[0] : v) as string[]
  const sampleRow: Record<string, any> = {}

  // Fill sample values ONLY for keys that the user defined in their JSON
  if (mapping.targetType) sampleRow[Array.isArray(mapping.targetType) ? mapping.targetType[0] : mapping.targetType] = "scheme"
  if (mapping.targetName) sampleRow[Array.isArray(mapping.targetName) ? mapping.targetName[0] : mapping.targetName] = "Sample Area"
  if (mapping.customerCategory) sampleRow[Array.isArray(mapping.customerCategory) ? mapping.customerCategory[0] : mapping.customerCategory] = "domestic"
  if (mapping.unitPrice) sampleRow[Array.isArray(mapping.unitPrice) ? mapping.unitPrice[0] : mapping.unitPrice] = 3000
  if (mapping.serviceFee) sampleRow[Array.isArray(mapping.serviceFee) ? mapping.serviceFee[0] : mapping.serviceFee] = 1200
  if (mapping.vatPercentage) sampleRow[Array.isArray(mapping.vatPercentage) ? mapping.vatPercentage[0] : mapping.vatPercentage] = 18
  if (mapping.active) sampleRow[Array.isArray(mapping.active) ? mapping.active[0] : mapping.active] = "TRUE"

  const worksheet = XLSX.utils.json_to_sheet([sampleRow], { header: headers })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "TariffTemplate")
  return XLSX.write(workbook, { type: "base64", bookType: "xlsx" })
}
