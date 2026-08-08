"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { user, cluster, branch, waterScheme, organization } from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { writeAudit } from "@/lib/audit"
import { ROLES, ROLE_LABELS, type Role } from "@/lib/permissions/roles"
import { canManageUsers, canCreateRole } from "@/lib/permissions"
import { eq, inArray, sql } from "drizzle-orm"
import { headers } from "next/headers"
import * as XLSX from "xlsx"
import { z } from "zod"
import { randomUUID } from "crypto"
import { getImportMapping } from "@/lib/import-engine"
import { DEFAULT_USER_IMPORT_MAPPING } from "@/lib/import-mappings"
import { userImportSchema, type UserImportRow } from "@/lib/import-schemas"
import { logEvent } from "@/lib/logger"

export type ValidationResult = {
  valid: boolean
  errors: string[]
  warnings: string[]
  data: UserImportRow
}

export type ImportSummary = {
  totalRows: number
  validRows: number
  warningRows: number
  errorRows: number
  rows: ValidationResult[]
}

async function getHierarchyMaps() {
  const [clusters, areas, schemes] = await Promise.all([
    db.select().from(cluster),
    db.select().from(branch),
    db.select().from(waterScheme),
  ])

  return {
    clusters: new Map(clusters.map((c) => [c.name.toLowerCase(), c])),
    areas: new Map(areas.map((a) => [a.name.toLowerCase(), a])),
    schemes: new Map(schemes.map((s) => [s.name.toLowerCase(), s])),
    // For hierarchy validation: area -> clusterId, scheme -> areaId
  }
}

export async function validateBulkUsers(formData: FormData): Promise<{ ok: true; summary: ImportSummary } | { ok: false; error: string }> {
  const current = await requireUser()
  if (!canManageUsers(current)) throw new Error("Forbidden")

  const file = formData.get("file") as File
  if (!file) return { ok: false, error: "No file provided" }

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer)
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  const rawData = XLSX.utils.sheet_to_json(firstSheet)

  if (rawData.length === 0) return { ok: false, error: "The file is empty" }

  const hierarchy = await getHierarchyMaps()
  const existingUsers = await db.select({ email: user.email }).from(user)
  const existingEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()))
  const seenInUpload = new Set<string>()

  // Resolve the column mapping from Template Management (import.users.bulk),
  // falling back to the plain-English defaults if no template is configured.
  // This must be the same mapping downloadBulkImportTemplate used to
  // generate the headers the person is now uploading — see the comment on
  // DEFAULT_USER_IMPORT_MAPPING above.
  const dbMapping = await getImportMapping("import.users.bulk")
  const mapping = { ...DEFAULT_USER_IMPORT_MAPPING, ...(dbMapping as any) } as Record<string, string>

  const results: ValidationResult[] = []
  let validCount = 0
  let errorCount = 0
  let warningCount = 0

  for (const rawRow of rawData as Array<Record<string, unknown>>) {
    const errors: string[] = []
    const warnings: string[] = []

    // Map Excel/CSV headers to schema keys using the resolved template mapping.
    const mappedRow: UserImportRow = {
      name: String(rawRow[mapping.name] || "").trim(),
      email: String(rawRow[mapping.email] || "").trim().toLowerCase(),
      password: rawRow[mapping.password] ? String(rawRow[mapping.password]).trim() : undefined,
      role: String(rawRow[mapping.role] || "").trim(),
      cluster: String(rawRow[mapping.cluster] || "").trim(),
      area: String(rawRow[mapping.area] || "").trim(),
      scheme: String(rawRow[mapping.scheme] || "").trim(),
      phone: String(rawRow[mapping.phone] || "").trim(),
      status: String(rawRow[mapping.status] || "Active").trim(),
    }

    const parsed = userImportSchema.safeParse(mappedRow)
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => errors.push(issue.message))
    }

    if (mappedRow.email) {
      if (existingEmails.has(mappedRow.email)) {
        errors.push("Email already exists in the system")
      }
      if (seenInUpload.has(mappedRow.email)) {
        errors.push("Duplicate email in the upload file")
      }
      seenInUpload.add(mappedRow.email)
    }

    // Role validation
    const targetRole = Object.entries(ROLE_LABELS).find(([_, label]) => label.toLowerCase() === mappedRow.role.toLowerCase())?.[0] as Role
    if (!targetRole) {
      errors.push(`Invalid role: ${mappedRow.role}`)
    } else {
      if (!canCreateRole(current, targetRole)) {
        errors.push(`You are not authorized to create a ${mappedRow.role} account`)
      }
    }

    // Hierarchy validation
    let clusterId: string | null = null
    let areaId: string | null = null
    let schemeId: string | null = null

    if (mappedRow.cluster) {
      const c = hierarchy.clusters.get(mappedRow.cluster.toLowerCase())
      if (!c) {
        errors.push(`Cluster not found: ${mappedRow.cluster}`)
      } else {
        clusterId = c.id
      }
    }

    if (mappedRow.area) {
      const a = hierarchy.areas.get(mappedRow.area.toLowerCase())
      if (!a) {
        errors.push(`Area not found: ${mappedRow.area}`)
      } else {
        areaId = a.id
        if (clusterId && a.clusterId !== clusterId) {
          errors.push(`Area ${mappedRow.area} does not belong to Cluster ${mappedRow.cluster}`)
        }
      }
    }

    if (mappedRow.scheme) {
      const s = hierarchy.schemes.get(mappedRow.scheme.toLowerCase())
      if (!s) {
        errors.push(`Scheme not found: ${mappedRow.scheme}`)
      } else {
        schemeId = s.id
        if (areaId && s.branchId !== areaId) {
          errors.push(`Scheme ${mappedRow.scheme} does not belong to Area ${mappedRow.area}`)
        }
      }
    }

    const isValid = errors.length === 0
    if (isValid) {
      validCount++
      if (warnings.length > 0) warningCount++
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

export async function importBulkUsers(summary: ImportSummary): Promise<{ ok: true; imported: number; failed: number; report: string } | { ok: false; error: string }> {
  const current = await requireUser()
  if (!canManageUsers(current)) throw new Error("Forbidden")

  const startTime = Date.now()
  const validRows = summary.rows.filter((r) => r.valid)

  if (validRows.length === 0) return { ok: false, error: "No valid rows to import" }

  const hierarchy = await getHierarchyMaps()

  let importedCount = 0
  let failedCount = 0
  const reportRows: Array<Record<string, unknown>> = []

  for (const row of validRows) {
    const { data } = row
    const targetRole = Object.entries(ROLE_LABELS).find(([_, label]) => label.toLowerCase() === data.role.toLowerCase())?.[0] as Role

    const clusterRecord = data.cluster ? hierarchy.clusters.get(data.cluster.toLowerCase()) : null
    const areaRecord = data.area ? hierarchy.areas.get(data.area.toLowerCase()) : null
    const schemeRecord = data.scheme ? hierarchy.schemes.get(data.scheme.toLowerCase()) : null

    // Use password from spreadsheet if available, otherwise generate a random one
    const finalPassword = data.password || `SWUWS-${Math.random().toString(36).slice(-10)}!`
    let createdUserId: string | null = null

    try {
      // 1. Create account via Better Auth
      const created = await auth.api.signUpEmail({
        body: {
          name: data.name,
          email: data.email,
          password: finalPassword,
        },
      })

      if (!created?.user?.id) throw new Error("Better Auth creation failed")
      createdUserId = created.user.id

      // Automatically assign organizationId if possible
      const [org] = await db.select({ id: organization.id }).from(organization).limit(1)
      const organizationId = org?.id || null

      // 2. Update user record with role, hierarchy and phone
      await db
        .update(user)
        .set({
          role: targetRole,
          phone: data.phone?.trim() || null,
          organizationId,
          clusterId: clusterRecord?.id || null,
          branchId: areaRecord?.id || null, // branchId is used for Area
          schemeId: schemeRecord?.id || null,
          active: data.status.toLowerCase() === "active",
          updatedAt: new Date(),
        })
        .where(eq(user.id, createdUserId))

      // 3. Individual Audit Log (equivalent to manual creation)
      await writeAudit({
        user: current,
        action: "agent.create",
        entityType: "user",
        entityId: createdUserId,
        details: {
          email: data.email,
          role: targetRole,
          source: "Bulk Import",
          hierarchy: {
            cluster: data.cluster,
            area: data.area,
            scheme: data.scheme,
          },
        },
      })

      importedCount++
      reportRows.push({
        ...data,
        Password: finalPassword,
        Result: "Success",
        Details: "Account created successfully",
      })
    } catch (e: unknown) {
      logEvent({
        message: `Import failed for ${data.email}`,
        severity: "error",
        category: "system",
        error: e,
        user: current,
      })
      let errorDetails = e instanceof Error ? e.message : "Unknown error"

      // Zombie Account Protection: Cleanup if DB update or audit failed after auth creation
      if (createdUserId) {
        try {
          await auth.api.removeUser({
            body: { userId: createdUserId },
            headers: await headers(),
          })
          errorDetails += " (Zombie account cleaned up)"
        } catch (cleanupError: unknown) {
          logEvent({
            message: `Cleanup failed for ${data.email}`,
            severity: "fatal",
            category: "system",
            error: cleanupError,
            user: current,
          })
          const cleanupMsg = cleanupError instanceof Error ? cleanupError.message : "Unknown error"
          errorDetails += ` (CRITICAL: Zombie account remains. Cleanup failed: ${cleanupMsg})`
        }
      }

      failedCount++
      reportRows.push({
        ...data,
        Password: "",
        Result: "Failed",
        Details: errorDetails,
      })
    }
  }

  // Include invalid rows in the report
  summary.rows
    .filter((r) => !r.valid)
    .forEach((r) => {
      reportRows.push({
        ...r.data,
        Password: "",
        Result: "Validation Failed",
        Details: r.errors.join("; "),
      })
    })

  // Audit log
  await writeAudit({
    user: current,
    action: "user.bulk_import",
    entityType: "user",
    details: {
      rows: summary.totalRows,
      imported: importedCount,
      failed: failedCount,
      duration: Date.now() - startTime,
    },
  })

  // Generate CSV report
  const worksheet = XLSX.utils.json_to_sheet(reportRows)
  const csvReport = XLSX.utils.sheet_to_csv(worksheet)

  return {
    ok: true,
    imported: importedCount,
    failed: failedCount,
    report: csvReport,
  }
}

export async function downloadBulkImportTemplate(format: "xlsx" | "csv") {
  await requireUser()

  // Resolve headers from Template Hub — same resolution path validateBulkUsers
  // now uses, so what this generates and what that parses can never drift
  // apart again.
  const dbMapping = await getImportMapping("import.users.bulk")
  const mapping = { ...DEFAULT_USER_IMPORT_MAPPING, ...(dbMapping as any) } as Record<string, string>

  const headers = Object.values(mapping)
  const sampleRow: Record<string, string> = {}
  Object.entries(mapping).forEach(([key, col]) => {
    if (key === 'email') sampleRow[col] = "john.doe@example.com"
    else if (key === 'name') sampleRow[col] = "John Doe"
    else if (key === 'role') sampleRow[col] = "Plumber (Agent)"
    else sampleRow[col] = "Sample Value"
  })

  const worksheet = XLSX.utils.json_to_sheet([sampleRow], { header: headers })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Users")

  if (format === "xlsx") {
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
    return buffer.toString("base64")
  } else {
    const csv = XLSX.utils.sheet_to_csv(worksheet)
    return Buffer.from(csv).toString("base64")
  }
}
