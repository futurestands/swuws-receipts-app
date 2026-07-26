"use server"

import { db } from "@/lib/db"
import {
  cluster,
  branch,
  waterScheme,
} from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { writeAudit } from "@/lib/audit"
import { canManageAreas, canManageSchemes, canManageClusters } from "@/lib/permissions"
import { eq, sql } from "drizzle-orm"
import * as XLSX from "xlsx"
import { z } from "zod"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { processExcelImport, getImportMapping, type ImportSummary, type ValidationResult } from "@/lib/import-engine"

const hierarchyImportSchema = z.object({
  type: z.enum(["Cluster", "Branch", "Scheme"]),
  name: z.string().trim().min(1, "Name is required"),
  code: z.coerce.string().trim().min(1, "Code is required"),
  parentName: z.string().trim().optional(), // Cluster -> none, Branch -> Cluster Name, Scheme -> Branch Name
  serviceArea: z.string().trim().optional(), // Only for Schemes
  status: z.string().trim().default("Active"),
})

export type HierarchyImportRow = z.infer<typeof hierarchyImportSchema>

export type HierarchyImportSummary = ImportSummary<HierarchyImportRow>

async function getExistenceMaps() {
  const [clusters, areas, schemes] = await Promise.all([
    db.select().from(cluster),
    db.select().from(branch),
    db.select().from(waterScheme),
  ])

  return {
    clusters: new Map(clusters.map((c) => [c.name.toLowerCase(), c])),
    clusterCodes: new Set(clusters.map((c) => c.code.toLowerCase())),
    areas: new Map(areas.map((a) => [a.name.toLowerCase(), a])),
    areaCodes: new Set(areas.map((a) => a.code.toLowerCase())),
    schemes: new Map(schemes.map((s) => [s.name.toLowerCase(), s])),
    schemeCodes: new Set(schemes.map((s) => s.code.toLowerCase())),
  }
}

export async function validateHierarchy(formData: FormData): Promise<{ ok: true; summary: HierarchyImportSummary } | { ok: false; error: string }> {
  const current = await requireUser()
  if (!canManageAreas(current) && !canManageSchemes(current)) throw new Error("Forbidden")

  const file = formData.get("file") as File
  if (!file) return { ok: false, error: "No file provided" }

  const existence = await getExistenceMaps()
  const seenCodes = new Set<string>()

  const mapping = (await getImportMapping('import.hierarchy.master')) as any || {
    clusterName: "Region",
    branchName: "AreaOffice",
    schemeName: "SchemeName",
    schemeCode: "SchemeCode",
    serviceArea: "ServiceArea"
  }

  const summary = await processExcelImport({
    file,
    schema: hierarchyImportSchema,
    mapping: {
      type: "Type",
      name: mapping.schemeName,
      code: mapping.schemeCode,
      parentName: mapping.branchName,
      serviceArea: mapping.serviceArea,
      status: "Status"
    } as any,
    onValidateRow: (data) => {
      const errors: string[] = []
      const warnings: string[] = []

      // Fix missing fields and format code if missing
      if (!data.type) data.type = "Scheme"
      if (!data.status) data.status = "Active"
      if (!data.code && data.name) {
        data.code = data.name.trim().toLowerCase().replace(/\s+/g, "_")
      }

      if (data.type === "Cluster") {
        if (!canManageClusters(current)) errors.push("You are not authorized to create Clusters")
        if (existence.clusterCodes.has(data.code)) errors.push(`Cluster code ${data.code} already exists`)
      } else if (data.type === "Branch") {
        if (!canManageAreas(current)) errors.push("You are not authorized to create Branches (Areas)")
        if (existence.areaCodes.has(data.code)) errors.push(`Branch code ${data.code} already exists`)
        if (data.parentName) {
          if (!existence.clusters.has(data.parentName.toLowerCase())) {
            errors.push(`Parent Cluster not found: ${data.parentName}`)
          }
        }
      } else if (data.type === "Scheme") {
        if (!canManageSchemes(current)) errors.push("You are not authorized to create Schemes")
        if (existence.schemeCodes.has(data.code)) errors.push(`Scheme code ${data.code} already exists`)

        if (!data.parentName) {
          errors.push("Parent Area Office is required for Schemes")
        } else if (!existence.areas.has(data.parentName.toLowerCase())) {
          warnings.push(`New Area Office will be created: ${data.parentName}`)
        }
      }

      if (seenCodes.has(data.code)) {
        errors.push(`Duplicate code in file: ${data.code}`)
      }
      seenCodes.add(data.code)

      return { errors, warnings }
    }
  })

  return { ok: true, summary: summary as HierarchyImportSummary }
}

export async function importHierarchy(summary: HierarchyImportSummary): Promise<{ ok: true; imported: number; failed: number; report: string } | { ok: false; error: string }> {
  const current = await requireUser()
  if (!canManageAreas(current) && !canManageSchemes(current)) throw new Error("Forbidden")
  const validRows = summary.rows.filter((r) => r.valid)
  if (validRows.length === 0) return { ok: false, error: "No valid rows to import" }

  const existence = await getExistenceMaps()
  let importedCount = 0
  let failedCount = 0
  const reportRows: any[] = []

  for (const row of validRows) {
    const { data } = row
    try {
      if (data.type === "Cluster") {
        await db.insert(cluster).values({
          id: randomUUID(),
          name: data.name,
          code: data.code,
          active: data.status.toLowerCase() === "active",
        })
      } else if (data.type === "Branch") {
        const parent = data.parentName ? existence.clusters.get(data.parentName.toLowerCase()) : null
        await db.insert(branch).values({
          id: randomUUID(),
          name: data.name,
          code: data.code,
          clusterId: parent?.id || null,
          active: data.status.toLowerCase() === "active",
        })
      } else if (data.type === "Scheme") {
        const parent = existence.areas.get(data.parentName!.toLowerCase())
        await db.insert(waterScheme).values({
          id: randomUUID(),
          name: data.name,
          code: data.code,
          branchId: parent?.id || null,
          serviceArea: data.serviceArea || null,
          active: data.status.toLowerCase() === "active",
        })
      }

      importedCount++
      reportRows.push({ ...data, Result: "Success", Details: "Created" })
    } catch (e: any) {
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
    action: "hierarchy.bulk_import",
    details: { imported: importedCount, failed: failedCount },
  })

  revalidatePath("/admin")

  const worksheet = XLSX.utils.json_to_sheet(reportRows)
  const csvReport = XLSX.utils.sheet_to_csv(worksheet)

  return {
    ok: true,
    imported: importedCount,
    failed: failedCount,
    report: csvReport,
  }
}

export async function downloadHierarchyTemplate() {
  await requireUser()
  const headers = ["Type", "Name", "Code", "Parent", "ServiceArea", "Status"]
  const data = [
    { Type: "Cluster", Name: "Central Cluster", Code: "central", Parent: "", ServiceArea: "", Status: "Active" },
    { Type: "Branch", Name: "Mbarara Branch", Code: "mbarara", Parent: "Central Cluster", ServiceArea: "", Status: "Active" },
    { Type: "Scheme", Name: "Kabere Scheme", Code: "kabere", Parent: "Mbarara Branch", ServiceArea: "South Sector", Status: "Active" },
  ]

  const worksheet = XLSX.utils.json_to_sheet(data, { header: headers })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Hierarchy")
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
  return buffer.toString("base64")
}
