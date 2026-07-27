"use server"

import { db } from "@/lib/db"
import { tariffConfiguration, waterScheme, branch } from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { writeAudit } from "@/lib/audit"
import { canConfigureSystem } from "@/lib/permissions"
import { eq, and, sql } from "drizzle-orm"
import * as XLSX from "xlsx"
import { z } from "zod"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { processExcelImport, getImportMapping, type ImportSummary } from "@/lib/import-engine"

const tariffImportSchema = z.object({
  targetType: z.enum(["branch", "scheme"]),
  targetName: z.string().trim().min(1, "Area name is required"),
  unitPrice: z.coerce.number().min(0, "Unit price cannot be negative"),
  serviceFee: z.coerce.number().min(0, "Service fee cannot be negative"),
  vatPercentage: z.coerce.number().min(0).max(100).default(18),
  active: z.coerce.boolean().default(true),
})

export type TariffImportRow = z.infer<typeof tariffImportSchema>
export type TariffImportSummary = ImportSummary<TariffImportRow>

export async function validateTariffImport(formData: FormData): Promise<{ ok: true; summary: TariffImportSummary } | { ok: false; error: string }> {
  const current = await requireUser()
  if (!canConfigureSystem(current)) throw new Error("Forbidden")

  const file = formData.get("file") as File
  if (!file) return { ok: false, error: "No file provided" }

  // Existence check maps
  const [branches, schemes] = await Promise.all([
    db.select().from(branch),
    db.select().from(waterScheme),
  ])
  const branchMap = new Map(branches.map(b => [b.name.toLowerCase(), b.id]))
  const schemeMap = new Map(schemes.map(s => [s.name.toLowerCase(), s.id]))

  const mapping = (await getImportMapping('import.tariffs.bulk')) as any || {
    targetType: "Type", // "branch" or "scheme"
    targetName: "AreaName",
    unitPrice: "UnitPrice",
    serviceFee: "ServiceFee",
    vatPercentage: "VAT",
    active: "Status"
  }

  const summary = await processExcelImport({
    file,
    schema: tariffImportSchema,
    mapping,
    onValidateRow: (data) => {
      const errors: string[] = []
      const warnings: string[] = []

      const nameLower = data.targetName.toLowerCase()
      if (data.targetType === "branch") {
        if (!branchMap.has(nameLower)) errors.push(`Branch "${data.targetName}" not found`)
      } else {
        if (!schemeMap.has(nameLower)) errors.push(`Scheme "${data.targetName}" not found`)
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

  const reportRows: any[] = []
  let count = 0

  try {
    await db.transaction(async (tx) => {
      for (const row of validRows) {
        const { data } = row
        const targetId = data.targetType === "branch"
          ? branchMap.get(data.targetName.toLowerCase())!
          : schemeMap.get(data.targetName.toLowerCase())!

        // Upsert logic: check if exists
        const [existing] = await tx
          .select({ id: tariffConfiguration.id })
          .from(tariffConfiguration)
          .where(and(
            eq(tariffConfiguration.targetType, data.targetType),
            eq(tariffConfiguration.targetId, targetId)
          ))
          .limit(1)

        if (existing) {
          await tx.update(tariffConfiguration)
            .set({
              unitPrice: data.unitPrice,
              serviceFee: data.serviceFee,
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
            unitPrice: data.unitPrice,
            serviceFee: data.serviceFee,
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
  } catch (e: any) {
    console.error("Tariff import failed", e)
    return { ok: false, error: e.message || "Failed to execute bulk import" }
  }
}

export async function downloadTariffTemplate() {
  await requireUser()
  const headers = ["Type", "AreaName", "UnitPrice", "ServiceFee", "VAT", "Status"]
  const data = [
    { Type: "scheme", AreaName: "MASTYORO", UnitPrice: 3000, ServiceFee: 123, VAT: 18, Status: "true" },
    { Type: "branch", AreaName: "BUSHENYI", UnitPrice: 2000, ServiceFee: 2000, VAT: 18, Status: "true" },
  ]
  const worksheet = XLSX.utils.json_to_sheet(data, { header: headers })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "TariffTemplate")
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }).toString("base64")
}
