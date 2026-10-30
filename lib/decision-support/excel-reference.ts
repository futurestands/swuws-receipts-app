import * as XLSX from "xlsx"
import fs from "fs"
import path from "path"
import { createHash } from "node:crypto"
import { calculateMpsTps, inputMetric, type EngineeringMetric, type MpsTpsResult } from "./mps-tps"

export interface ExcelReferenceSchemeRecord {
  areaName: string
  schemeNumber: number | string
  schemeName: string
  isOperationalScheme: boolean
  capacityCurrentM3Day: number | null
  practicalCapacityM3Month: number | null

  // Production Data
  julyProducedM3: number | null
  augustProducedM3: number | null
  septemberProducedM3: number | null
  totalProducedM3: number | null

  // Sales Data (Billed Consumption Benchmark)
  julySoldM3: number | null
  augustSoldM3: number | null
  septemberSoldM3: number | null
  totalSoldM3: number | null

  // Target Benchmarks from TARGETS GOLBAL
  targetUtilizationPercent?: number | null
  targetNrwPercent?: number | null
  targetCollectionEfficiencyPercent?: number | null
  tariffUgx?: number | null
  arrearsUgx?: number | null

  // Metadata
  targetModel?: MpsTpsResult
  cachedArrearsUgx?: number | null
  isReferenceSample: false
  dataSource: "Original SWUWS engineering workbook; undated benchmarks"
}

export interface ExcelReferenceDataset {
  fileFound: boolean
  filePath: string
  workbookSha256?: string
  legendRowCount: number
  totalAreas: number
  operationalSchemeCount: number
  referenceSourceRowCount: number
  totalSchemes: number
  areas: string[]
  periods: { id: string; periodName: string; daysInMonth: number }[]
  schemes: ExcelReferenceSchemeRecord[]
}

const DEFAULT_FILE_PATH = "C:/Users/MJ/Downloads/global target (1).xlsx"

const numberOrNull = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null

/** Saved Excel errors and external-link caches must not become usable measurements. */
export function workbookMetric(sheet: XLSX.WorkSheet, address: string, unit: string): EngineeringMetric {
  const cell = sheet[address]
  const source = `TARGETS GOLBAL!${address}`
  if (cell?.t === "e") return { ...inputMetric(null, unit, source), state: "SOURCE_ERROR", reason: cell.w ?? "Saved Excel error", savedValue: cell.w ?? null }
  if (cell?.f?.includes("[")) return { ...inputMetric(null, unit, source), state: "UNRESOLVED_EXTERNAL", reason: "External workbook lookup has not been verified", savedValue: numberOrNull(cell.v) }
  return inputMetric(numberOrNull(cell?.v), unit, source)
}

export function parseExcelReferenceDataset(filePath = process.env.SWUWS_ENGINEERING_WORKBOOK ?? DEFAULT_FILE_PATH): ExcelReferenceDataset {
  let resolvedPath = filePath
  if (!fs.existsSync(resolvedPath)) {
    const altPath = path.join(/* turbopackIgnore: true */ process.cwd(), "global target (1).xlsx")
    if (fs.existsSync(altPath)) {
      resolvedPath = altPath
    } else {
      return {
        fileFound: false,
        filePath: resolvedPath,
        legendRowCount: 0,
        totalAreas: 0,
        operationalSchemeCount: 0,
        referenceSourceRowCount: 0,
        totalSchemes: 0,
        areas: [],
        periods: [
          { id: "july", periodName: "July", daysInMonth: 31 },
          { id: "august", periodName: "August", daysInMonth: 31 },
          { id: "september", periodName: "September", daysInMonth: 30 },
        ],
        schemes: [],
      }
    }
  }

  const wb = XLSX.readFile(resolvedPath)
  const summerySheet = wb.Sheets["GLOBAL SUMMERY"]
  const targetSheet = wb.Sheets["TARGETS GOLBAL"]

  const summeryRows = XLSX.utils.sheet_to_json<unknown[]>(summerySheet, { header: 1 })
  const targetRows = targetSheet ? XLSX.utils.sheet_to_json<unknown[]>(targetSheet, { header: 1 }) : []

  // Build Targets Lookup Map by Scheme Name
  const targetMap = new Map<string, { targetUtil?: number; targetNrw?: number; targetColl?: number; tariff?: number; arrears?: number }>()
  for (let r = 4; r < targetRows.length; r++) {
    const row = targetRows[r]
    if (!row || !row[2]) continue
    const schName = String(row[2]).trim()
    if (schName && schName !== "Scheme" && schName !== "Total") {
      targetMap.set(schName.toLowerCase(), {
        targetUtil: row[6] ? Number(row[6]) * 100 : undefined,
        targetNrw: row[8] ? Number(row[8]) * 100 : undefined,
        targetColl: row[18] ? Number(row[18]) * 100 : undefined,
        tariff: row[19] ? Number(row[19]) : undefined,
        arrears: row[16] ? Number(row[16]) : undefined,
      })
    }
  }

  const schemes: ExcelReferenceSchemeRecord[] = []
  const areaSet = new Set<string>()
  let currentArea = ""
  let operationalSchemeCount = 0
  let referenceSourceRowCount = 0
  let legendRowCount = 0

  for (let r = 2; r < summeryRows.length; r++) {
    const row = summeryRows[r]
    if (!row) continue

    const colArea = row[0] ? String(row[0]).trim() : ""
    const colNum = row[1]
    const colScheme = row[2] ? String(row[2]).trim() : ""

    if (colArea && colArea !== "Total sold" && colArea !== "No." && colArea !== "Total") {
      currentArea = colArea
      areaSet.add(currentArea)
    }

    if (colScheme && colScheme !== "Scheme" && colScheme !== "Total" && colScheme !== "N/A") {
      const isOp = typeof colNum === "number" || (typeof colNum === "string" && !isNaN(Number(colNum)) && Number(colNum) > 0)
      if (isOp) {
        operationalSchemeCount++
      } else {
        legendRowCount++
        continue // Utilisation interpretation rows are not schemes or source assessments.
      }

      const targetData = targetMap.get(colScheme.toLowerCase()) || {}
      const targetRow = targetRows.findIndex((t) => t && String(t[2] ?? "").trim().toLowerCase() === colScheme.toLowerCase()) + 1
      let targetModel: MpsTpsResult | undefined
      if (targetSheet && targetRow > 0) {
        const m = (col: string, unit: string) => workbookMetric(targetSheet, `${col}${targetRow}`, unit)
        targetModel = calculateMpsTps({ monthlyCapacity: m("F", "m3/benchmark-month"), mpsUtilisation: m("G", "fraction"), tpsUtilisation: m("H", "fraction"), mpsNrw: m("I", "fraction"), tpsNrw: m("J", "fraction"), mpsProduction: m("K", "m3/month-label"), mpsSales: m("O", "m3/month-label"), tariff: m("U", "UGX/m3"), arrears: m("R", "UGX"), collectionEfficiency: m("T", "fraction") }, targetRow)
        for (const [key, col] of [["production", "L"], ["supplied", "M"], ["sold", "P"], ["billing", "Q"], ["demand", "S"]] as const) targetModel[key].savedValue = numberOrNull(targetSheet[`${col}${targetRow}`]?.v)
      }

      schemes.push({
        areaName: currentArea,
        schemeNumber: (typeof colNum === "number" || typeof colNum === "string") && colNum ? colNum : schemes.length + 1,
        schemeName: colScheme,
        isOperationalScheme: isOp,
        capacityCurrentM3Day: numberOrNull(row[3]),
        practicalCapacityM3Month: numberOrNull(row[4]),
        julyProducedM3: numberOrNull(row[5]),
        augustProducedM3: numberOrNull(row[6]),
        septemberProducedM3: numberOrNull(row[7]), // Row[7] = Sept Produced
        totalProducedM3: numberOrNull(row[8]),     // Row[8] = Total Produced
        julySoldM3: numberOrNull(row[11]),
        augustSoldM3: numberOrNull(row[12]),
        septemberSoldM3: numberOrNull(row[13]),    // Row[13] = Sept Sold
        totalSoldM3: numberOrNull(row[14]),       // Row[14] = Total Sold
        targetUtilizationPercent: targetModel?.inputs.tpsUtilisation.value == null ? null : targetModel.inputs.tpsUtilisation.value * 100,
        targetNrwPercent: targetModel?.inputs.tpsNrw.value == null ? null : targetModel.inputs.tpsNrw.value * 100,
        targetCollectionEfficiencyPercent: targetModel?.inputs.collectionEfficiency.value == null ? null : targetModel.inputs.collectionEfficiency.value * 100,
        tariffUgx: targetModel?.inputs.tariff.value,
        arrearsUgx: targetModel?.inputs.arrears.value,
        cachedArrearsUgx: targetData.arrears ?? null,
        targetModel,
        isReferenceSample: false,
        dataSource: "Original SWUWS engineering workbook; undated benchmarks",
      })
    }
  }

  for (const name of ["KIGEZI", "RUJUMBURA", "ISINGIRO", "ANKOLE"]) {
    const sheet = wb.Sheets[name]
    if (!sheet?.["!ref"]) continue
    for (let row = 1; row <= XLSX.utils.decode_range(sheet["!ref"]).e.r + 1; row++) if (typeof sheet[`F${row}`]?.v === "string" && sheet[`F${row}`].v !== "Technology") referenceSourceRowCount++
  }
  return {
    fileFound: true,
    filePath: resolvedPath,
    workbookSha256: createHash("sha256").update(fs.readFileSync(resolvedPath)).digest("hex"),
    legendRowCount,
    totalAreas: areaSet.size,
    operationalSchemeCount,
    referenceSourceRowCount,
    totalSchemes: schemes.length,
    areas: Array.from(areaSet),
    periods: [
      { id: "july", periodName: "July", daysInMonth: 31 },
      { id: "august", periodName: "August", daysInMonth: 31 },
      { id: "september", periodName: "September", daysInMonth: 30 },
    ],
    schemes,
  }
}
