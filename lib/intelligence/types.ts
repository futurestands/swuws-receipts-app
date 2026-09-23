export type FindingCategory =
  | "data_quality"
  | "production"
  | "capacity"
  | "nrw"
  | "commercial"
  | "target"
  | "trend"

export type FindingSeverity = "critical" | "high" | "watch" | "info"

export type FindingConfidence = "HIGH" | "MEDIUM" | "LOW"

export type FindingStatus = "OPEN" | "UNDER_INVESTIGATION" | "RESOLVED" | "DISMISSED"

export interface IntelligenceEvidence {
  metric: string
  actual: number | string | null
  baseline?: number | string | null
  expected?: number | string | null
  variance?: number | string | null
  unit?: string
  period?: string
  dataCompletenessPercent?: number
  additionalDetails?: Record<string, unknown>
}

export interface StructuredFinding {
  id: string
  organizationId?: string | null
  clusterId?: string | null
  branchId?: string | null
  schemeId?: string | null
  schemeName?: string | null
  sourceId?: string | null
  sourceName?: string | null
  category: FindingCategory
  severity: FindingSeverity
  title: string
  description: string
  observation?: string | null
  evidence: IntelligenceEvidence
  recommendation?: string | null
  confidence: FindingConfidence
  reportingPeriod?: string | null
  detectedAt: Date | string
  status: FindingStatus
  assignedToUserId?: string | null
  assignedToName?: string | null
  resolutionNotes?: string | null
  resolvedAt?: Date | string | null
}

export interface IntelligenceFilters {
  organizationId?: string | null
  clusterId?: string | null
  branchId?: string | null
  schemeId?: string | null
  periodId?: string | null
  category?: string | null
  severity?: string | null
  status?: string | null
  query?: string | null
}

export interface IntelligenceSummaryKPIs {
  criticalCount: number
  highPriorityCount: number
  watchCount: number
  dataQualityCount: number
  schemesNeedingAttentionCount: number
  potentialFinancialImpactUgx: number | null
}

export interface PeriodChangeItem {
  id: string
  schemeId: string
  schemeName: string
  metric: string
  currentValue: number
  previousValue: number
  deltaValue: number
  deltaPercent: number
  unit: string
  direction: "increased" | "decreased" | "stable"
  significance: "positive" | "negative" | "neutral"
  summary: string
}

export interface PriorityInvestigationItem {
  id: string
  schemeId: string
  schemeName: string
  category: FindingCategory
  severity: FindingSeverity
  title: string
  whatHappened: string
  evidenceSummary: string
  whyItMatters: string
  whatShouldBeChecked: string
  confidence: FindingConfidence
  priorityScore: number
  findingId: string
}
