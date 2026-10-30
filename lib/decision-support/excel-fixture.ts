import { parseExcelReferenceDataset, type ExcelReferenceDataset } from "./excel-reference"
import type { TrustedPerformanceDataset, SchemePerformanceMatrixItem } from "./types"
import { validateWaterBalanceAndCapacity } from "./data-validation"
import { classifyUtilisation } from "./mps-tps"

let cachedDataset: ExcelReferenceDataset | null = null
export function getExcelReferenceDataset(): ExcelReferenceDataset {
  return cachedDataset ??= parseExcelReferenceDataset()
}
/** Read-only historical benchmark adapter. No observations, cash, years or coverage are invented. */
export function getExcelReferencePerformanceDataset(periodId: "july" | "august" | "september" = "august"): TrustedPerformanceDataset {
  const ref = getExcelReferenceDataset()
  const month = periodId === "july" ? 7 : periodId === "august" ? 8 : 9
  const days = month === 9 ? 30 : 31
  const schemes = ref.schemes.filter(s => s.isOperationalScheme)
  const financial = { billing: false, collections: false, arrears: false }
  let produced = 0, sold = 0, capacity = 0
  const schemesMatrix: SchemePerformanceMatrixItem[] = schemes.map(s => {
    const p = month === 7 ? s.julyProducedM3 : month === 8 ? s.augustProducedM3 : s.septemberProducedM3
    const sales = month === 7 ? s.julySoldM3 : month === 8 ? s.augustSoldM3 : s.septemberSoldM3
    const cap = s.practicalCapacityM3Month
    produced += p ?? 0; sold += sales ?? 0; capacity += cap ?? 0
    const v = validateWaterBalanceAndCapacity({ waterProducedM3: p ?? 0, waterBilledSoldM3: sales ?? 0, loggedDaysCount: 0, daysInPeriod: days, practicalCapacityM3Period: cap ?? 0, salesAvailable: sales !== null })
    return { schemeId: `excel-sch-${s.schemeNumber}`, schemeName: s.schemeName, branchId: s.areaName,
      producedM3: p ?? 0, productionAvailable: p !== null, capacityAvailable: cap !== null, practicalCapacityM3: cap ?? 0,
      utilizationPercent: v.capacityUtilizationPercent, soldM3: sales ?? 0, rawLossPercent: v.rawCalculatedLossIndicator,
      displayLoss: p === null || sales === null ? "Unresolved: missing historical observation" : v.displayLossIndicator,
      currentBilledUgx: 0, cashCollectedUgx: 0, collectionEfficiencyPercent: 0, totalArrearsUgx: 0,
      availability: { ...financial, sales: sales !== null },
      statusLabel: classifyUtilisation(p !== null && cap !== null && cap > 0 ? p / cap * 100 : null).label,
      dataQualityStatus: "INCOMPLETE_DATA" }
  })
  const productionAvailable = schemesMatrix.length > 0 && schemesMatrix.every(s => s.productionAvailable)
  const salesAvailable = schemesMatrix.length > 0 && schemesMatrix.every(s => s.availability?.sales)
  const capacityAvailable = schemesMatrix.length > 0 && schemesMatrix.every(s => s.capacityAvailable)
  const validation = validateWaterBalanceAndCapacity({ waterProducedM3: produced, waterBilledSoldM3: sold, loggedDaysCount: 0, daysInPeriod: days * Math.max(1, schemes.length), practicalCapacityM3Period: capacity, salesAvailable })
  const issues = ["Original workbook benchmarks: assessment dates, reporting year and live approvals unresolved", "Monthly historical observations do not establish daily or all-source completeness", "Actual supply, billing, cash collections and verified arrears unavailable; external caches remain provenance only", ...validation.dataQualityIssues]
  return {
    basis: "historical_workbook", availability: { ...financial, sales: salesAvailable }, collectionBasis: "unavailable",
    period: { id: periodId, periodName: `${periodId[0].toUpperCase()}${periodId.slice(1)} (year unresolved)`, year: null, month },
    scope: { level: "organization", name: "Original SWUWS workbook benchmark scope" },
    production: { available: productionAvailable, suppliedComplete: false, capacityComplete: capacityAvailable, provisionalProducedM3: 0, legacyCount: 0, label: "Historical workbook observations; original fixed-month benchmarks; year and daily coverage unresolved" },
    referenceTargets: schemes.filter(s => s.targetModel).map(s => ({ schemeName: s.schemeName, areaName: s.areaName, result: s.targetModel! })),
    kpis: { waterProducedM3: produced, waterSuppliedM3: 0, waterSoldM3: sold, unbilledLossM3: validation.unbilledLossM3,
      rawCalculatedLossIndicator: validation.rawCalculatedLossIndicator, displayLossIndicator: productionAvailable && salesAvailable ? validation.displayLossIndicator : "Unresolved: incomplete historical observations",
      lossValidationStatus: "INCOMPLETE_DATA", practicalCapacityM3Month: capacity, capacityUtilizationPercent: validation.capacityUtilizationPercent,
      currentBilledUgx: 0, totalCashCollectedUgx: 0, cashToArrearsUgx: 0, cashToCurrentUgx: 0, totalArrearsUgx: 0, collectionEfficiencyPercent: 0, arrearsRecoveryPercent: 0 },
    dataQuality: { coverageKnown: false, completenessPercent: 0, flagsCount: issues.length, issues }, schemesMatrix, periodDeltas: [],
    traceability: [{ metricName: "Historical workbook production", period: periodId, scopeName: "Original workbook", sourceRecordsSummary: `Observed subtotal from ${schemes.length} scheme rows; workbook ${ref.workbookSha256 ?? "unavailable"}`,
      formulaDescription: "Sum available historical cells only; not a verified live production total", rawResult: produced, validationStatus: "INCOMPLETE_DATA", displayedResult: productionAvailable ? `${produced} m³ (historical)` : "Unresolved: historical production inputs missing" }],
  }
}
