import { TrustedPerformanceDataset } from "./types"
import { displayMeasurement } from "./display"

const productionValue = (d: TrustedPerformanceDataset) => d.production?.available === false ? "Unavailable: no verified observations" : d.kpis.waterProducedM3.toLocaleString()
const capacityValue = (d: TrustedPerformanceDataset) => d.production?.capacityComplete === false ? "Unavailable: unconfirmed configuration" : d.kpis.practicalCapacityM3Month.toLocaleString()
const utilizationValue = (d: TrustedPerformanceDataset) => d.production?.capacityComplete === false || d.production?.available === false || d.kpis.practicalCapacityM3Month <= 0 ? "Unavailable" : `${d.kpis.capacityUtilizationPercent}%`

export interface ManagementReportOutput {
  title: string
  subtitle: string
  periodName: string
  generatedAt: Date
  summaryNarrative: string
  sections: {
    heading: string
    content: string
    metricsTable?: { headers: string[]; rows: (string | number)[][] }
  }[]
  methodologyNotes: string[]
}

export function generateManagementReport(
  reportType: "monthly_management" | "production_capacity" | "nrw_loss" | "commercial_performance",
  dataset: TrustedPerformanceDataset
): ManagementReportOutput {
  const generatedAt = new Date()
  const periodName = dataset.period.periodName
  const sales = displayMeasurement(dataset.kpis.waterSoldM3, dataset.availability?.sales)
  const billed = displayMeasurement(dataset.kpis.currentBilledUgx, dataset.availability?.billing, "currency")
  const cash = displayMeasurement(dataset.kpis.totalCashCollectedUgx, dataset.availability?.collections, "currency")
  const collection = displayMeasurement(dataset.kpis.collectionEfficiencyPercent, dataset.availability?.collections, "percent")
  const debt = displayMeasurement(dataset.kpis.totalArrearsUgx, dataset.availability?.arrears, "currency")
  const productionMethod = dataset.basis === "historical_workbook" ? "Original workbook historical observations and fixed-month benchmarks. Reporting year, daily coverage and live approvals unresolved. Targets are planning figures, not verified actuals."
    : "Official production uses verified daily source records by production calendar month; legacy/unverified entries are excluded. Day coverage is not all-source completeness. Capacity is a confirmed current-configuration benchmark, not historical installed capacity. Historical baseline pinning remains unimplemented."

  if (reportType === "monthly_management") {
    return {
      title: "Monthly Management Performance Report",
      subtitle: `South Western Umbrella of Water and Sanitation — ${periodName}`,
      periodName,
      generatedAt,
      summaryNarrative: `During ${periodName}, recorded production was ${productionValue(dataset)} m³ against capacity ${capacityValue(dataset)} m³ (${utilizationValue(dataset)} utilisation). Water sales: ${sales} m³; production-to-sales indicator: ${dataset.kpis.displayLossIndicator}. Current billed demand: ${billed}; verified cash: ${cash}; collection efficiency: ${collection}. Outstanding demand including unpaid current bills: ${debt}.`,
      sections: [
        {
          heading: "1. Executive Summary & Key Indicators",
          content: `Performance during ${periodName} reflects available records in scope. ${dataset.dataQuality.coverageKnown === false ? "Daily/source completeness is unresolved; monthly workbook observations do not establish coverage." : `Recorded day coverage: ${dataset.dataQuality.completenessPercent}%; not all-source completeness.`}`,
          metricsTable: {
            headers: ["Metric", "Actual Value", "Validation Status"],
            rows: [
              ["Water Produced", `${productionValue(dataset)} m³`, dataset.production?.available === false ? "INCOMPLETE_DATA" : "VALID"],
              ["Capacity Utilisation", `${utilizationValue(dataset)}`, dataset.production?.available === false ? "INCOMPLETE_DATA" : dataset.production?.capacityComplete === false || dataset.kpis.practicalCapacityM3Month <= 0 ? "TARGET_UNAVAILABLE" : "VALID"],
              ["Water Sold (Billed)", `${sales} m³`, dataset.availability?.sales === false ? "INCOMPLETE_DATA" : "VALID"],
              ["Loss Indicator", dataset.kpis.displayLossIndicator, dataset.kpis.lossValidationStatus],
              ["Current Billed Demand", billed, dataset.availability?.billing === false ? "INCOMPLETE_DATA" : "VALID"],
              ["Cash Collected", cash, dataset.availability?.collections === false ? "UNRESOLVED" : "VALID"],
              ["Collection Efficiency", collection, dataset.availability?.collections === false ? "UNRESOLVED" : "VALID"],
              ["Outstanding Demand", debt, dataset.availability?.arrears === false ? "INCOMPLETE_DATA" : "VALID"],
            ],
          },
        },
        {
          heading: "2. Regional Scheme Performance Breakdown",
          content: "Performance matrix consolidating active scheme metrics within scope:",
          metricsTable: {
            headers: ["Scheme", "Produced (m³)", "Utilisation %", "Sold (m³)", "Loss %", "Billed (UGX)", "Collections (UGX)", "Coll %"],
            rows: dataset.schemesMatrix.map((s) => [
              s.schemeName,
              s.productionAvailable === false ? "Unavailable" : s.producedM3.toLocaleString(),
              s.capacityAvailable === false || s.productionAvailable === false || s.practicalCapacityM3 <= 0 ? "Unavailable" : `${s.utilizationPercent}%`,
              displayMeasurement(s.soldM3, s.availability?.sales),
              s.displayLoss,
              displayMeasurement(s.currentBilledUgx, s.availability?.billing, "currency"),
              displayMeasurement(s.cashCollectedUgx, s.availability?.collections, "currency"),
              displayMeasurement(s.collectionEfficiencyPercent, s.availability?.collections, "percent"),
            ]),
          },
        },
        ...(dataset.referenceTargets ? [{ heading: "3. Original MPS/TPS planning targets", content: "Original fixed-month formula chain. Unresolved inputs and external references remain unavailable; no live target approval or year inferred.", metricsTable: {
          headers: ["Area", "Scheme", "MPS production (m³)", "TPS production (m³)", "TPS supplied (m³)", "TPS sold (m³)", "Billing target (UGX)", "Demand incl. arrears (UGX)"],
          rows: dataset.referenceTargets.map(t => [t.areaName, t.schemeName, ...[t.result.inputs.mpsProduction, t.result.production, t.result.supplied, t.result.sold, t.result.billing, t.result.demand].map(m => m.value ?? `Unresolved: ${m.reason ?? m.state}`)])
        } }] : []),
      ],
      methodologyNotes: [productionMethod,
        "Capacity Utilisation % = Water Produced ÷ Practical Scheme Capacity × 100",
        "Production-to-Sales Loss Indicator % = (Water Produced - Billed Water Sold) ÷ Water Produced × 100",
        "Verified collection performance is unresolved without receipt/allocation reconciliation. Balance-derived estimates are not verified fresh cash.",
      ],
    }
  }

  // Complete existing report entry points using the same trusted dataset and formulas.
  const monthly = generateManagementReport("monthly_management", dataset)
  const production = reportType === "production_capacity"
  const loss = reportType === "nrw_loss"
  const title = production ? "Water Production & Capacity Report" : loss ? "Production-to-Sales Loss Report" : "Commercial Performance Report"
  const metrics = monthly.sections[0].metricsTable!
  const selectedMetrics = production ? ["Water Produced", "Capacity Utilisation"] : loss ? ["Water Produced", "Water Sold (Billed)", "Loss Indicator"] : ["Current Billed Demand", "Cash Collected", "Collection Efficiency", "Outstanding Demand"]
  const columns = production ? [0, 1, 2] : loss ? [0, 1, 3, 4] : [0, 5, 6, 7]
  const matrix = monthly.sections[1].metricsTable!
  return {
    title,
    subtitle: `SWUWS Portal — ${periodName}`,
    periodName,
    generatedAt,
    summaryNarrative: production ? `${dataset.basis === "historical_workbook" ? "Historical workbook production" : "Verified production"} for ${periodName}: ${productionValue(dataset)} m³. ${dataset.basis === "historical_workbook" ? "Original fixed-month capacity benchmark" : "Current confirmed capacity benchmark"}: ${capacityValue(dataset)} m³; utilisation: ${utilizationValue(dataset)}.`
      : loss ? `Production-to-sales loss indicator for ${periodName}: ${dataset.kpis.displayLossIndicator} (${dataset.kpis.lossValidationStatus}). This indicator is not a complete audited water balance.`
      : `Current billed demand for ${periodName}: ${billed}; verified cash: ${cash}.`,
    sections: [
      { heading: title, content: dataset.production?.label ?? "Source: Trusted Decision Support Dataset", metricsTable: { headers: metrics.headers, rows: metrics.rows.filter(row => selectedMetrics.includes(String(row[0]))) } },
      { heading: "Scheme breakdown", content: "Only schemes within the authorised reporting scope are included.", metricsTable: { headers: columns.map(i => matrix.headers[i]), rows: matrix.rows.map(row => columns.map(i => row[i])) } },
    ],
    methodologyNotes: monthly.methodologyNotes,
  }
}
