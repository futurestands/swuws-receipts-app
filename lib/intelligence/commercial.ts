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
  collectionBasis?: "balance_inference" | "verified_receipts" | "unavailable"
}

export function evaluateCommercialPerformance(input: SchemeCommercialInput): StructuredFinding[] {
  const findings: StructuredFinding[] = []

  if (!Number.isFinite(input.currentBilledUgx) || input.currentBilledUgx <= 0) return findings

  const estimated = input.collectionBasis === "balance_inference"
  const usableCash = (estimated || input.collectionBasis === "verified_receipts") && Number.isFinite(input.totalCashCollectedUgx) && input.totalCashCollectedUgx >= 0
  const collectionRate = usableCash ? Math.round((input.totalCashCollectedUgx / input.currentBilledUgx) * 1000) / 10 : null

  // 1. Weak Collection Rate (< 60%)
  if (collectionRate !== null && collectionRate < 60) {
    const uncollectedUgx = Math.max(0, input.currentBilledUgx - input.totalCashCollectedUgx)
    const severity = estimated ? "watch" : collectionRate < 40 ? "critical" : "high"

    findings.push({
      id: `comm-weakcollection-${input.schemeId}`,
      schemeId: input.schemeId,
      schemeName: input.schemeName,
      branchId: input.branchId,
      clusterId: input.clusterId,
      category: "commercial",
      severity,
      title: `${estimated ? "Estimated" : "Low Cash"} Collection Rate (${collectionRate}%)`,
      description: `${estimated ? "Balance-derived cash estimate (unverified)" : "Verified receipt allocations"}: UGX ${input.totalCashCollectedUgx.toLocaleString()} against UGX ${input.currentBilledUgx.toLocaleString()} current billed demand (${collectionRate}%).`,
      observation: estimated ? "Reconcile receipts and allocations before interpreting collection performance." : "Recorded collection performance triggers the existing commercial review rule.",
      evidence: {
        metric: "collection_efficiency_percent",
        actual: collectionRate,
        unit: "%",
        period: input.periodName || undefined,
        dataCompletenessPercent: input.dataCompletenessPercent,
        additionalDetails: {
          currentBilledUgx: input.currentBilledUgx,
          totalCashCollectedUgx: input.totalCashCollectedUgx,
          uncollectedUgx,
          collectionBasis: input.collectionBasis,
          ruleSource: "Existing commercial heuristic; not an approved scheme MPS/TPS target",
          ruleApproval: "UNRESOLVED",
          lowRateThresholdPercent: 60,
          criticalRateThresholdPercent: 40,
          legacyReferencePercent: 85,
          legacyReferenceVariance: Math.round((collectionRate - 85) * 10) / 10,
        },
      },
      recommendation: "Verify receipt allocations, bank reconciliation and the commercial rule's approval before selecting collection actions.",
      confidence: estimated ? "MEDIUM" : "HIGH",
      reportingPeriod: input.periodName || undefined,
      detectedAt: new Date(),
      status: "OPEN",
    })
  }

  // 2. High Scheme Arrears (> UGX 50M)
  if (Number.isFinite(input.totalArrearsUgx) && input.totalArrearsUgx >= 50_000_000) {
    findings.push({
      id: `comm-higharrears-${input.schemeId}`,
      schemeId: input.schemeId,
      schemeName: input.schemeName,
      branchId: input.branchId,
      clusterId: input.clusterId,
      category: "commercial",
      severity: "high",
      title: `Substantial Outstanding Demand (UGX ${(input.totalArrearsUgx / 1_000_000).toFixed(1)}M)`,
      description: `Outstanding demand including unpaid current bills is UGX ${input.totalArrearsUgx.toLocaleString()}.`,
      observation: "Persistent uncollected arrears represent significant tied-up revenue.",
      evidence: {
        metric: "total_arrears_ugx",
        actual: input.totalArrearsUgx,
        additionalDetails: { ruleSource: "Existing outstanding-demand heuristic; not an approved scheme target", ruleApproval: "UNRESOLVED", thresholdUgx: 50_000_000, legacyReferenceUgx: 10_000_000, legacyReferenceVariance: input.totalArrearsUgx - 10_000_000 },
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
