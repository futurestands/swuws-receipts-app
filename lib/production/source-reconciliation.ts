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

export type CalculationBasis =
  | "bucket_test"
  | "installed_rating"
  | "measured_pumped"
  | "unresolved_missing_input"

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
  measuredGravityFlowM3Hr: number | null
  measuredPumpedDischargeM3Hr: number | null
  calculatedFlowLps: number | null
  calculatedFlowM3Hr: number | null
  sourceDailyCapacityM3Day: number | null
  schemeMonthlyCapacityM3Month: number | null
  calculationBasis: CalculationBasis
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
    const cleaned = val.trim().replace(/,/g, "")
    const parsed = Number.parseFloat(cleaned)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

const textOrNull = (val: unknown): string | null => {
  if (typeof val === "string" && val.trim().length > 0) return val.trim()
  return null
}

/**
 * STRICT FORMULA CALCULATOR & BASIS TAGGER (Step 2 & Step 3)
 * No invented regimes (24h/12h defaults) or technology assumptions.
 */
export function calculateSourceCapacities(
  litres: number | null,
  seconds: number | null,
  installedM3Hr: number | null,
  regimeHours: number | null,
  technologyStr: string | null
): {
  flowLps: number | null
  flowM3Hr: number | null
  capacityM3Day: number | null
  basis: CalculationBasis
  notes: string | null
} {
  let flowLps: number | null = null
  let flowM3Hr: number | null = null
  let basis: CalculationBasis = "unresolved_missing_input"
  let notes: string | null = null

  if (litres !== null && seconds !== null && seconds > 0) {
    flowLps = litres / seconds
    flowM3Hr = flowLps * 3.6
    basis = "bucket_test"
  } else if (installedM3Hr !== null && installedM3Hr > 0) {
    flowM3Hr = installedM3Hr
    flowLps = flowM3Hr / 3.6
    basis = "installed_rating"
  }

  let capacityM3Day: number | null = null
  if (flowM3Hr !== null && regimeHours !== null && regimeHours >= 0 && regimeHours <= 24) {
    capacityM3Day = flowM3Hr * regimeHours
  } else if (flowM3Hr !== null && regimeHours === null) {
    notes = "Regime hours per day unrecorded in workbook; daily assessment capacity unresolved"
  } else if (flowM3Hr === null) {
    notes = "Source flow measurement inputs missing or nonfinite"
  }

  if (!technologyStr) {
    notes = notes ? `${notes}; Technology unrecorded` : "Technology unrecorded in workbook"
  }

  return { flowLps, flowM3Hr, capacityM3Day, basis, notes }
}

/**
 * Explicit sheet-specific column index mappers (Step 1)
 */
interface SheetColumnMapping {
  startRow: number
  areaCol: number
  noCol: number
  schemeCol: number
  sourceCol: number
  techCol: number
  regimeCol: number
  containerCol: number
  installedCapCol: number
  secondsCol: number
  yieldLpsCol: number
  flowM3HrCol: number
  dailyCapCol: number
  monthlyCapCol: number
}

const SHEET_MAPPINGS: Record<string, SheetColumnMapping> = {
  KIGEZI: {
    startRow: 1, // Row 2 in 1-indexed Excel (includes Ryakarimira Nyamabare)
    areaCol: 1, // Col B
    noCol: 2, // Col C
    schemeCol: 3, // Col D
    sourceCol: 4, // Col E
    techCol: 5, // Col F
    regimeCol: 6, // Col G
    installedCapCol: 7, // Col H ('n/a' or number)
    containerCol: 8, // Col I (15 Litres)
    secondsCol: 9, // Col J (22.94 Seconds)
    yieldLpsCol: 10, // Col K
    flowM3HrCol: 11, // Col L
    dailyCapCol: 12, // Col M
    monthlyCapCol: 13, // Col N
  },
  ANKOLE: {
    startRow: 2, // Row 3 in 1-indexed Excel
    areaCol: 0, // Col A
    noCol: 1, // Col B
    schemeCol: 2, // Col C
    sourceCol: 3, // Col D
    techCol: 4, // Col E
    regimeCol: 5, // Col F
    containerCol: 6, // Col G
    installedCapCol: 7, // Col H
    secondsCol: 8, // Col I
    yieldLpsCol: 9, // Col J
    flowM3HrCol: 10, // Col K
    dailyCapCol: 11, // Col L
    monthlyCapCol: 12, // Col M
  },
  RUJUMBURA: {
    startRow: 2, // Row 3 in 1-indexed Excel
    areaCol: 0, // Col A
    noCol: 1, // Col B
    schemeCol: 2, // Col C
    sourceCol: 3, // Col D
    techCol: 4, // Col E
    regimeCol: 5, // Col F
    containerCol: 6, // Col G
    installedCapCol: 7, // Col H
    secondsCol: 8, // Col I
    yieldLpsCol: 9, // Col J
    flowM3HrCol: 10, // Col K
    dailyCapCol: 11, // Col L
    monthlyCapCol: 12, // Col M
  },
  ISINGIRO: {
    startRow: 1, // Row 2 in 1-indexed Excel
    areaCol: 0, // Col A
    noCol: 1, // Col B
    schemeCol: 2, // Col C
    sourceCol: 3, // Col D
    techCol: 4, // Col E
    regimeCol: 5, // Col F
    containerCol: 6, // Col G
    installedCapCol: 7, // Col H
    secondsCol: 8, // Col I
    yieldLpsCol: 9, // Col J
    flowM3HrCol: 10, // Col K
    dailyCapCol: 11, // Col L
    monthlyCapCol: 12, // Col M
  },
}

/**
 * Parses all genuine source rows from cluster worksheets in global target (1).xlsx
 * using explicit sheet column maps without default assumptions.
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
    const mapping = SHEET_MAPPINGS[sheetName]
    if (!sheet || !mapping) continue

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
    let currentArea = ""
    let currentScheme = ""

    for (let r = mapping.startRow; r < rows.length; r++) {
      const row = rows[r]
      if (!row || row.length === 0) continue

      // Detect Area Header
      const areaVal = textOrNull(row[mapping.areaCol])
      if (areaVal && !areaVal.match(/^\d+/) && areaVal.toUpperCase() !== "AREA") {
        currentArea = areaVal
      }

      // Detect Scheme Header
      const schemeVal = textOrNull(row[mapping.schemeCol])
      if (schemeVal && !schemeVal.match(/^\d+/) && schemeVal !== "Scheme Name") {
        currentScheme = schemeVal
      }

      const sourceName = textOrNull(row[mapping.sourceCol])
      if (!sourceName || sourceName === "Source Name" || sourceName === "Total" || sourceName.toLowerCase().includes("average") || sourceName.toLowerCase().includes("subtotal")) {
        continue
      }

      const techRaw = textOrNull(row[mapping.techCol])
      const technology = techRaw ?? "unknown"

      const regimeHours = numberOrNull(row[mapping.regimeCol])
      const installedM3Hr = numberOrNull(row[mapping.installedCapCol])
      const containerLitres = numberOrNull(row[mapping.containerCol])
      const fillSeconds = numberOrNull(row[mapping.secondsCol])

      const { flowLps, flowM3Hr, capacityM3Day, basis, notes } = calculateSourceCapacities(
        containerLitres,
        fillSeconds,
        installedM3Hr,
        regimeHours,
        techRaw
      )

      const schemeMonthlyCap = numberOrNull(row[mapping.monthlyCapCol])
      const isGravity = technology.toLowerCase().includes("gravity")
      const isPumped = technology.toLowerCase().includes("pump") || technology.toLowerCase().includes("grid") || technology.toLowerCase().includes("solar") || technology.toLowerCase().includes("generator")

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
        measuredGravityFlowM3Hr: isGravity ? flowM3Hr : null,
        measuredPumpedDischargeM3Hr: isPumped ? flowM3Hr : null,
        calculatedFlowLps: flowLps,
        calculatedFlowM3Hr: flowM3Hr,
        sourceDailyCapacityM3Day: capacityM3Day,
        schemeMonthlyCapacityM3Month: schemeMonthlyCap,
        calculationBasis: basis,
        workbookSheet: sheetName,
        cellCoordinates: `E${r + 1}`,
        formula: containerLitres && fillSeconds && regimeHours ? `=(${containerLitres}/${fillSeconds})*3.6*${regimeHours}` : installedM3Hr && regimeHours ? `=${installedM3Hr}*${regimeHours}` : null,
        notes,
      })
    }
  }

  return extractedSources
}
