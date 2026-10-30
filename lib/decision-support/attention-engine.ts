import { TrustedPerformanceDataset } from "./types"
import { StructuredFinding } from "@/lib/intelligence/types"
import { classifyUtilisation } from "./mps-tps"

export function generateManagementAttentionItems(
  dataset: TrustedPerformanceDataset
): StructuredFinding[] {
  const findings: StructuredFinding[] = []

  // 1. Data Quality / Inconsistency Flags
  if (dataset.production?.available === true && dataset.availability?.sales === true && dataset.kpis.lossValidationStatus === "DATA_INCONSISTENCY") {
    findings.push({
      id: `att-loss-inconsistent-global`,
      category: "data_quality",
      severity: "high",
      title: "Data Inconsistency: Billed Consumption Exceeds Recorded Production",
      description: `Billed customer water sales (${dataset.kpis.waterSoldM3.toLocaleString()} m³) exceed recorded production (${dataset.kpis.waterProducedM3.toLocaleString()} m³) for the reporting period.`,
      observation: "Calculated raw loss indicator is negative (" + dataset.kpis.rawCalculatedLossIndicator + "%). Requires verification.",
      evidence: {
        metric: "loss_indicator_percent",
        actual: dataset.kpis.rawCalculatedLossIndicator,
        unit: "%",
        period: dataset.period.periodName,
        dataCompletenessPercent: dataset.dataQuality.completenessPercent,
      },
      recommendation: "Verify scheme bulk meter logs and check for cross-period meter reading imports.",
      confidence: "HIGH",
      reportingPeriod: dataset.period.periodName,
      detectedAt: new Date(),
      status: "OPEN",
    })
  }

  // 2. High Loss Indicator across Schemes
  for (const sch of dataset.schemesMatrix) {
    if (sch.rawLossPercent > 40 && sch.producedM3 > 0 && sch.productionAvailable === true && sch.availability?.sales === true && sch.dataQualityStatus === "VALID") {
      findings.push({
        id: `att-highloss-${sch.schemeId}`,
        schemeId: sch.schemeId,
        schemeName: sch.schemeName,
        branchId: sch.branchId,
        category: "nrw",
        severity: "critical",
        title: `Elevated Water Loss Indicator at ${sch.schemeName} (${sch.displayLoss})`,
        description: `Unbilled water loss stands at ${sch.displayLoss} (${(sch.producedM3 - sch.soldM3).toLocaleString()} m³ unbilled out of ${sch.producedM3.toLocaleString()} m³ produced).`,
        observation: "High loss level requires physical leak inspection and bulk meter verification.",
        evidence: {
          metric: "loss_indicator_percent",
          actual: sch.rawLossPercent,
          unit: "%",
          period: dataset.period.periodName,
        },
        recommendation: "Conduct zonal leak detection audit and verify customer meter accuracy.",
        confidence: "HIGH",
        reportingPeriod: dataset.period.periodName,
        detectedAt: new Date(),
        status: "OPEN",
      })
    }

    // Capacity uses its own recorded-day coverage, independently of sales/NRW quality.
    const band = classifyUtilisation(sch.practicalCapacityM3 > 0 ? sch.producedM3 / sch.practicalCapacityM3 * 100 : null).band
    const coverage = sch.productionDayCoveragePercent
    if (sch.productionAvailable === true && sch.capacityAvailable === true && typeof coverage === "number" && Number.isFinite(coverage) && coverage >= 50 && (band === "stressed" || band === "critical")) {
      findings.push({
        id: `att-capacity-${sch.schemeId}`,
        schemeId: sch.schemeId,
        schemeName: sch.schemeName,
        branchId: sch.branchId,
        category: "capacity",
        severity: band === "critical" ? "critical" : "high",
        title: `${band === "critical" ? "Critical" : "Stressed"} Capacity at ${sch.schemeName} (${sch.utilizationPercent}%)`,
        description: `Production (${sch.producedM3.toLocaleString()} m³) is near practical monthly capacity (${sch.practicalCapacityM3.toLocaleString()} m³).`,
        observation: "System is operating with minimal buffer for breakdown or peak demand.",
        evidence: {
          metric: "capacity_utilization_percent",
          actual: sch.utilizationPercent,
          unit: "%",
          period: dataset.period.periodName,
          dataCompletenessPercent: coverage,
        },
        recommendation: "Review source pumping hours and evaluate infrastructure augmentation.",
        confidence: coverage >= 90 ? "HIGH" : "MEDIUM",
        reportingPeriod: dataset.period.periodName,
        detectedAt: new Date(),
        status: "OPEN",
      })
    }
  }

  return findings
}
