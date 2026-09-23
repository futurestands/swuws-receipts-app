import { StructuredFinding } from "./types"

export interface SchemeCommercialInput {
  schemeId: string
  schemeName: string
  branchId?: string | null
  clusterId?: string | null
  periodId?: string | null
  periodName?: string | null
  totalBilledUgx: number
  currentBilledUgx: number
  totalCashCollectedUgx: number
  cashToArrearsUgx: number
  totalArrearsUgx: number
  dataCompletenessPercent: number
}

export function evaluateCommercialPerformance(input: SchemeCommercialInput): StructuredFinding[] {
  const findings: StructuredFinding[] = []

  if (input.currentBilledUgx <= 0) return findings

  const collectionRate = Math.round((input.totalCashCollectedUgx / input.currentBilledUgx) * 1000) / 10

  // 1. Weak Collection Rate (< 60%)
  if (collectionRate < 60) {
    const uncollectedUgx = Math.max(0, input.currentBilledUgx - input.totalCashCollectedUgx)
    const severity = collectionRate < 40 ? "critical" : "high"

    findings.push({
      id: `comm-weakcollection-${input.schemeId}`,
      schemeId: input.schemeId,
      schemeName: input.schemeName,
      branchId: input.branchId,
      clusterId: input.clusterId,
      category: "commercial",
      severity,
      title: `Low Cash Collection Rate (${collectionRate}%)`,
      description: `Scheme collected UGX ${input.totalCashCollectedUgx.toLocaleString()} against UGX ${input.currentBilledUgx.toLocaleString()} current bill demand (${collectionRate}% collection efficiency).`,
      observation: "Low collection efficiency severely constrains operational cash flow and increases customer arrears.",
      evidence: {
        metric: "collection_efficiency_percent",
        actual: collectionRate,
        baseline: 85,
        variance: Math.round((collectionRate - 85) * 10) / 10,
        unit: "%",
        period: input.periodName || undefined,
        dataCompletenessPercent: input.dataCompletenessPercent,
        additionalDetails: {
          currentBilledUgx: input.currentBilledUgx,
          totalCashCollectedUgx: input.totalCashCollectedUgx,
          uncollectedUgx,
        },
      },
      recommendation: "Issue SMS payment reminders to defaulted accounts, enforce disconnection policy on delinquent customers, and audit bank deposits.",
      confidence: "HIGH",
      reportingPeriod: input.periodName || undefined,
      detectedAt: new Date(),
      status: "OPEN",
    })
  }

  // 2. High Scheme Arrears (> UGX 50M)
  if (input.totalArrearsUgx >= 50_000_000) {
    findings.push({
      id: `comm-higharrears-${input.schemeId}`,
      schemeId: input.schemeId,
      schemeName: input.schemeName,
      branchId: input.branchId,
      clusterId: input.clusterId,
      category: "commercial",
      severity: "high",
      title: `Substantial Scheme Debt Arrears (UGX ${(input.totalArrearsUgx / 1_000_000).toFixed(1)}M)`,
      description: `Cumulative outstanding customer arrears for this scheme stand at UGX ${input.totalArrearsUgx.toLocaleString()}.`,
      observation: "Persistent uncollected arrears represent significant tied-up revenue.",
      evidence: {
        metric: "total_arrears_ugx",
        actual: input.totalArrearsUgx,
        baseline: 10_000_000,
        variance: input.totalArrearsUgx - 10_000_000,
        unit: "UGX",
        period: input.periodName || undefined,
      },
      recommendation: "Review top debtors for this scheme and initiate targeted debt recovery or payment agreement plans.",
      confidence: "HIGH",
      reportingPeriod: input.periodName || undefined,
      detectedAt: new Date(),
      status: "OPEN",
    })
  }

  return findings
}
