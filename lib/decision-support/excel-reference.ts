import XLSX from "xlsx"
import fs from "fs"
import path from "path"

export interface ExcelReferenceSchemeRecord {
  areaName: string
  schemeNumber: number | string
  schemeName: string
  capacityCurrentM3Day: number
  practicalCapacityM3Month: number

  // Production Data
  julyProducedM3: number
  augustProducedM3: number
  septemberProducedM3: number
  totalProducedM3: number

  // Sales Data (Billed Consumption Benchmark)
  julySoldM3: number
  augustSoldM3: number
  septemberSoldM3: number
  totalSoldM3: number

  // Target Benchmarks from TARGETS GOLBAL
  targetUtilizationPercent?: number | null
  targetNrwPercent?: number | null
  targetCollectionEfficiencyPercent?: number | null
  tariffUgx?: number | null
  arrearsUgx?: number | null

  // Metadata
  isReferenceSample: true
  dataSource: "SWUWS Excel Reference Dataset (global target.xlsx)"
}

export interface ExcelReferenceDataset {
  fileFound: boolean
  filePath: string
  totalAreas: number
  totalSchemes: number
  areas: string[]
  periods: { id: string; periodName: string; daysInMonth: number }[]
  schemes: ExcelReferenceSchemeRecord[]
}

const DEFAULT_FILE_PATH = "C:\\Users\\MJ\\Downloads\\global target.xlsx"

export function parseExcelReferenceDataset(filePath = DEFAULT_FILE_PATH): ExcelReferenceDataset {
  let resolvedPath = filePath
  if (!fs.existsSync(resolvedPath)) {
    // Fallback relative lookup
    const altPath = path.join(process.cwd(), "global target.xlsx")
    if (fs.existsSync(altPath)) {
      resolvedPath = altPath
    } else {
      return {
        fileFound: false,
        filePath: resolvedPath,
        totalAreas: 0,
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

  const summeryRows = XLSX.utils.sheet_to_json<any[]>(summerySheet, { header: 1 })
  const targetRows = targetSheet ? XLSX.utils.sheet_to_json<any[]>(targetSheet, { header: 1 }) : []

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
  let currentArea = "KABALE"

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
      const targetData = targetMap.get(colScheme.toLowerCase()) || {}

      schemes.push({
        areaName: currentArea,
        schemeNumber: colNum || schemes.length + 1,
        schemeName: colScheme,
        capacityCurrentM3Day: Number(row[3] || 0),
        practicalCapacityM3Month: Number(row[4] || 0),
        julyProducedM3: Number(row[5] || 0),
        augustProducedM3: Number(row[6] || 0),
        septemberProducedM3: Number(row[7] || 0),
        totalProducedM3: Number(row[8] || 0),
        julySoldM3: Number(row[11] || 0),
        augustSoldM3: Number(row[12] || 0),
        septemberSoldM3: Number(row[13] || 0),
        totalSoldM3: Number(row[14] || 0),
        targetUtilizationPercent: targetData.targetUtil,
        targetNrwPercent: targetData.targetNrw,
        targetCollectionEfficiencyPercent: targetData.targetColl,
        tariffUgx: targetData.tariff,
        arrearsUgx: targetData.arrears,
        isReferenceSample: true,
        dataSource: "SWUWS Excel Reference Dataset (global target.xlsx)",
      })
    }
  }

  return {
    fileFound: true,
    filePath: resolvedPath,
    totalAreas: areaSet.size,
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
