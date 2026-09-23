import { StructuredFinding } from "./types"

export interface SchemeProductionInput {
  schemeId: string
  schemeName: string
  branchId?: string | null
  clusterId?: string | null
  periodId?: string | null
  periodName?: string | null
  currentProductionM3: number
  previousProductionM3: number
  historicalAvgProductionM3: number
  dataCompletenessPercent: number
}

export function evaluateProductionTrends(input: SchemeProductionInput): StructuredFinding[] {
  const findings: StructuredFinding[] = []

  if (input.dataCompletenessPercent < 60) return findings
  if (input.previousProductionM3 <= 0 && input.historicalAvgProductionM3 <= 0) return findings

  const baseline = input.previousProductionM3 > 0 ? input.previousProductionM3 : input.historicalAvgProductionM3
  const percentChange = Math.round(((input.currentProductionM3 - baseline) / baseline) * 1000) / 10

  // Significant Production Drop (> 15% drop)
  if (percentChange <= -15) {
    const dropM3 = Math.round(baseline - input.currentProductionM3)
    const severity = percentChange <= -30 ? "critical" : "high"

    findings.push({
      id: `prod-drop-${input.schemeId}`,
      schemeId: input.schemeId,
      schemeName: input.schemeName,
      branchId: input.branchId,
      clusterId: input.clusterId,
      category: "production",
      severity,
      title: `Significant Production Drop (${Math.abs(percentChange)}% Decrease)`,
      description: `Water production dropped by ${dropM3.toLocaleString()} m³ compared to the previous benchmark (${input.currentProductionM3.toLocaleString()} m³ vs ${baseline.toLocaleString()} m³).`,
      observation: "Unexplained production drops increase the risk of dry taps, rationing, and customer complaints.",
      evidence: {
        metric: "production_m3",
        actual: input.currentProductionM3,
        baseline,
        variance: -dropM3,
        unit: "m³",
        period: input.periodName || undefined,
        dataCompletenessPercent: input.dataCompletenessPercent,
      },
      recommendation: "Check source pump operating hours, power availability, downtime logs, and main transmission pipes.",
      confidence: input.dataCompletenessPercent >= 90 ? "HIGH" : "MEDIUM",
      reportingPeriod: input.periodName || undefined,
      detectedAt: new Date(),
      status: "OPEN",
    })
  }

  // Abnormal Production Spike (> 35% increase)
  if (percentChange >= 35) {
    const spikeM3 = Math.round(input.currentProductionM3 - baseline)

    findings.push({
      id: `prod-spike-${input.schemeId}`,
      schemeId: input.schemeId,
      schemeName: input.schemeName,
      branchId: input.branchId,
      clusterId: input.clusterId,
      category: "production",
      severity: "watch",
      title: `Unusual Production Surge (+${percentChange}%)`,
      description: `Water production surged by ${spikeM3.toLocaleString()} m³ compared to baseline (${input.currentProductionM3.toLocaleString()} m³ vs ${baseline.toLocaleString()} m³).`,
      observation: "Abnormal surges should be verified against bulk meter calibration to rule out log errors.",
      evidence: {
        metric: "production_m3",
        actual: input.currentProductionM3,
        baseline,
        variance: spikeM3,
        unit: "m³",
        period: input.periodName || undefined,
        dataCompletenessPercent: input.dataCompletenessPercent,
      },
      recommendation: "Verify bulk meter readings and check for major burst repairs or network mains flushing.",
      confidence: "MEDIUM",
      reportingPeriod: input.periodName || undefined,
      detectedAt: new Date(),
      status: "OPEN",
    })
  }

  return findings
}
