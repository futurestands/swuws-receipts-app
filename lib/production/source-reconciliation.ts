import * as XLSX from "xlsx"
import fs from "node:fs"
import path from "node:path"

export type ReconciliationState =
  | "EXACT_MATCH"
  | "APPROVED_ALIAS"
  | "AMBIGUOUS"
  | "UNMATCHED"
  | "INVALID_ENGINEERING_INPUT"
  | "READY_FOR_REVIEW"

export interface ExtractedSourceRecord {
  clusterName: string
  areaName: string
  schemeName: string
  sourceName: string
  technology: string
  regimeHoursPerDay: number | null
  installedCapacityM3Hr: number | null
  containerVolumeLitres: number | null
  fillTimeSeconds: number | null
  calculatedFlowLps: number | null
  calculatedFlowM3Hr: number | null
  calculatedCapacityM3Day: number | null
  schemeMonthlyCapacityM3: number | null
  workbookSheet: string
  cellCoordinates: string
  formula: string | null
  notes: string | null
}

export interface SchemeSourceReconciliationRecord {
  dbSchemeId: string
  dbSchemeName: string
  dbClusterName: string
  dbBranchName: string
  wbSchemeName: string | null
  matchState: ReconciliationState
  confidenceScore: number // 0 to 100
  sources: ExtractedSourceRecord[]
  totalDailyCapacityM3: number | null
  totalMonthlyCapacityM3: number | null
  reviewNotes: string
}

export interface SourceReconciliationExport {
  generatedAt: string
  workbookPath: string
  totalDbSchemes: number
  matchedSchemesCount: number
  ambiguousSchemesCount: number
  unmatchedSchemesCount: number
  totalSourcesExtracted: number
  records: SchemeSourceReconciliationRecord[]
}

const DEFAULT_WORKBOOK_PATH = "C:/Users/MJ/Downloads/global target (1).xlsx"

const numberOrNull = (val: unknown): number | null => {
  if (typeof val === "number" && Number.isFinite(val)) return val
  if (typeof val === "string") {
    const parsed = Number.parseFloat(val)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

/**
 * FORMULA VERIFICATION (Step 5):
 * L/s = litres / seconds
 * m3/hr = L/s * 3.6
 * m3/day = m3/hr * regimeHours
 */
export function calculateSourceCapacities(
  litres: number | null,
  seconds: number | null,
  installedM3Hr: number | null,
  regimeHours: number | null
): { flowLps: number | null; flowM3Hr: number | null; capacityM3Day: number | null } {
  let flowLps: number | null = null
  let flowM3Hr: number | null = null

  if (litres !== null && seconds !== null && seconds > 0) {
    flowLps = litres / seconds
    flowM3Hr = flowLps * 3.6
  } else if (installedM3Hr !== null && installedM3Hr > 0) {
    flowM3Hr = installedM3Hr
    flowLps = flowM3Hr / 3.6
  }

  let capacityM3Day: number | null = null
  if (flowM3Hr !== null && regimeHours !== null && regimeHours >= 0 && regimeHours <= 24) {
    capacityM3Day = flowM3Hr * regimeHours
  }

  return { flowLps, flowM3Hr, capacityM3Day }
}

/**
 * Parses all genuine source rows from cluster worksheets in global target (1).xlsx
 */
export function parseWorkbookSources(filePath = DEFAULT_WORKBOOK_PATH): ExtractedSourceRecord[] {
  let resolvedPath = filePath
  if (!fs.existsSync(resolvedPath)) {
    const altPath = path.join(process.cwd(), "global target (1).xlsx")
    if (fs.existsSync(altPath)) {
      resolvedPath = altPath
    } else {
      return []
    }
  }

  const wb = XLSX.readFile(resolvedPath)
  const clusterSheets = ["KIGEZI", "RUJUMBURA", "ISINGIRO", "ANKOLE"]
  const extractedSources: ExtractedSourceRecord[] = []

  for (const sheetName of clusterSheets) {
    const sheet = wb.Sheets[sheetName]
    if (!sheet) continue

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
    let currentArea = ""
    let currentScheme = ""

    for (let r = 2; r < rows.length; r++) {
      const row = rows[r]
      if (!row || row.length === 0) continue

      // Detect Area / Scheme Header
      const colB = String(row[1] || "").trim()
      const colC = String(row[2] || "").trim()

      if (colB && !colB.match(/^\d+/)) currentArea = colB
      if (colC && !colC.match(/^\d+/) && colC !== "Scheme Name") currentScheme = colC

      const sourceName = String(row[4] || row[3] || "").trim()
      const technology = String(row[5] || row[4] || "Gravity").trim()

      if (!sourceName || sourceName === "Source Name" || sourceName === "Total" || sourceName.toLowerCase().includes("average")) {
        continue
      }

      const regimeHours = numberOrNull(row[6]) ?? (technology.toLowerCase().includes("gravity") ? 24 : 12)
      const installedM3Hr = numberOrNull(row[7])
      const containerLitres = numberOrNull(row[8])
      const fillSeconds = numberOrNull(row[9])

      const { flowLps, flowM3Hr, capacityM3Day } = calculateSourceCapacities(
        containerLitres,
        fillSeconds,
        installedM3Hr,
        regimeHours
      )

      const schemeMonthlyCap = numberOrNull(row[13]) ?? numberOrNull(row[12])

      extractedSources.push({
        clusterName: sheetName,
        areaName: currentArea || sheetName,
        schemeName: currentScheme || "Unassigned",
        sourceName,
        technology,
        regimeHoursPerDay: regimeHours,
        installedCapacityM3Hr: installedM3Hr,
        containerVolumeLitres: containerLitres,
        fillTimeSeconds: fillSeconds,
        calculatedFlowLps: flowLps,
        calculatedFlowM3Hr: flowM3Hr,
        calculatedCapacityM3Day: capacityM3Day,
        schemeMonthlyCapacityM3: schemeMonthlyCap,
        workbookSheet: sheetName,
        cellCoordinates: `E${r + 1}`,
        formula: containerLitres && fillSeconds ? `=(${containerLitres}/${fillSeconds})*3.6*${regimeHours}` : null,
        notes: null,
      })
    }
  }

  return extractedSources
}
