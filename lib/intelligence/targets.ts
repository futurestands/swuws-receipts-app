import { StructuredFinding } from "./types"

export interface SchemeTargetEvaluationInput {
  schemeId: string
  schemeName: string
  branchId?: string | null
  clusterId?: string | null
  periodId?: string | null
  periodName?: string | null
  targetProductionM3?: number | null
  actualProductionM3: number
  targetCollectionEfficiencyPercent?: number | null
  actualCollectionEfficiencyPercent: number
  dataCompletenessPercent: number
}

export function evaluateTargetsVariance(input: SchemeTargetEvaluationInput): StructuredFinding[] {
  const findings: StructuredFinding[] = []

  // Production Target Shortfall (> 15% deficit)
  if (input.targetProductionM3 && input.targetProductionM3 > 0) {
    const variancePercent = Math.round(((input.actualProductionM3 - input.targetProductionM3) / input.targetProductionM3) * 1000) / 10
    if (variancePercent <= -15) {
      findings.push({
        id: `tgt-prodshortfall-${input.schemeId}`,
        schemeId: input.schemeId,
        schemeName: input.schemeName,
        branchId: input.branchId,
        clusterId: input.clusterId,
        category: "target",
        severity: "watch",
        title: `Production Target Shortfall (${Math.abs(variancePercent)}% Deficit)`,
        description: `Actual production (${input.actualProductionM3.toLocaleString()} m³) missed the period target (${input.targetProductionM3.toLocaleString()} m³) by ${Math.abs(variancePercent)}%.`,
        observation: "Production is lagging behind management target projections.",
        evidence: {
          metric: "production_vs_target_m3",
          actual: input.actualProductionM3,
          expected: input.targetProductionM3,
          variance: input.actualProductionM3 - input.targetProductionM3,
          unit: "m³",
          period: input.periodName || undefined,
          dataCompletenessPercent: input.dataCompletenessPercent,
        },
        recommendation: "Review whether target gap is due to lower consumer demand or operational pump downtime.",
        confidence: "HIGH",
        reportingPeriod: input.periodName || undefined,
        detectedAt: new Date(),
        status: "OPEN",
      })
    }
  }

  // Collection Target Shortfall
  if (input.targetCollectionEfficiencyPercent && input.targetCollectionEfficiencyPercent > 0) {
    const gap = input.targetCollectionEfficiencyPercent - input.actualCollectionEfficiencyPercent
    if (gap >= 15) {
      findings.push({
        id: `tgt-collectionshortfall-${input.schemeId}`,
        schemeId: input.schemeId,
        schemeName: input.schemeName,
        branchId: input.branchId,
        clusterId: input.clusterId,
        category: "target",
        severity: "watch",
        title: `Collection Efficiency Shortfall (${input.actualCollectionEfficiencyPercent}% vs ${input.targetCollectionEfficiencyPercent}% Target)`,
        description: `Collection efficiency (${input.actualCollectionEfficiencyPercent}%) is ${gap.toFixed(1)} percentage points below target (${input.targetCollectionEfficiencyPercent}%).`,
        observation: "Cash collection speed is behind target benchmarks.",
        evidence: {
          metric: "collection_efficiency_vs_target_percent",
          actual: input.actualCollectionEfficiencyPercent,
          expected: input.targetCollectionEfficiencyPercent,
          variance: -gap,
          unit: "%",
          period: input.periodName || undefined,
        },
        recommendation: "Increase collection field enforcement and send bulk SMS reminders.",
        confidence: "HIGH",
        reportingPeriod: input.periodName || undefined,
        detectedAt: new Date(),
        status: "OPEN",
      })
    }
  }

  return findings
}
