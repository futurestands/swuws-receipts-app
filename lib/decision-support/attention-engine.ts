import { TrustedPerformanceDataset } from "./types"
import { StructuredFinding } from "@/lib/intelligence/types"

export function generateManagementAttentionItems(
  dataset: TrustedPerformanceDataset
): StructuredFinding[] {
  const findings: StructuredFinding[] = []

  // 1. Data Quality / Inconsistency Flags
  if (dataset.kpis.lossValidationStatus === "DATA_INCONSISTENCY") {
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
    if (sch.rawLossPercent > 40 && sch.producedM3 > 0) {
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

    // 3. Stressed Scheme Capacity (>95%)
    if (sch.utilizationPercent > 95) {
      findings.push({
        id: `att-capacity-${sch.schemeId}`,
        schemeId: sch.schemeId,
        schemeName: sch.schemeName,
        branchId: sch.branchId,
        category: "capacity",
        severity: "high",
        title: `Scheme Operating at Stressed Capacity at ${sch.schemeName} (${sch.utilizationPercent}%)`,
        description: `Production (${sch.producedM3.toLocaleString()} m³) is near practical monthly capacity (${sch.practicalCapacityM3.toLocaleString()} m³).`,
        observation: "System is operating with minimal buffer for breakdown or peak demand.",
        evidence: {
          metric: "capacity_utilization_percent",
          actual: sch.utilizationPercent,
          unit: "%",
          period: dataset.period.periodName,
        },
        recommendation: "Review source pumping hours and evaluate infrastructure augmentation.",
        confidence: "HIGH",
        reportingPeriod: dataset.period.periodName,
        detectedAt: new Date(),
        status: "OPEN",
      })
    }
  }

  return findings
}
