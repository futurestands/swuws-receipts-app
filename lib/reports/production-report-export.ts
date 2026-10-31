import type { MonthlyProductionReportOutput } from "./production-executive-report"

export interface MonthlyProductionExcelSheets {
  executiveSummary: Array<Record<string, string | number>>
  schemePerformance: Array<Record<string, string | number>>
  crossMonthAllocations: Array<Record<string, string | number>>
}

/**
 * Pure tabular serializer for Monthly Water Production & Energy Performance.
 * Keeps measured actuals, provisional records, missing data, unavailable NRW,
 * unreconciled fuel purchases, and cross-month ESTIMATED_ALLOCATION shares strictly separate.
 */
export function buildMonthlyProductionExcelSheets(
  report: MonthlyProductionReportOutput,
): MonthlyProductionExcelSheets {
  const executiveSummary: Array<Record<string, string | number>> = [
    { Metric: "Reporting Month", Value: report.reportingMonth, Basis: "Calendar month (Africa/Kampala)" },
    { Metric: "Organisational Scope", Value: report.scope, Basis: "Authorised IAM intersection" },
    { Metric: "Billing Period Match", Value: report.billingPeriodMatch, Basis: report.billingPeriodId ?? "No single matched billing period" },
    { Metric: "Schemes in Scope", Value: report.totals.totalSchemes, Basis: `Complete: ${report.totals.completeSchemesCount}; Partial: ${report.totals.partialSchemesCount}; Unavailable: ${report.totals.unavailableSchemesCount}` },
    { Metric: "Overall Source-Day Completeness", Value: `${report.totals.overallCompletenessPercent}%`, Basis: "Verified measured source-days / required active source-days" },
    { Metric: "Verified Measured Water Produced (m3)", Value: report.totals.totalVerifiedProducedM3, Basis: "MEASURED (verified daily + whole-month intervals; excludes conflicts & estimates)" },
    { Metric: "Billed Customer Metered Volume (m3)", Value: report.totals.totalBilledConsumptionM3 ?? "UNAVAILABLE", Basis: "Verified customer meter readings linked to billing records (never inferred from bill UGX)" },
    { Metric: "Overall Non-Revenue Water (NRW %)", Value: report.totals.overallNrwStatus === "AVAILABLE" && report.totals.overallNrwPercent !== null ? `${report.totals.overallNrwPercent}%` : "UNAVAILABLE", Basis: report.nrwMethodology.basis },
    { Metric: "NRW Engineering Caveat", Value: report.nrwMethodology.caveat, Basis: "Apparent NRW gating rule" },
    { Metric: "Verified Measured Grid Electricity (kWh)", Value: report.totals.totalMeasuredElectricityKwh, Basis: "MEASURED within month (once per meter asset)" },
    { Metric: "Verified Stock-Reconciled Generator Fuel (Litres)", Value: report.totals.totalMeasuredFuelLitres, Basis: "MEASURED stock reconciliation (purchases alone excluded)" },
    { Metric: "Verified Measured Energy OpEx (UGX)", Value: report.totals.totalMeasuredEnergyCostUgx, Basis: "MEASURED within-month electricity + reconciled fuel expenditure" },
    { Metric: "Purchase-Only Fuel Logs (Consumption Unknown)", Value: report.totals.totalUnreconciledFuelLogsCount, Basis: `Unreconciled spend: UGX ${report.totals.totalUnreconciledFuelExpenditureUgx}` },
    { Metric: "Provisional Unverified Records", Value: report.totals.totalProvisionalRecordsCount, Basis: "PROVISIONAL (excluded from official measured totals)" },
    { Metric: "Cross-Month Estimated Water Share (m3)", Value: report.totals.estimatedAllocation.producedM3, Basis: "ESTIMATED_ALLOCATION (separate from measured actuals)" },
    { Metric: "Cross-Month Estimated Electricity Share (kWh)", Value: report.totals.estimatedAllocation.electricityKwh, Basis: `ESTIMATED_ALLOCATION (Est. cost UGX ${report.totals.estimatedAllocation.electricityCostUgx})` },
    { Metric: "Cross-Month Estimated Fuel Share (Litres)", Value: report.totals.estimatedAllocation.fuelLitres, Basis: `ESTIMATED_ALLOCATION (Est. spend UGX ${report.totals.estimatedAllocation.fuelExpenditureUgx})` },
  ]

  const schemePerformance: Array<Record<string, string | number>> = report.items.map((item) => ({
    "Cluster": item.clusterName,
    "Area (Branch)": item.branchName,
    "Scheme": item.schemeName,
    "Completeness Status": item.dataQualityStatus,
    "Required Source-Days": item.requiredSourceDays,
    "Verified Source-Days": item.verifiedSourceDays,
    "Missing Source-Days": item.missingSourceDays,
    "Completeness %": `${item.completenessPercent}%`,
    "Verified Measured Prod (m3)": item.dataQualityStatus === "UNAVAILABLE" ? "UNAVAILABLE" : item.verifiedProducedM3,
    "Daily Verified (m3)": item.dailyVerifiedProducedM3,
    "Interval Measured (m3)": item.intervalMeasuredProducedM3,
    "Conflicted Intervals Excluded": item.intervalConflictCount,
    "Excluded Conflict Volume (m3)": item.excludedConflictedIntervalM3,
    "System Input / Supplied (m3)": item.verifiedSuppliedM3 !== null ? item.verifiedSuppliedM3 : "UNAVAILABLE",
    "Provisional Daily Logs": item.provisionalDailyCount,
    "Provisional Daily (m3)": item.provisionalProducedM3,
    "Provisional Intervals": item.provisionalIntervalCount,
    "Provisional Interval Total (m3)": item.provisionalIntervalTotalM3,
    "Avg Daily Prod (m3/day)": item.averageDailyProducedM3 !== null ? Number(item.averageDailyProducedM3.toFixed(2)) : "UNAVAILABLE",
    "Monthly Capacity Benchmark (m3)": item.monthlyCapacityM3 !== null ? item.monthlyCapacityM3 : "UNAVAILABLE",
    "Capacity Utilisation %": item.capacityUtilizationPercent !== null ? `${item.capacityUtilizationPercent}%` : "UNAVAILABLE",
    "Billed Metered Consumption (m3)": item.billedConsumptionM3 !== null ? item.billedConsumptionM3 : "UNAVAILABLE",
    "NRW Status": item.nrwStatus,
    "NRW %": item.nrwStatus === "AVAILABLE" && item.nrwPercent !== null ? `${item.nrwPercent}%` : "UNAVAILABLE",
    "NRW Unavailable Reasons": item.nrwUnavailableReasons.join("; ") || "—",
    "Measured Grid Electricity (kWh)": item.energy.electricityCoverageComplete || item.energy.totalKwh > 0 ? item.energy.totalKwh : "UNAVAILABLE",
    "Provisional Electricity Logs": item.energy.provisionalElectricityCount,
    "Specific Power (kWh/m3)": item.energy.kwhPerM3 !== null ? item.energy.kwhPerM3 : "UNAVAILABLE",
    "Measured Reconciled Fuel (Litres)": item.energy.fuelCoverageComplete || item.energy.totalFuelLitres > 0 ? item.energy.totalFuelLitres : "UNAVAILABLE",
    "Purchase-Only Fuel Logs (Unknown Cons.)": item.energy.fuelUnavailableCount,
    "Purchase-Only Fuel Spend (UGX)": item.energy.fuelUnreconciledExpenditureUgx,
    "Provisional Fuel Logs": item.energy.provisionalFuelCount,
    "Specific Fuel (L/m3)": item.energy.fuelPerM3 !== null ? item.energy.fuelPerM3 : "UNAVAILABLE",
    "Measured Energy OpEx (UGX)": item.energy.electricityCoverageComplete || item.energy.fuelCoverageComplete || item.energy.totalEnergyCostUgx > 0 ? item.energy.totalEnergyCostUgx : "UNAVAILABLE",
    "Cross-Month Est. Water (m3)": item.estimatedAllocation.producedM3,
    "Cross-Month Est. Electricity (kWh)": item.estimatedAllocation.electricityKwh,
    "Cross-Month Est. Fuel (Litres)": item.estimatedAllocation.fuelLitres,
    "Allocation Basis": item.estimatedAllocation.present
      ? `ESTIMATED_ALLOCATION (${item.estimatedAllocation.methods.join(", ")})`
      : "MEASURED_ONLY",
  }))

  const crossMonthAllocations: Array<Record<string, string | number>> = report.items.flatMap((item) =>
    item.estimatedAllocation.records.map((rec) => ({
      "Cluster": item.clusterName,
      "Area (Branch)": item.branchName,
      "Scheme": item.schemeName,
      "Record Kind": rec.kind,
      "Record ID": rec.recordId,
      "Source / Asset ID": rec.subjectId,
      "Basis": rec.basis,
      "Unit": rec.unit,
      "Genuine Measured Interval Total": rec.measuredTotal,
      "Estimated Month Share": rec.allocatedToMonth,
      "Fraction": `${rec.fraction.numerator}/${rec.fraction.denominator}`,
      "Method": rec.method,
      "Max Absolute Error (±)": rec.maxAbsoluteError,
      "Uncertainty": rec.uncertainty,
    })),
  )

  return {
    executiveSummary,
    schemePerformance,
    crossMonthAllocations,
  }
}
