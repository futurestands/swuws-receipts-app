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
  } catch {
    return null
  }
}

/**
 * Core engine to process an Excel file into validated typed objects.
 */
export async function processExcelImport<T extends Record<string, any>>(params: {
  file: File
  schema: z.ZodSchema<T>
  mapping: Record<keyof T, string>
  onValidateRow?: (row: T) => { errors: string[]; warnings: string[] } | Promise<{ errors: string[]; warnings: string[] }>
}): Promise<ImportSummary<T>> {
  const buffer = await params.file.arrayBuffer()
  const workbook = XLSX.read(buffer)
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  const rawData = XLSX.utils.sheet_to_json(firstSheet)

  const results: ValidationResult<T>[] = []
  let validCount = 0
  let errorCount = 0
  let warningCount = 0

  for (const rawRow of rawData as any[]) {
    const errors: string[] = []
    const warnings: string[] = []

    // 1. Dynamic Mapping
    const mappedRow: any = {}
    for (const [field, excelColumn] of Object.entries(params.mapping)) {
      mappedRow[field] = rawRow[excelColumn as string]
    }

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
    totalRows: rawData.length,
    validRows: validCount,
    errorRows: errorCount,
    warningRows: warningCount,
    rows: results,
  }
}
