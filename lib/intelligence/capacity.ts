import { StructuredFinding } from "./types"

export interface SchemeCapacityInput {
  schemeId: string
  schemeName: string
  branchId?: string | null
  clusterId?: string | null
  periodId?: string | null
  periodName?: string | null
  practicalCapacityM3Month: number
  actualProductionM3Month: number
  dataCompletenessPercent: number
}

export function evaluateCapacityUtilization(input: SchemeCapacityInput): StructuredFinding[] {
  const findings: StructuredFinding[] = []

  if (input.practicalCapacityM3Month <= 0) return findings

  // Rule: Must have sufficient data before declaring operational conclusions
  if (input.dataCompletenessPercent < 50) return findings

  const utilizationPercent = Math.round((input.actualProductionM3Month / input.practicalCapacityM3Month) * 1000) / 10

  // 1. Over-utilized / Stressed System (> 95%)
  if (utilizationPercent > 95) {
    findings.push({
      id: `cap-stressed-${input.schemeId}`,
      schemeId: input.schemeId,
      schemeName: input.schemeName,
      branchId: input.branchId,
      clusterId: input.clusterId,
      category: "capacity",
      severity: "high",
      title: "Scheme Operating at Stressed Capacity (>95%)",
      description: `Production is at ${utilizationPercent}% of practical scheme capacity (${input.actualProductionM3Month.toLocaleString()} m³ / ${input.practicalCapacityM3Month.toLocaleString()} m³).`,
      observation: "System is operating near maximum limits with little buffer for breakdown or peak demand.",
      evidence: {
        metric: "capacity_utilization_percent",
        actual: utilizationPercent,
        baseline: 85,
        variance: Math.round((utilizationPercent - 85) * 10) / 10,
        unit: "%",
        period: input.periodName || undefined,
        dataCompletenessPercent: input.dataCompletenessPercent,
      },
      recommendation: "Review source-level pumping hours, peak storage capacity, and plan infrastructure extension.",
      confidence: input.dataCompletenessPercent >= 90 ? "HIGH" : "MEDIUM",
      reportingPeriod: input.periodName || undefined,
      detectedAt: new Date(),
      status: "OPEN",
    })
  }

  // 2. Under-utilized System (< 50%)
  if (utilizationPercent < 50 && input.actualProductionM3Month > 0) {
    findings.push({
      id: `cap-underutilized-${input.schemeId}`,
      schemeId: input.schemeId,
      schemeName: input.schemeName,
      branchId: input.branchId,
      clusterId: input.clusterId,
      category: "capacity",
      severity: "watch",
      title: "Scheme Capacity Significantly Underutilized (<50%)",
      description: `Production is only ${utilizationPercent}% of practical scheme capacity (${input.actualProductionM3Month.toLocaleString()} m³ / ${input.practicalCapacityM3Month.toLocaleString()} m³).`,
      observation: "Assets are underused, leading to higher fixed operating unit costs.",
      evidence: {
        metric: "capacity_utilization_percent",
        actual: utilizationPercent,
        baseline: 75,
        variance: Math.round((utilizationPercent - 75) * 10) / 10,
        unit: "%",
        period: input.periodName || undefined,
        dataCompletenessPercent: input.dataCompletenessPercent,
      },
      recommendation: "Investigate whether under-utilization is due to source yield constraints, power outages, or low network demand.",
      confidence: input.dataCompletenessPercent >= 90 ? "HIGH" : "MEDIUM",
      reportingPeriod: input.periodName || undefined,
      detectedAt: new Date(),
      status: "OPEN",
    })
  }

  return findings
}
