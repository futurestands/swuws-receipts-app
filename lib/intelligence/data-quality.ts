import { StructuredFinding } from "./types"

export interface SchemeDataQualityInput {
  schemeId: string
  schemeName: string
  branchId?: string | null
  clusterId?: string | null
  periodId?: string | null
  periodName?: string | null
  sourcesCount: number
  productionLogsCount: number
  meterReadingsCount: number
  daysInPeriod: number
  loggedDaysCount: number
  hasTargets: boolean
}

export function evaluateDataQuality(input: SchemeDataQualityInput): StructuredFinding[] {
  const findings: StructuredFinding[] = []

  // 1. Missing Sources Configuration
  if (input.sourcesCount === 0) {
    findings.push({
      id: `dq-nosource-${input.schemeId}`,
      schemeId: input.schemeId,
      schemeName: input.schemeName,
      branchId: input.branchId,
      clusterId: input.clusterId,
      category: "data_quality",
      severity: "high",
      title: "Missing Scheme Water Sources Configuration",
      description: "No water sources (gravity/pumps) have been registered for this scheme.",
      observation: "Without configured sources, practical scheme capacity and source utilization cannot be calculated.",
      evidence: {
        metric: "sources_count",
        actual: 0,
        expected: ">= 1 source",
        period: input.periodName || undefined,
        dataCompletenessPercent: 0,
      },
      recommendation: "Register all water sources (gravity springs, boreholes, solar/grid pumps) in Scheme Configuration.",
      confidence: "HIGH",
      reportingPeriod: input.periodName || undefined,
      detectedAt: new Date(),
      status: "OPEN",
    })
  }

  // 2. Incomplete Production Logs
  if (input.sourcesCount > 0 && input.loggedDaysCount < input.daysInPeriod) {
    const missingDays = input.daysInPeriod - input.loggedDaysCount
    const completeness = Math.round((input.loggedDaysCount / input.daysInPeriod) * 100)
    const severity = completeness < 50 ? "high" : "watch"

    findings.push({
      id: `dq-incompletelog-${input.schemeId}`,
      schemeId: input.schemeId,
      schemeName: input.schemeName,
      branchId: input.branchId,
      clusterId: input.clusterId,
      category: "data_quality",
      severity,
      title: `Incomplete Production Logging (${completeness}% Complete)`,
      description: `${missingDays} day(s) of water production data are missing for this period.`,
      observation: "Production trends and Non-Revenue Water estimates are unconfirmed due to missing daily logs.",
      evidence: {
        metric: "logged_days",
        actual: input.loggedDaysCount,
        expected: input.daysInPeriod,
        variance: -missingDays,
        unit: "days",
        period: input.periodName || undefined,
        dataCompletenessPercent: completeness,
      },
      recommendation: "Ensure scheme operator logs daily bulk meter readings and production volumes consistently.",
      confidence: "HIGH",
      reportingPeriod: input.periodName || undefined,
      detectedAt: new Date(),
      status: "OPEN",
    })
  }

  // 3. Missing Operational Targets
  if (!input.hasTargets) {
    findings.push({
      id: `dq-notargets-${input.schemeId}`,
      schemeId: input.schemeId,
      schemeName: input.schemeName,
      branchId: input.branchId,
      clusterId: input.clusterId,
      category: "data_quality",
      severity: "info",
      title: "Missing Operational Targets",
      description: "No monthly targets set for production, NRW, or collection efficiency.",
      observation: "Performance variance cannot be benchmarked against management expectations.",
      evidence: {
        metric: "targets_configured",
        actual: 0,
        expected: 1,
        period: input.periodName || undefined,
      },
      recommendation: "Set monthly operational benchmarks in Scheme Targets.",
      confidence: "HIGH",
      reportingPeriod: input.periodName || undefined,
      detectedAt: new Date(),
      status: "OPEN",
    })
  }

  return findings
}
