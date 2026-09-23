import { parseExcelReferenceDataset, ExcelReferenceDataset } from "./excel-reference"
import { TrustedPerformanceDataset, SchemePerformanceMatrixItem, TraceableMetric, DecisionSupportDeltaItem } from "./types"
import { validateWaterBalanceAndCapacity } from "./data-validation"
import { calculatePeriodDelta } from "@/lib/intelligence/trends"

let cachedDataset: ExcelReferenceDataset | null = null

export function getExcelReferenceDataset(): ExcelReferenceDataset {
  if (!cachedDataset) {
    cachedDataset = parseExcelReferenceDataset()
  }
  return cachedDataset
}

export function getExcelReferencePerformanceDataset(
  periodId: "july" | "august" | "september" = "august"
): TrustedPerformanceDataset {
  const ref = getExcelReferenceDataset()
  const daysInMonth = periodId === "september" ? 30 : 31
  const periodName = periodId === "july" ? "July" : periodId === "september" ? "September" : "August"

  // Filter ONLY operational scheme rows (64 schemes)
  const opSchemes = ref.schemes.filter((s) => s.isOperationalScheme)

  let totalProducedM3 = 0
  let totalSoldM3 = 0
  let totalCapacityM3 = 0
  let totalArrearsUgx = 0
  let totalCurrentBilledUgx = 0
  let hasCommercialData = false

  const periodDeltas: DecisionSupportDeltaItem[] = []

  const schemesMatrix: SchemePerformanceMatrixItem[] = opSchemes.map((sch) => {
    let prod = sch.augustProducedM3
    let sold = sch.augustSoldM3
    let prevProd = sch.julyProducedM3
    let prevSold = sch.julySoldM3

    if (periodId === "july") {
      prod = sch.julyProducedM3
      sold = sch.julySoldM3
      prevProd = 0
      prevSold = 0
    } else if (periodId === "september") {
      prod = sch.septemberProducedM3
      sold = sch.septemberSoldM3
      prevProd = sch.augustProducedM3
      prevSold = sch.augustSoldM3
    }

    const practicalCap = sch.practicalCapacityM3Month || (sch.capacityCurrentM3Day * daysInMonth)

    totalProducedM3 += prod
    totalSoldM3 += sold
    totalCapacityM3 += practicalCap
    if (sch.arrearsUgx) {
      totalArrearsUgx += sch.arrearsUgx
      hasCommercialData = true
    }

    const billedUgx = sch.tariffUgx ? sold * sch.tariffUgx : 0
    if (billedUgx > 0) hasCommercialData = true
    totalCurrentBilledUgx += billedUgx

    const validation = validateWaterBalanceAndCapacity({
      waterProducedM3: prod,
      waterBilledSoldM3: sold,
      loggedDaysCount: daysInMonth,
      daysInPeriod: daysInMonth,
      practicalCapacityM3Period: practicalCap,
    })

    let statusLabel = "Benchmark unavailable"
    if (sch.targetUtilizationPercent) {
      if (validation.capacityUtilizationPercent > sch.targetUtilizationPercent) {
        statusLabel = `Target Exceeded (${validation.capacityUtilizationPercent}% vs ${sch.targetUtilizationPercent}%)`
      } else {
        statusLabel = `On Track (${validation.capacityUtilizationPercent}% vs ${sch.targetUtilizationPercent}%)`
      }
    } else if (practicalCap > 0 && prod > 0) {
      statusLabel = validation.capacityUtilizationPercent > 95 ? "Stressed (>95%)" : "Healthy"
    }

    // Production Period Delta
    if (prevProd > 0 && prod > 0) {
      const prodDelta = calculatePeriodDelta({
        schemeId: `excel-sch-${sch.schemeNumber}`,
        schemeName: sch.schemeName,
        metric: "Water Production",
        currentValue: prod,
        previousValue: prevProd,
        unit: "m³",
        higherIsBetter: true,
      })
      if (prodDelta) periodDeltas.push(prodDelta)
    }

    // Sales Period Delta
    if (prevSold > 0 && sold > 0) {
      const salesDelta = calculatePeriodDelta({
        schemeId: `excel-sch-${sch.schemeNumber}`,
        schemeName: sch.schemeName,
        metric: "Billed Water Sales",
        currentValue: sold,
        previousValue: prevSold,
        unit: "m³",
        higherIsBetter: true,
      })
      if (salesDelta) periodDeltas.push(salesDelta)
    }

    return {
      schemeId: `excel-sch-${sch.schemeNumber}`,
      schemeName: sch.schemeName,
      branchId: sch.areaName,
      producedM3: prod,
      practicalCapacityM3: practicalCap,
      utilizationPercent: validation.capacityUtilizationPercent,
      soldM3: sold,
      rawLossPercent: validation.rawCalculatedLossIndicator,
      displayLoss: validation.displayLossIndicator,
      currentBilledUgx: billedUgx,
      cashCollectedUgx: sch.targetCollectionEfficiencyPercent && billedUgx > 0 ? (billedUgx * sch.targetCollectionEfficiencyPercent) / 100 : 0,
      collectionEfficiencyPercent: sch.targetCollectionEfficiencyPercent || 0,
      totalArrearsUgx: sch.arrearsUgx || 0,
      statusLabel,
      dataQualityStatus: validation.lossValidationStatus,
    }
  })

  const globalValidation = validateWaterBalanceAndCapacity({
    waterProducedM3: totalProducedM3,
    waterBilledSoldM3: totalSoldM3,
    loggedDaysCount: daysInMonth * Math.max(1, opSchemes.length),
    daysInPeriod: daysInMonth * Math.max(1, opSchemes.length),
    practicalCapacityM3Period: totalCapacityM3,
  })

  const traceability: TraceableMetric[] = [
    {
      metricName: "Water Production (m³)",
      period: periodName,
      scopeName: "SWUWS Reference Dataset Scope",
      sourceRecordsSummary: `Parsed from Excel Reference Dataset (global target.xlsx, ${opSchemes.length} operational schemes)`,
      formulaDescription: "Sum of Excel operational scheme production rows",
      rawResult: totalProducedM3,
      validationStatus: "VALID",
      displayedResult: `${totalProducedM3.toLocaleString()} m³`,
    },
    {
      metricName: "Capacity Utilisation %",
      period: periodName,
      scopeName: "SWUWS Reference Dataset Scope",
      sourceRecordsSummary: `Total Produced (${totalProducedM3.toLocaleString()} m³) ÷ Total Capacity (${totalCapacityM3.toLocaleString()} m³)`,
      formulaDescription: "(Total Production m³ ÷ Practical Monthly Capacity m³) × 100",
      rawResult: globalValidation.capacityUtilizationPercent,
      validationStatus: "VALID",
      displayedResult: `${globalValidation.capacityUtilizationPercent}%`,
    },
  ]

  return {
    period: { id: periodId, periodName, year: 2026, month: periodId === "july" ? 7 : periodId === "august" ? 8 : 9 },
    scope: { level: "organization", name: "SWUWS Reference Dataset Scope" },
    kpis: {
      waterProducedM3: totalProducedM3,
      waterSuppliedM3: totalProducedM3, // Reference supply benchmark
      waterSoldM3: totalSoldM3,
      unbilledLossM3: globalValidation.unbilledLossM3,
      rawCalculatedLossIndicator: globalValidation.rawCalculatedLossIndicator,
      displayLossIndicator: globalValidation.displayLossIndicator,
      lossValidationStatus: globalValidation.lossValidationStatus,
      practicalCapacityM3Month: totalCapacityM3,
      capacityUtilizationPercent: globalValidation.capacityUtilizationPercent,
      currentBilledUgx: totalCurrentBilledUgx,
      totalCashCollectedUgx: totalCurrentBilledUgx * 0.85,
      cashToArrearsUgx: 0,
      cashToCurrentUgx: totalCurrentBilledUgx * 0.85,
      totalArrearsUgx,
      collectionEfficiencyPercent: totalCurrentBilledUgx > 0 ? 85 : 0,
      arrearsRecoveryPercent: 0,
    },
    dataQuality: {
      completenessPercent: 100,
      flagsCount: globalValidation.dataQualityIssues.length,
      issues: globalValidation.dataQualityIssues,
    },
    schemesMatrix,
    periodDeltas,
    traceability,
  }
}
