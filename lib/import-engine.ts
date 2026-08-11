import * as XLSX from "xlsx"
import { z } from "zod"
import { db } from "@/lib/db"
import { managedTemplate, templateVersion } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

/**
 * UNIFIED IMPORT ENGINE
 *
 * Standardizes Excel parsing, dynamic column mapping, and Zod-based
 * validation across all system modules.
 */

export type ValidationResult<T> = {
  valid: boolean
  errors: string[]
  warnings: string[]
  data: T
}

export type ImportSummary<T> = {
  totalRows: number
  validRows: number
  errorRows: number
  warningRows: number
  rows: ValidationResult<T>[]
}

/**
 * Resolves column mapping from the Template Management system.
 */
export async function getImportMapping(code: string): Promise<Record<string, string> | null> {
  const [template] = await db.select().from(managedTemplate).where(eq(managedTemplate.code, code)).limit(1)
  if (!template?.activeVersionId) return null

  const [versionRow] = await db.select().from(templateVersion).where(eq(templateVersion.id, template.activeVersionId)).limit(1)
  if (!versionRow) return null

  try {
    return JSON.parse(versionRow.content)
  } catch (err) {
    console.error(`Failed to parse import mapping for ${code}:`, err)
    return null
  }
}

/**
 * Core engine to process an Excel file into validated typed objects.
 * Supports both Header-based mapping (with aliases) and Positional mapping.
 */
export async function processExcelImport<T extends Record<string, unknown>>(params: {
  file: File
  schema: z.ZodSchema<T>
  mapping: Record<keyof T, string | string[] | number>
  headerMode?: "headers" | "none"
  onValidateRow?: (
    row: T,
  ) => { errors: string[]; warnings: string[] } | Promise<{ errors: string[]; warnings: string[] }>
}): Promise<ImportSummary<T>> {
  const buffer = await params.file.arrayBuffer()
  const workbook = XLSX.read(buffer)
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]

  // If no headers, we read the sheet as an array of arrays (header: 1)
  const isNoHeaders = params.headerMode === "none"
  const rawData = XLSX.utils.sheet_to_json(firstSheet, {
    header: isNoHeaders ? 1 : undefined,
  })

  if (rawData.length > 50000) {
    throw new Error(
      `Import exceeds maximum limit of 50,000 rows. Please split the file and try again.`,
    )
  }

  // Header Discovery (for header mode)
  const actualHeaderMap: Record<string, string> = {}
  if (!isNoHeaders && rawData.length > 0) {
    const firstRow = rawData[0] as Record<string, unknown>
    const fileHeaders = Object.keys(firstRow)

    for (const [field, aliasOrList] of Object.entries(params.mapping)) {
      const aliases = Array.isArray(aliasOrList)
        ? aliasOrList
        : typeof aliasOrList === "string"
        ? [aliasOrList]
        : []

      if (aliases.length > 0) {
        // Super-Fuzzy Match: Ignore all non-alphanumeric characters (dots, spaces, slashes, etc.)
        const normalize = (s: string | number) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "")

        const matched = fileHeaders.find((h) =>
          aliases.some((a) => {
            if (typeof a === "number") return false
            const normA = normalize(a)
            const normH = normalize(h)
            return normA === normH || (normA.length > 3 && (normA.includes(normH) || normH.includes(normA)))
          }),
        )
        if (matched) {
          actualHeaderMap[field] = matched
        }
      }
    }
  }

  const results: ValidationResult<T>[] = []
  let validCount = 0
  let errorCount = 0
  let warningCount = 0

  for (const rawRow of rawData as Array<Record<string, unknown>>) {
    const errors: string[] = []
    const warnings: string[] = []

    // 1. Dynamic Mapping
    const mappedRow: Record<string, unknown> = {}
    for (const [field, aliasOrIndex] of Object.entries(params.mapping)) {
      if (isNoHeaders && typeof aliasOrIndex === "number") {
        // Positional Mapping (Array index)
        mappedRow[field] = (rawRow as unknown as unknown[])[aliasOrIndex]
      } else if (!isNoHeaders) {
        // Header Mapping (using discovered actual header or direct name)
        const headerName = actualHeaderMap[field] || (typeof aliasOrIndex === "string" ? aliasOrIndex : null)
        if (headerName) {
          mappedRow[field] = rawRow[headerName]
        }
      }
    }

    // Skip empty rows (often generated at end of files)
    const hasData = Object.values(mappedRow).some(
      (v) => v !== undefined && v !== null && v !== "",
    )
    if (!hasData) continue

    // 2. Schema Validation
    const parsed = params.schema.safeParse(mappedRow)
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => errors.push(issue.message))
    }

    // Use parsed data if successful, otherwise fallback to mapped raw row
    const data = (parsed.success ? parsed.data : mappedRow) as T

    // 3. Custom Domain Validation (e.g. checking duplicates in DB)
    if (params.onValidateRow) {
      const custom = await params.onValidateRow(data)
      errors.push(...custom.errors)
      warnings.push(...custom.warnings)
    }

    const isValid = errors.length === 0
    if (isValid) {
      validCount++
    } else {
      errorCount++
    }
    if (warnings.length > 0) warningCount++

    results.push({
      valid: isValid,
      errors,
      warnings,
      data,
    })
  }

  return {
    totalRows: results.length,
    validRows: validCount,
    errorRows: errorCount,
    warningRows: warningCount,
    rows: results,
  }
}
