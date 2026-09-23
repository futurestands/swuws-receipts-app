import { FindingCategory, FindingSeverity, FindingConfidence, FindingStatus } from "@/lib/intelligence/types"

export interface TraceableMetric {
  metricName: string
  period: string
  scopeName: string
  sourceRecordsSummary: string
  formulaDescription: string
  rawResult: number
  validationStatus: "VALID" | "DATA_INCONSISTENCY" | "INCOMPLETE_DATA" | "TARGET_UNAVAILABLE"
  displayedResult: string
}

export interface TrustedPerformanceDataset {
  period: { id: string; periodName: string; year: number; month: number }
  scope: { level: "organization" | "cluster" | "branch" | "scheme"; id?: string; name?: string }
  kpis: {
    waterProducedM3: number
    waterSuppliedM3: number
    waterSoldM3: number
    unbilledLossM3: number
    rawCalculatedLossIndicator: number
    displayLossIndicator: string
    lossValidationStatus: string
    practicalCapacityM3Month: number
    capacityUtilizationPercent: number
    currentBilledUgx: number
    totalCashCollectedUgx: number
    cashToArrearsUgx: number
    cashToCurrentUgx: number
    totalArrearsUgx: number
    collectionEfficiencyPercent: number
    arrearsRecoveryPercent: number
    targetProductionM3?: number | null
    productionTargetAchievementPercent?: number | null
    targetCollectionEfficiencyPercent?: number | null
    collectionTargetAchievementPercent?: number | null
  }
  dataQuality: {
    completenessPercent: number
    flagsCount: number
    issues: string[]
  }
  schemesMatrix: SchemePerformanceMatrixItem[]
  periodDeltas: DecisionSupportDeltaItem[]
  traceability: TraceableMetric[]
}

export interface SchemePerformanceMatrixItem {
  schemeId: string
  schemeName: string
  branchId?: string | null
  producedM3: number
  practicalCapacityM3: number
  utilizationPercent: number
  soldM3: number
  rawLossPercent: number
  displayLoss: string
  currentBilledUgx: number
  cashCollectedUgx: number
  collectionEfficiencyPercent: number
  totalArrearsUgx: number
  statusLabel: string // "Healthy" | "Stressed" | "Watch" | "Benchmark unavailable"
  dataQualityStatus: string
}

export interface DecisionSupportDeltaItem {
  id: string
  schemeId: string
  schemeName: string
  metric: string
  currentValue: number
  previousValue: number
  deltaValue: number
  deltaPercent: number
  unit: string
  summary: string
}

export interface ManagementActionItem {
  id: string
  findingId?: string | null
  title: string
  description: string
  responsibleUserId?: string | null
  responsibleUserName?: string | null
  responsibleScope?: string | null
  dueDate: Date | string
  status: "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "PENDING_VERIFICATION" | "RESOLVED" | "CLOSED"
  priority: "critical" | "high" | "normal" | "low"
  resolutionNotes?: string | null
  closureEvidenceUrl?: string | null
  closedAt?: Date | string | null
  createdAt: Date | string
}
