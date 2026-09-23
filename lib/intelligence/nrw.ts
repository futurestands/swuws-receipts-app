import { StructuredFinding } from "./types"

export interface SchemeNrwInput {
  schemeId: string
  schemeName: string
  branchId?: string | null
  clusterId?: string | null
  periodId?: string | null
  periodName?: string | null
  waterProducedM3: number
  waterBilledSoldM3: number
  dataCompletenessPercent: number
}

export function evaluateNrwLoss(input: SchemeNrwInput): StructuredFinding[] {
  const findings: StructuredFinding[] = []

  if (input.dataCompletenessPercent < 70) return findings
  if (input.waterProducedM3 <= 0) return findings

  const unbilledLossM3 = Math.max(0, input.waterProducedM3 - input.waterBilledSoldM3)
  const lossPercentage = Math.round((unbilledLossM3 / input.waterProducedM3) * 1000) / 10

  // 1. Critical Loss (> 40%)
  if (lossPercentage > 40) {
    findings.push({
      id: `nrw-critical-${input.schemeId}`,
      schemeId: input.schemeId,
      schemeName: input.schemeName,
      branchId: input.branchId,
      clusterId: input.clusterId,
      category: "nrw",
      severity: "critical",
      title: `High Production-to-Sales Water Loss (${lossPercentage}%)`,
      description: `${unbilledLossM3.toLocaleString()} m³ of produced water was unbilled (${lossPercentage}% of ${input.waterProducedM3.toLocaleString()} m³ produced vs ${input.waterBilledSoldM3.toLocaleString()} m³ billed).`,
      observation: "Persistent high loss indicates major physical leaks, unmetered usage, illegal connections, or faulty customer meters.",
      evidence: {
        metric: "loss_indicator_percent",
        actual: lossPercentage,
        baseline: 20,
        variance: Math.round((lossPercentage - 20) * 10) / 10,
        unit: "%",
        period: input.periodName || undefined,
        dataCompletenessPercent: input.dataCompletenessPercent,
        additionalDetails: {
          waterProducedM3: input.waterProducedM3,
          waterBilledSoldM3: input.waterBilledSoldM3,
          unbilledLossM3,
        },
      },
      recommendation: "Conduct a zonal leak detection audit, verify bulk meter accuracy, and audit high-consumption commercial customers.",
      confidence: input.dataCompletenessPercent >= 90 ? "HIGH" : "MEDIUM",
      reportingPeriod: input.periodName || undefined,
      detectedAt: new Date(),
      status: "OPEN",
    })
  }
  // 2. High Loss Warning (25% - 40%)
  else if (lossPercentage > 25) {
    findings.push({
      id: `nrw-watch-${input.schemeId}`,
      schemeId: input.schemeId,
      schemeName: input.schemeName,
      branchId: input.branchId,
      clusterId: input.clusterId,
      category: "nrw",
      severity: "watch",
      title: `Elevated Water Loss Indicator (${lossPercentage}%)`,
      description: `Unbilled water loss is elevated at ${lossPercentage}% (${unbilledLossM3.toLocaleString()} m³ unbilled out of ${input.waterProducedM3.toLocaleString()} m³ produced).`,
      observation: "Loss level is above the target 20% benchmark.",
      evidence: {
        metric: "loss_indicator_percent",
        actual: lossPercentage,
        baseline: 20,
        variance: Math.round((lossPercentage - 20) * 10) / 10,
        unit: "%",
        period: input.periodName || undefined,
        dataCompletenessPercent: input.dataCompletenessPercent,
        additionalDetails: {
          waterProducedM3: input.waterProducedM3,
          waterBilledSoldM3: input.waterBilledSoldM3,
          unbilledLossM3,
        },
      },
      recommendation: "Inspect transmission pipelines and audit unmetered public standposts.",
      confidence: input.dataCompletenessPercent >= 90 ? "HIGH" : "MEDIUM",
      reportingPeriod: input.periodName || undefined,
      detectedAt: new Date(),
      status: "OPEN",
    })
  }

  return findings
}
