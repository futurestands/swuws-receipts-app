"use server"

import { db } from "@/lib/db"
import { cluster, branch, waterScheme, managedTemplate, templateVersion } from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { writeAudit } from "@/lib/audit"
import { canManageAreas, canManageSchemes } from "@/lib/permissions"
import { eq } from "drizzle-orm"
import * as XLSX from "xlsx"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { getImportMapping } from "@/lib/import-engine"
import { DEFAULT_HIERARCHY_IMPORT_MAPPING } from "./hierarchy-import"

/**
 * Unified Hierarchy Import Logic
 * Automatically creates Region (Cluster) and Area Office (Branch) if they don't exist.
 */
export async function importUnifiedHierarchy(formData: FormData) {
  const current = await requireUser()
  if (!canManageAreas(current) || !canManageSchemes(current)) throw new Error("Forbidden")

  const file = formData.get("file") as File
  if (!file) throw new Error("No file provided")

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer)
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  const rawData = XLSX.utils.sheet_to_json(firstSheet)

  // 1. Resolve Mapping from Template Hub (Using consolidated logic)
  const mapping = (await getImportMapping('import.hierarchy.master')) || (DEFAULT_HIERARCHY_IMPORT_MAPPING as unknown as Record<string, string | string[]>)

  let importedCount = 0

  for (const rawRow of rawData as Array<Record<string, unknown>>) {
    try {
      const regionName = String(rawRow[mapping.clusterName as string] || "").trim()
      const areaName = String(rawRow[mapping.branchName as string] || "").trim()
      const schemeName = String(rawRow[mapping.schemeName as string] || "").trim()

      // Smart header resolution for Code (since it's often optional in master files)
      const codeHeader = Array.isArray(mapping.schemeCode) ?
        (Object.keys(rawRow).find(h => (mapping.schemeCode as string[]).includes(h)) || "SchemeCode") :
        (mapping.schemeCode as string)

      // Making code optional: fallback to name-slug if empty
      const rawCode = String(rawRow[codeHeader] || "").trim()
      const schemeCode = (rawCode || schemeName).toLowerCase().replace(/\s+/g, "_")
      const serviceArea = String(rawRow[mapping.serviceArea as string] || "").trim()

      if (!regionName || !areaName || !schemeName) continue

      await db.transaction(async (tx) => {
        // A. Handle Region (Cluster)
        let regionId: string
        const [existingRegion] = await tx.select().from(cluster).where(eq(cluster.name, regionName)).limit(1)
        if (existingRegion) {
          regionId = existingRegion.id
        } else {
          regionId = randomUUID()
          await tx.insert(cluster).values({ id: regionId, name: regionName, code: regionName.toLowerCase().replace(/\s+/g, "_") })
        }

        // B. Handle Area Office (Branch)
        let areaId: string
        const [existingArea] = await tx.select().from(branch).where(eq(branch.name, areaName)).limit(1)
        if (existingArea) {
          areaId = existingArea.id
        } else {
          areaId = randomUUID()
          await tx.insert(branch).values({ id: areaId, name: areaName, code: areaName.toLowerCase().replace(/\s+/g, "_"), clusterId: regionId })
        }

        // C. Handle Water Scheme
        const [existingScheme] = await tx.select().from(waterScheme).where(eq(waterScheme.name, schemeName)).limit(1)
        if (!existingScheme) {
          await tx.insert(waterScheme).values({
            id: randomUUID(),
            name: schemeName,
            code: schemeCode || schemeName.toLowerCase().replace(/\s+/g, "_"),
            branchId: areaId,
            serviceArea: serviceArea || null,
          })
        }
      })

      importedCount++
    } catch (e: unknown) {
      console.error("Hierarchy row import failed", e)
    }
  }

  await writeAudit({
    user: current,
    action: "hierarchy.unified_import",
    details: { imported: importedCount },
  })

  revalidatePath("/admin")
  return { ok: true, imported: importedCount, error: undefined }
}

export async function downloadUnifiedHierarchyTemplate() {
  await requireUser()

  // 1. Resolve Mapping from Template Hub (Dynamic headers)
  const mapping = (await getImportMapping('import.hierarchy.master')) || (DEFAULT_HIERARCHY_IMPORT_MAPPING as unknown as Record<string, string | string[]>)

  const headers = [
    mapping.clusterName as string,
    mapping.branchName as string,
    mapping.schemeName as string,
    (Array.isArray(mapping.schemeCode) ? mapping.schemeCode[0] : mapping.schemeCode) as string,
    mapping.serviceArea as string
  ]

  const data = [
    {
      [mapping.clusterName as string]: "Southwestern",
      [mapping.branchName as string]: "Mbarara Area",
      [mapping.schemeName as string]: "Kabere Scheme",
      [Array.isArray(mapping.schemeCode) ? mapping.schemeCode[0] : mapping.schemeCode]: "kab_01",
      [mapping.serviceArea as string]: "South Sector"
    },
  ]

  const worksheet = XLSX.utils.json_to_sheet(data, { header: headers })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Hierarchy")
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }).toString("base64")
}
