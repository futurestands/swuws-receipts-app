import { TrustedPerformanceDataset } from "./types"
import { formatUGX } from "@/lib/format"

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
  const productionMethod = "Official production uses verified daily source records by production calendar month; legacy/unverified entries are excluded. Day coverage is not all-source completeness. Capacity is a confirmed current-configuration benchmark, not historical installed capacity."

  if (reportType === "monthly_management") {
    return {
      title: "Monthly Management Performance Report",
      subtitle: `South Western Umbrella of Water and Sanitation — ${periodName}`,
      periodName,
      generatedAt,
      summaryNarrative: `During ${periodName}, total water production across monitored schemes reached ${productionValue(dataset)} m³, against a total practical capacity of ${capacityValue(dataset)} m³ (${utilizationValue(dataset)} capacity utilisation). Billed water sales totaled ${dataset.kpis.waterSoldM3.toLocaleString()} m³, representing a raw production-to-sales loss indicator of ${dataset.kpis.displayLossIndicator}. On commercial performance, total current billing reached ${formatUGX(dataset.kpis.currentBilledUgx)} with total cash collections of ${formatUGX(dataset.kpis.totalCashCollectedUgx)} (${dataset.kpis.collectionEfficiencyPercent}% collection efficiency). Cumulative live customer arrears stand at ${formatUGX(dataset.kpis.totalArrearsUgx)}.`,
      sections: [
        {
          heading: "1. Executive Summary & Key Indicators",
          content: `Operational performance during ${periodName} reflects the available records across schemes in scope. Data completeness across recorded logs stood at ${dataset.dataQuality.completenessPercent}%.`,
          metricsTable: {
            headers: ["Metric", "Actual Value", "Validation Status"],
            rows: [
              ["Water Produced", `${productionValue(dataset)} m³`, dataset.production?.available === false ? "INCOMPLETE_DATA" : "VALID"],
              ["Capacity Utilisation", `${utilizationValue(dataset)}`, dataset.production?.available === false ? "INCOMPLETE_DATA" : dataset.production?.capacityComplete === false || dataset.kpis.practicalCapacityM3Month <= 0 ? "TARGET_UNAVAILABLE" : "VALID"],
              ["Water Sold (Billed)", `${dataset.kpis.waterSoldM3.toLocaleString()} m³`, "VALID"],
              ["Loss Indicator", dataset.kpis.displayLossIndicator, dataset.kpis.lossValidationStatus],
              ["Current Billed Demand", formatUGX(dataset.kpis.currentBilledUgx), "VALID"],
              ["Cash Collected", formatUGX(dataset.kpis.totalCashCollectedUgx), "VALID"],
              ["Collection Efficiency", `${dataset.kpis.collectionEfficiencyPercent}%`, "VALID"],
              ["Total Live Arrears", formatUGX(dataset.kpis.totalArrearsUgx), "VALID"],
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
              s.soldM3.toLocaleString(),
              s.displayLoss,
              formatUGX(s.currentBilledUgx),
              formatUGX(s.cashCollectedUgx),
              `${s.collectionEfficiencyPercent}%`,
            ]),
          },
        },
      ],
      methodologyNotes: [productionMethod,
        "Capacity Utilisation % = Water Produced ÷ Practical Scheme Capacity × 100",
        "Production-to-Sales Loss Indicator % = (Water Produced - Billed Water Sold) ÷ Water Produced × 100",
        "Collection Efficiency % = Total Fresh Cash Collected (Arrears + Current) ÷ Current Billed Demand × 100",
      ],
    }
  }

  // Complete existing report entry points using the same trusted dataset and formulas.
  const monthly = generateManagementReport("monthly_management", dataset)
  const production = reportType === "production_capacity"
  const loss = reportType === "nrw_loss"
  const title = production ? "Water Production & Capacity Report" : loss ? "Production-to-Sales Loss Report" : "Commercial Performance Report"
  const metrics = monthly.sections[0].metricsTable!
  const selectedMetrics = production ? ["Water Produced", "Capacity Utilisation"] : loss ? ["Water Produced", "Water Sold (Billed)", "Loss Indicator"] : ["Current Billed Demand", "Cash Collected", "Collection Efficiency", "Total Live Arrears"]
  const columns = production ? [0, 1, 2] : loss ? [0, 1, 3, 4] : [0, 5, 6, 7]
  const matrix = monthly.sections[1].metricsTable!
  return {
    title,
    subtitle: `SWUWS Portal — ${periodName}`,
    periodName,
    generatedAt,
    summaryNarrative: production ? `Verified production for ${periodName}: ${productionValue(dataset)} m³. Current confirmed capacity benchmark: ${capacityValue(dataset)} m³; utilisation: ${utilizationValue(dataset)}.`
      : loss ? `Production-to-sales loss indicator for ${periodName}: ${dataset.kpis.displayLossIndicator} (${dataset.kpis.lossValidationStatus}). This indicator is not a complete audited water balance.`
      : `Current billed demand for ${periodName}: ${formatUGX(dataset.kpis.currentBilledUgx)}; cash collected: ${formatUGX(dataset.kpis.totalCashCollectedUgx)}.`,
    sections: [
      { heading: title, content: dataset.production?.label ?? "Source: Trusted Decision Support Dataset", metricsTable: { headers: metrics.headers, rows: metrics.rows.filter(row => selectedMetrics.includes(String(row[0]))) } },
      { heading: "Scheme breakdown", content: "Only schemes within the authorised reporting scope are included.", metricsTable: { headers: columns.map(i => matrix.headers[i]), rows: matrix.rows.map(row => columns.map(i => row[i])) } },
    ],
    methodologyNotes: monthly.methodologyNotes,
  }
}
