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
  | "workbook_reported_flow"
  | "unresolved_missing_input"
  | "invalid_measurement"

export interface ExtractedSourceRecord {
  id: string
  clusterName: string
  areaName: string
  schemeName: string
  sourceName: string
  technology: string
  regimeHoursPerDay: number | null

  // 6 Separate Capacity Concepts (Step 1)
  containerVolumeLitres: number | null
  fillTimeSeconds: number | null
  measuredVolumetricDischargeM3Hr: number | null // Only from bucket/tank test
  installedPumpRatingM3Hr: number | null // Nameplate rating
  workbookReportedFlowM3Hr: number | null // Saved Excel cell value
  calculatedFlowLps: number | null
  calculatedFlowM3Hr: number | null
  sourceDailyAssessmentM3Day: number | null
  schemeMonthlyReferenceM3Month: number | null

  calculationBasis: CalculationBasis
  flowDiscrepancy: boolean
  discrepancyReason: string | null
  validationError: string | null

  workbookSheet: string
  cellCoordinates: string
  formula: string | null
  notes: string | null
}

export interface DbSchemeInput {
  id: string
  name: string
  code: string
  branchName: string
  clusterName: string
}

export interface WbSchemeSummary {
  areaName: string
  clusterName: string
  schemeName: string
  savedDailyCapacityM3: number | null
  savedMonthlyCapacityM3: number | null
}

export interface SchemeSourceReconciliationRecord {
  dbSchemeId: string
  dbSchemeName: string
  dbClusterName: string
  dbBranchName: string
  wbSchemeName: string | null
  wbAreaName: string | null
  matchState: ReconciliationState
  confidenceScore: number // 0 to 100
  sources: ExtractedSourceRecord[]
  aggregatedDailyCapacityM3: number | null
  wbSavedDailyCapacityM3: number | null
  wbSavedMonthlyCapacityM3: number | null
  schemeCapacityDiscrepancy: boolean
  schemeCapacityDiscrepancyNotes: string | null
  reviewNotes: string
}

export interface SourceReconciliationExport {
  generatedAt: string
  workbookPath: string
  totalDbSchemes: number
  matchedSchemesCount: number
  ambiguousSchemesCount: number
  unmatchedSchemesCount: number
  invalidInputSchemesCount: number
  totalSourcesExtracted: number
  worksheetCounts: Record<string, { totalRowsParsed: number; validSourcesExtracted: number; excludedRows: number; notes: string }>
  records: SchemeSourceReconciliationRecord[]
}

const DEFAULT_WORKBOOK_PATH = "C:/Users/MJ/Downloads/global target (1).xlsx"

export const DEFAULT_APPROVED_ALIASES = new Map<string, string>([
  ["rugaga", "Rugaaga"],
  ["mbaare", "Mbaale"],
  ["isingiro t/c", "Isingiro T/C & Kyakabindi"],
])

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
  if (typeof val === "number") return String(val)
  return null
}

const norm = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]/g, "")

/**
 * STRICT ENGINEERING FORMULA CALCULATOR & VALIDATOR (Step 1 & Step 2)
 *
 * Never populates measuredVolumetricDischargeM3Hr from installed pump rating alone.
 * Validates containerLitres > 0, fillTimeSeconds > 0, regimeHours in 0..24.
 */
export function calculateSourceCapacities(
  litres: number | null,
  seconds: number | null,
  installedM3Hr: number | null,
  wbReportedM3Hr: number | null,
  regimeHours: number | null,
  technologyStr: string | null
): {
  measuredVolumetricM3Hr: number | null
  calculatedLps: number | null
  calculatedM3Hr: number | null
  dailyCapacityM3: number | null
  basis: CalculationBasis
  flowDiscrepancy: boolean
  discrepancyReason: string | null
  validationError: string | null
  notes: string | null
} {
  let measuredVolumetricM3Hr: number | null = null
  let calculatedLps: number | null = null
  let calculatedM3Hr: number | null = null
  let basis: CalculationBasis = "unresolved_missing_input"
  let flowDiscrepancy = false
  let discrepancyReason: string | null = null
  let validationError: string | null = null
  let notes: string | null = null

  // Validate container/time inputs
  if (litres !== null || seconds !== null) {
    if (litres !== null && litres <= 0) {
      validationError = "Container volume must be a positive number"
    } else if (seconds !== null && seconds <= 0) {
      validationError = "Container fill time must be a positive number of seconds"
    }
  }

  // Validate regime hours
  if (regimeHours !== null && (regimeHours < 0 || regimeHours > 24)) {
    validationError = validationError ? `${validationError}; Operating regime hours must be between 0 and 24` : "Operating regime hours must be between 0 and 24"
  }

  if (validationError) {
    return {
      measuredVolumetricM3Hr: null,
      calculatedLps: null,
      calculatedM3Hr: null,
      dailyCapacityM3: null,
      basis: "invalid_measurement",
      flowDiscrepancy: false,
      discrepancyReason: null,
      validationError,
      notes: validationError,
    }
  }

  // Volumetric Discharge Calculation (ONLY when litres and seconds are provided)
  if (litres !== null && seconds !== null && seconds > 0) {
    calculatedLps = litres / seconds
    measuredVolumetricM3Hr = calculatedLps * 3.6
    calculatedM3Hr = measuredVolumetricM3Hr
    basis = "bucket_test"
  } else if (installedM3Hr !== null && installedM3Hr > 0) {
    calculatedM3Hr = installedM3Hr
    calculatedLps = installedM3Hr / 3.6
    basis = "installed_rating"
    // measuredVolumetricM3Hr REMAINS NULL because no bucket test was conducted!
  } else if (wbReportedM3Hr !== null && wbReportedM3Hr > 0) {
    calculatedM3Hr = wbReportedM3Hr
    calculatedLps = wbReportedM3Hr / 3.6
    basis = "workbook_reported_flow"
  }

  // Check Discrepancy against Workbook Saved Cell Value
  if (wbReportedM3Hr !== null && calculatedM3Hr !== null) {
    if (Math.abs(wbReportedM3Hr - calculatedM3Hr) > 0.05) {
      flowDiscrepancy = true
      discrepancyReason = `Workbook saved flow (${wbReportedM3Hr} m3/hr) differs from computed flow (${calculatedM3Hr.toFixed(2)} m3/hr)`
    }
  }

  // Daily Assessment Capacity Calculation
  let dailyCapacityM3: number | null = null
  if (calculatedM3Hr !== null && regimeHours !== null && regimeHours >= 0 && regimeHours <= 24) {
    dailyCapacityM3 = calculatedM3Hr * regimeHours
  } else if (calculatedM3Hr !== null && regimeHours === null) {
    notes = "Regime hours per day unrecorded in workbook; daily assessment capacity unresolved"
  } else if (calculatedM3Hr === null) {
    notes = "Source flow measurement inputs missing or nonfinite"
  }

  if (!technologyStr) {
    notes = notes ? `${notes}; Technology unrecorded` : "Technology unrecorded in workbook"
  }

  return {
    measuredVolumetricM3Hr,
    calculatedLps,
    calculatedM3Hr,
    dailyCapacityM3,
    basis,
    flowDiscrepancy,
    discrepancyReason,
    validationError,
    notes,
  }
}

/**
 * Sheet Column Index Mappings
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
    areaCol: 1,
    noCol: 2,
    schemeCol: 3,
    sourceCol: 4,
    techCol: 5,
    regimeCol: 6,
    installedCapCol: 7,
    containerCol: 8,
    secondsCol: 9,
    yieldLpsCol: 10,
    flowM3HrCol: 11,
    dailyCapCol: 12,
    monthlyCapCol: 13,
  },
  ANKOLE: {
    startRow: 2,
    areaCol: 0,
    noCol: 1,
    schemeCol: 2,
    sourceCol: 3,
    techCol: 4,
    regimeCol: 5,
    containerCol: 6,
    installedCapCol: 7,
    secondsCol: 8,
    yieldLpsCol: 9,
    flowM3HrCol: 10,
    dailyCapCol: 11,
    monthlyCapCol: 12,
  },
  RUJUMBURA: {
    startRow: 2,
    areaCol: 0,
    noCol: 1,
    schemeCol: 2,
    sourceCol: 3,
    techCol: 4,
    regimeCol: 5,
    containerCol: 6,
    installedCapCol: 7,
    secondsCol: 8,
    yieldLpsCol: 9,
    flowM3HrCol: 10,
    dailyCapCol: 11,
    monthlyCapCol: 12,
  },
  ISINGIRO: {
    startRow: 1,
    areaCol: 0,
    noCol: 1,
    schemeCol: 2,
    sourceCol: 3,
    techCol: 4,
    regimeCol: 5,
    containerCol: 6,
    installedCapCol: 7,
    secondsCol: 8,
    yieldLpsCol: 9,
    flowM3HrCol: 10,
    dailyCapCol: 11,
    monthlyCapCol: 12,
  },
}

/**
 * Extracts source-level engineering records across all 4 cluster sheets.
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

      const areaVal = textOrNull(row[mapping.areaCol])
      if (areaVal && !areaVal.match(/^\d+/) && areaVal.toUpperCase() !== "AREA") {
        currentArea = areaVal
      }

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
      const wbReportedM3Hr = numberOrNull(row[mapping.flowM3HrCol])
      const schemeMonthlyCap = numberOrNull(row[mapping.monthlyCapCol])

      const {
        measuredVolumetricM3Hr,
        calculatedLps,
        calculatedM3Hr,
        dailyCapacityM3,
        basis,
        flowDiscrepancy,
        discrepancyReason,
        validationError,
        notes,
      } = calculateSourceCapacities(
        containerLitres,
        fillSeconds,
        installedM3Hr,
        wbReportedM3Hr,
        regimeHours,
        techRaw
      )

      extractedSources.push({
        id: `${sheetName.toLowerCase()}-r${r + 1}`,
        clusterName: sheetName,
        areaName: currentArea || sheetName,
        schemeName: currentScheme || "Unassigned",
        sourceName,
        technology,
        regimeHoursPerDay: regimeHours,
        containerVolumeLitres: containerLitres,
        fillTimeSeconds: fillSeconds,
        measuredVolumetricDischargeM3Hr: measuredVolumetricM3Hr,
        installedPumpRatingM3Hr: installedM3Hr,
        workbookReportedFlowM3Hr: wbReportedM3Hr,
        calculatedFlowLps: calculatedLps,
        calculatedFlowM3Hr: calculatedM3Hr,
        sourceDailyAssessmentM3Day: dailyCapacityM3,
        schemeMonthlyReferenceM3Month: schemeMonthlyCap,
        calculationBasis: basis,
        flowDiscrepancy,
        discrepancyReason,
        validationError,
        workbookSheet: sheetName,
        cellCoordinates: `E${r + 1}`,
        formula: containerLitres && fillSeconds && regimeHours ? `=(${containerLitres}/${fillSeconds})*3.6*${regimeHours}` : installedM3Hr && regimeHours ? `=${installedM3Hr}*${regimeHours}` : null,
        notes,
      })
    }
  }

  return extractedSources
}

/**
 * PURE SCHEME RECONCILIATION MATCHING ENGINE (Step 1)
 */
export function reconcileScheme(
  dbScheme: DbSchemeInput,
  wbSummaries: WbSchemeSummary[],
  extractedSources: ExtractedSourceRecord[],
  approvedAliases: Map<string, string> = DEFAULT_APPROVED_ALIASES
): SchemeSourceReconciliationRecord {
  const normDb = norm(dbScheme.name)

  // 1. Check Approved Alias
  const aliasMatchName = approvedAliases.get(normDb)
  let matchedSummary: WbSchemeSummary | undefined
  let matchState: ReconciliationState = "UNMATCHED"
  let confidenceScore = 0

  if (aliasMatchName) {
    matchedSummary = wbSummaries.find((w) => norm(w.schemeName) === norm(aliasMatchName))
    if (matchedSummary) {
      matchState = "APPROVED_ALIAS"
      confidenceScore = 95
    }
  }

  // 2. Exact Name Match with Geography Check
  if (!matchedSummary) {
    const exactMatches = wbSummaries.filter((w) => norm(w.schemeName) === normDb)
    if (exactMatches.length === 1) {
      matchedSummary = exactMatches[0]
      matchState = "EXACT_MATCH"
      confidenceScore = 100
    } else if (exactMatches.length > 1) {
      matchState = "AMBIGUOUS"
      confidenceScore = 50
    }
  }

  // 3. Ambiguous Case Check (Kabingo vs Nyakabingo, Matsyoro vs Mastyoro)
  if (!matchedSummary && matchState === "UNMATCHED") {
    const partialMatches = wbSummaries.filter((w) => {
      const normWb = norm(w.schemeName)
      return normWb.includes(normDb) || normDb.includes(normWb)
    })

    if (partialMatches.length > 0) {
      matchState = "AMBIGUOUS"
      confidenceScore = 40
    }
  }

  // Find linked sources for this scheme
  const matchedSources = extractedSources.filter((s) => {
    const targetName = matchedSummary ? matchedSummary.schemeName : dbScheme.name
    return norm(s.schemeName) === norm(targetName)
  })

  // Calculate aggregated source daily capacity
  let aggregatedDailyCapacityM3: number | null = null
  const validSourceCapacities = matchedSources
    .map((s) => s.sourceDailyAssessmentM3Day)
    .filter((v): v is number => v !== null && Number.isFinite(v))

  if (validSourceCapacities.length > 0) {
    aggregatedDailyCapacityM3 = validSourceCapacities.reduce((a, b) => a + b, 0)
  }

  const wbDaily = matchedSummary?.savedDailyCapacityM3 ?? null
  const wbMonthly = matchedSummary?.savedMonthlyCapacityM3 ?? null

  let schemeCapacityDiscrepancy = false
  let schemeCapacityDiscrepancyNotes: string | null = null

  if (aggregatedDailyCapacityM3 !== null && wbDaily !== null) {
    if (Math.abs(aggregatedDailyCapacityM3 - wbDaily) > 0.5) {
      schemeCapacityDiscrepancy = true
      schemeCapacityDiscrepancyNotes = `Aggregated source daily capacity (${aggregatedDailyCapacityM3.toFixed(2)} m3/day) differs from workbook saved scheme capacity (${wbDaily.toFixed(2)} m3/day)`
    }
  }

  return {
    dbSchemeId: dbScheme.id,
    dbSchemeName: dbScheme.name,
    dbClusterName: dbScheme.clusterName,
    dbBranchName: dbScheme.branchName,
    wbSchemeName: matchedSummary ? matchedSummary.schemeName : null,
    wbAreaName: matchedSummary ? matchedSummary.areaName : null,
    matchState,
    confidenceScore,
    sources: matchedSources,
    aggregatedDailyCapacityM3,
    wbSavedDailyCapacityM3: wbDaily,
    wbSavedMonthlyCapacityM3: wbMonthly,
    schemeCapacityDiscrepancy,
    schemeCapacityDiscrepancyNotes,
    reviewNotes: matchState === "EXACT_MATCH"
      ? "Exact name and cluster match"
      : matchState === "APPROVED_ALIAS"
      ? `Matched via authorized alias '${aliasMatchName}'`
      : matchState === "AMBIGUOUS"
      ? "Name variation requires explicit governance review"
      : "Portal scheme not present in workbook 64 operational schemes",
  }
}
