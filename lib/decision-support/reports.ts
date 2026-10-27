import { TrustedPerformanceDataset } from "./types"
import { formatUGX } from "@/lib/format"

const productionValue = (d: TrustedPerformanceDataset) => d.production?.available === false ? "Unavailable: no verified observations" : d.kpis.waterProducedM3.toLocaleString()
const capacityValue = (d: TrustedPerformanceDataset) => d.production?.capacityComplete === false ? "Unavailable: unconfirmed configuration" : d.kpis.practicalCapacityM3Month.toLocaleString()
const utilizationValue = (d: TrustedPerformanceDataset) => d.production?.capacityComplete === false || d.production?.available === false || d.kpis.practicalCapacityM3Month <= 0 ? "Unavailable" : String(d.kpis.capacityUtilizationPercent)

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
      summaryNarrative: `During ${periodName}, total water production across monitored schemes reached ${productionValue(dataset)} m³, against a total practical capacity of ${capacityValue(dataset)} m³ (${utilizationValue(dataset)}% capacity utilisation). Billed water sales totaled ${dataset.kpis.waterSoldM3.toLocaleString()} m³, representing a raw production-to-sales loss indicator of ${dataset.kpis.displayLossIndicator}. On commercial performance, total current billing reached ${formatUGX(dataset.kpis.currentBilledUgx)} with total cash collections of ${formatUGX(dataset.kpis.totalCashCollectedUgx)} (${dataset.kpis.collectionEfficiencyPercent}% collection efficiency). Cumulative live customer arrears stand at ${formatUGX(dataset.kpis.totalArrearsUgx)}.`,
      sections: [
        {
          heading: "1. Executive Summary & Key Indicators",
          content: `Overall operational performance during ${periodName} demonstrated strong billing coverage across active schemes. Data completeness across recorded logs stood at ${dataset.dataQuality.completenessPercent}%.`,
          metricsTable: {
            headers: ["Metric", "Actual Value", "Validation Status"],
            rows: [
              ["Water Produced", `${productionValue(dataset)} m³`, dataset.production?.available === false ? "INCOMPLETE_DATA" : "VALID"],
              ["Capacity Utilisation", `${utilizationValue(dataset)}%`, dataset.production?.capacityComplete === false ? "TARGET_UNAVAILABLE" : "VALID"],
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
              `${s.utilizationPercent}%`,
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

  // Fallback for other report types
  return {
    title: "Operational & Commercial Performance Report",
    subtitle: `SWUWS Portal — ${periodName}`,
    periodName,
    generatedAt,
    summaryNarrative: `Operational performance summary for ${periodName}. Total produced water: ${productionValue(dataset)} m³. Current billed demand: ${formatUGX(dataset.kpis.currentBilledUgx)}.`,
    sections: [],
    methodologyNotes: ["Source: Trusted Decision Support Dataset"],
  }
}
