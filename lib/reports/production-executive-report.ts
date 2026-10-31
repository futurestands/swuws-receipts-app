import "server-only"
import { and, asc, eq } from "drizzle-orm"
import type { db as DbClient } from "@/lib/db"
import { branch, cluster, waterScheme } from "@/lib/db/schema"
import type { UserPermissionsContext } from "@/lib/permissions"
import { loadBilledVolumes } from "@/lib/production/billed-volume"
import { divideRoundHalfUp, fromCents, toCents } from "@/lib/production/decimal"
import { evaluateNrw, NRW_BASIS, NRW_CAVEAT, type BilledVolume, type PeriodMatch } from "@/lib/production/nrw"
import { loadProductionSummary, type AllocationDetail, type DataQualityStatus } from "@/lib/production/reporting"
import { monthSchema } from "@/lib/production/schemas"
import { ownLogFilter, ownMeasurementFilter, productionReadableSchemeFilter } from "@/lib/production/scope"

export interface MonthlyProductionReportFilter {
  month: string // YYYY-MM
  clusterId?: string
  branchId?: string
  schemeId?: string
}

export interface MonthlyProductionReportItem {
  schemeId: string
  schemeName: string
  branchName: string
  clusterName: string
  dataQualityStatus: DataQualityStatus
  requiredSourceDays: number
  verifiedSourceDays: number
  missingSourceDays: number
  estimatedSourceDays: number
  completenessPercent: number
  /** Verified measured production within the month (daily + whole-month intervals; excludes conflicts and cross-month estimates). */
  verifiedProducedM3: number
  dailyVerifiedProducedM3: number
  intervalMeasuredProducedM3: number
  intervalMeasuredCount: number
  intervalConflictCount: number
  excludedConflictedIntervalM3: number
  /** Verified system input volume when every verified production record carries a supplied measurement; null otherwise. */
  verifiedSuppliedM3: number | null
  suppliedComplete: boolean
  provisionalDailyCount: number
  provisionalProducedM3: number
  provisionalIntervalCount: number
  provisionalIntervalTotalM3: number
  averageDailyProducedM3: number | null
  monthlyCapacityM3: number | null
  capacityUtilizationPercent: number | null
  /** Sum of metered customer readings linked to a billing record in the matched billing period; null when unavailable. */
  billedConsumptionM3: number | null
  billedDetails: BilledVolume | null
  billedEvidenceComplete: boolean
  nrwStatus: "AVAILABLE" | "UNAVAILABLE"
  nrwPercent: number | null
  nrwUnavailableReasons: string[]
  /** Separate cross-month shares; never added to verifiedProducedM3, energy, or NRW. */
  estimatedAllocation: {
    basis: "ESTIMATED_ALLOCATION"
    present: boolean
    producedM3: number
    electricityKwh: number
    fuelLitres: number
    electricityCostUgx: number
    fuelExpenditureUgx: number
    methods: string[]
    records: AllocationDetail[]
  }
  energy: {
    totalKwh: number
    totalFuelLitres: number
    totalEnergyCostUgx: number
    kwhPerM3: number | null
    fuelPerM3: number | null
    electricityCoverageComplete: boolean
    fuelCoverageComplete: boolean
    fuelUnavailableCount: number
    fuelUnreconciledExpenditureUgx: number
    provisionalElectricityCount: number
    provisionalElectricityKwh: number
    provisionalFuelCount: number
    provisionalFuelLitres: number
  }
}

export interface MonthlyProductionReportOutput {
  generatedAt: string
  reportingMonth: string
  billingPeriodMatch: PeriodMatch
  billingPeriodId: string | null
  scope: string
  nrwMethodology: {
    basis: string
    caveat: string
  }
  totals: {
    totalSchemes: number
    completeSchemesCount: number
    partialSchemesCount: number
    unavailableSchemesCount: number
    totalVerifiedProducedM3: number
    totalMeasuredElectricityKwh: number
    totalMeasuredFuelLitres: number
    totalMeasuredEnergyCostUgx: number
    totalUnreconciledFuelLogsCount: number
    totalUnreconciledFuelExpenditureUgx: number
    totalProvisionalRecordsCount: number
    billedSchemesWithReadingsCount: number
    billedCompleteSchemesCount: number
    totalBilledConsumptionM3: number | null
    overallCompletenessPercent: number
    overallNrwStatus: "AVAILABLE" | "UNAVAILABLE"
    overallNrwPercent: number | null
    estimatedAllocation: {
      basis: "ESTIMATED_ALLOCATION"
      present: boolean
      producedM3: number
      electricityKwh: number
      fuelLitres: number
      electricityCostUgx: number
      fuelExpenditureUgx: number
    }
  }
  items: MonthlyProductionReportItem[]
}

const ZERO = BigInt(0)

export async function generateMonthlyWaterProductionReport(
  user: UserPermissionsContext,
  filters: MonthlyProductionReportFilter,
  injectedClient?: typeof DbClient,
): Promise<MonthlyProductionReportOutput> {
  const client = injectedClient ?? (await import("@/lib/db")).db
  const month = monthSchema.parse(filters.month)
  const { clusterId, branchId, schemeId } = filters

  // 1. Query target schemes strictly intersected with the caller's organisational/cluster/area/scheme boundary.
  const targetSchemes = await client
    .select({
      id: waterScheme.id,
      name: waterScheme.name,
      branchName: branch.name,
      clusterName: cluster.name,
    })
    .from(waterScheme)
    .innerJoin(branch, eq(branch.id, waterScheme.branchId))
    .innerJoin(cluster, eq(cluster.id, branch.clusterId))
    .where(and(
      productionReadableSchemeFilter(user),
      schemeId ? eq(waterScheme.id, schemeId) : undefined,
      branchId ? eq(waterScheme.branchId, branchId) : undefined,
      clusterId ? eq(branch.clusterId, clusterId) : undefined,
    ))
    .orderBy(asc(cluster.name), asc(branch.name), asc(waterScheme.name))

  const schemeIds = targetSchemes.map((s) => s.id)
  const scopeLabel = schemeId
    ? `Scheme: ${targetSchemes[0]?.name ?? schemeId}`
    : branchId
    ? `Area (Branch): ${targetSchemes[0]?.branchName ?? branchId}`
    : clusterId
    ? `Cluster: ${targetSchemes[0]?.clusterName ?? clusterId}`
    : "SWUWS-Wide (Authorised Scope)"

  if (!schemeIds.length) {
    return {
      generatedAt: new Date().toISOString(),
      reportingMonth: month,
      billingPeriodMatch: "NONE",
      billingPeriodId: null,
      scope: "No authorised schemes matched the requested filter",
      nrwMethodology: { basis: NRW_BASIS, caveat: NRW_CAVEAT },
      totals: {
        totalSchemes: 0,
        completeSchemesCount: 0,
        partialSchemesCount: 0,
        unavailableSchemesCount: 0,
        totalVerifiedProducedM3: 0,
        totalMeasuredElectricityKwh: 0,
        totalMeasuredFuelLitres: 0,
        totalMeasuredEnergyCostUgx: 0,
        totalUnreconciledFuelLogsCount: 0,
        totalUnreconciledFuelExpenditureUgx: 0,
        totalProvisionalRecordsCount: 0,
        billedSchemesWithReadingsCount: 0,
        billedCompleteSchemesCount: 0,
        totalBilledConsumptionM3: null,
        overallCompletenessPercent: 0,
        overallNrwStatus: "UNAVAILABLE",
        overallNrwPercent: null,
        estimatedAllocation: {
          basis: "ESTIMATED_ALLOCATION",
          present: false,
          producedM3: 0,
          electricityKwh: 0,
          fuelLitres: 0,
          electricityCostUgx: 0,
          fuelExpenditureUgx: 0,
        },
      },
      items: [],
    }
  }

  // 2. Load source-aware production summaries & real customer meter-reading billed volumes in parallel.
  const [summaries, billedResult] = await Promise.all([
    loadProductionSummary(client, schemeIds, month, ownLogFilter(user), ownMeasurementFilter(user)),
    loadBilledVolumes(client, schemeIds, month),
  ])

  let totalVerifiedProducedCents = ZERO
  let totalMeasuredElectricityCents = ZERO
  let totalMeasuredFuelCents = ZERO
  let totalMeasuredEnergyCostCents = ZERO
  let totalUnreconciledFuelLogsCount = 0
  let totalUnreconciledFuelExpenditureCents = ZERO
  let totalProvisionalRecordsCount = 0

  let totalBilledCents = ZERO
  let billedSchemesWithReadingsCount = 0
  let billedCompleteSchemesCount = 0
  let totalSuppliedForOverallNrwCents = ZERO
  let totalBilledForOverallNrwCents = ZERO
  let allSchemesNrwAvailable = true

  let totalRequiredSourceDays = 0
  let totalVerifiedSourceDays = 0
  let completeSchemesCount = 0
  let partialSchemesCount = 0
  let unavailableSchemesCount = 0

  let estProducedCents = ZERO
  let estElecCents = ZERO
  let estFuelCents = ZERO
  let estElecCostCents = ZERO
  let estFuelCostCents = ZERO
  let anyEstimated = false

  const items: MonthlyProductionReportItem[] = targetSchemes.map((sch) => {
    const sum = summaries.find((s) => s.schemeId === sch.id)
    const status: DataQualityStatus = sum?.dataQualityStatus ?? "UNAVAILABLE"
    if (status === "COMPLETE") completeSchemesCount++
    else if (status === "PARTIAL") partialSchemesCount++
    else unavailableSchemesCount++

    const producedCents = toCents(sum?.totalWaterProducedM3 ?? "0.00")
    totalVerifiedProducedCents += producedCents
    const verifiedProduced = Number(fromCents(producedCents))

    const energy = sum?.energy ?? {
      totalKwh: 0,
      totalFuelLitres: 0,
      totalEnergyCostUgx: 0,
      kwhPerM3: null,
      fuelPerM3: null,
      electricityCoverageComplete: false,
      fuelCoverageComplete: false,
      fuelUnavailableCount: 0,
      fuelUnreconciledExpenditureUgx: 0,
      provisionalElectricityCount: 0,
      provisionalElectricityKwh: 0,
      provisionalFuelCount: 0,
      provisionalFuelLitres: 0,
    }
    totalMeasuredElectricityCents += toCents(energy.totalKwh.toFixed(2))
    totalMeasuredFuelCents += toCents(energy.totalFuelLitres.toFixed(2))
    totalMeasuredEnergyCostCents += toCents(energy.totalEnergyCostUgx.toFixed(2))
    totalUnreconciledFuelLogsCount += energy.fuelUnavailableCount
    totalUnreconciledFuelExpenditureCents += toCents(energy.fuelUnreconciledExpenditureUgx.toFixed(2))

    const provDailyCount = sum?.provisionalCount ?? 0
    const provIntCount = sum?.provisionalIntervalCount ?? 0
    totalProvisionalRecordsCount +=
      provDailyCount +
      provIntCount +
      (energy.provisionalElectricityCount ?? 0) +
      (energy.provisionalFuelCount ?? 0)

    const reqDays = sum?.requiredSourceDays ?? 0
    const verDays = sum?.verifiedSourceDays ?? 0
    totalRequiredSourceDays += reqDays
    totalVerifiedSourceDays += verDays

    const monthlyCap = sum?.currentCapacityM3Month ?? null
    const capUtilPct = monthlyCap !== null && monthlyCap > 0 && status === "COMPLETE"
      ? Math.round((verifiedProduced / monthlyCap) * 100)
      : null

    const billed = billedResult.bySchemeId.get(sch.id) ?? null
    const billedEvidenceComplete = Boolean(
      billedResult.periodMatch === "ONE"
      && billed
      && billed.eligibleReadings > 0
      && billed.meteredActiveCustomers > 0
      && billed.meteredCustomersWithReading === billed.meteredActiveCustomers
      && billed.unmeteredActiveCustomers === 0,
    )
    const billedM3 = billed ? Number(billed.volumeM3) : null
    if (billed) {
      billedSchemesWithReadingsCount++
      totalBilledCents += toCents(billed.volumeM3)
    }
    if (billedEvidenceComplete) billedCompleteSchemesCount++

    const nrw = evaluateNrw({
      periodMatch: billedResult.periodMatch,
      production: {
        dataQualityStatus: status,
        suppliedComplete: sum?.suppliedComplete ?? false,
        totalWaterSuppliedM3: sum?.totalWaterSuppliedM3 ?? "0.00",
        intervalConflictCount: sum?.intervalConflictCount ?? 0,
        estimatedAllocationPresent: sum?.estimatedAllocation.records.some((r) => r.kind === "water_interval") ?? false,
      },
      billed,
    })

    if (nrw.status === "AVAILABLE" && nrw.systemInputM3 && nrw.billedM3) {
      totalSuppliedForOverallNrwCents += toCents(nrw.systemInputM3)
      totalBilledForOverallNrwCents += toCents(nrw.billedM3)
    } else {
      allSchemesNrwAvailable = false
    }

    const est = sum?.estimatedAllocation
    const estRecords = est?.records ?? []
    const methods = [...new Set(estRecords.map((r) => r.method))]
    if (est?.present) {
      anyEstimated = true
      estProducedCents += toCents(est.producedM3)
      estElecCents += toCents(est.electricityKwh.toFixed(2))
      estFuelCents += toCents(est.fuelLitres.toFixed(2))
      estElecCostCents += toCents(est.electricityCostUgx.toFixed(2))
      estFuelCostCents += toCents(est.fuelExpenditureUgx.toFixed(2))
    }

    return {
      schemeId: sch.id,
      schemeName: sch.name,
      branchName: sch.branchName,
      clusterName: sch.clusterName,
      dataQualityStatus: status,
      requiredSourceDays: reqDays,
      verifiedSourceDays: verDays,
      missingSourceDays: sum?.missingSourceDays ?? reqDays,
      estimatedSourceDays: sum?.estimatedSourceDays ?? 0,
      completenessPercent: sum?.coveragePercent ?? 0,
      verifiedProducedM3: verifiedProduced,
      dailyVerifiedProducedM3: Number(sum?.dailyVerifiedProducedM3 ?? 0),
      intervalMeasuredProducedM3: Number(sum?.intervalMeasuredProducedM3 ?? 0),
      intervalMeasuredCount: sum?.intervalMeasuredCount ?? 0,
      intervalConflictCount: sum?.intervalConflictCount ?? 0,
      excludedConflictedIntervalM3: Number(sum?.excludedConflictedIntervalM3 ?? 0),
      verifiedSuppliedM3: sum?.suppliedComplete ? Number(sum.totalWaterSuppliedM3) : null,
      suppliedComplete: sum?.suppliedComplete ?? false,
      provisionalDailyCount: provDailyCount,
      provisionalProducedM3: Number(sum?.provisionalProducedM3 ?? 0),
      provisionalIntervalCount: provIntCount,
      provisionalIntervalTotalM3: Number(sum?.provisionalIntervalTotalM3 ?? 0),
      averageDailyProducedM3: sum?.averageDailyProducedM3 ?? null,
      monthlyCapacityM3: monthlyCap,
      capacityUtilizationPercent: capUtilPct,
      billedConsumptionM3: billedM3,
      billedDetails: billed,
      billedEvidenceComplete,
      nrwStatus: nrw.status,
      nrwPercent: nrw.percent,
      nrwUnavailableReasons: nrw.reasons,
      estimatedAllocation: {
        basis: "ESTIMATED_ALLOCATION",
        present: est?.present ?? false,
        producedM3: Number(est?.producedM3 ?? 0),
        electricityKwh: est?.electricityKwh ?? 0,
        fuelLitres: est?.fuelLitres ?? 0,
        electricityCostUgx: est?.electricityCostUgx ?? 0,
        fuelExpenditureUgx: est?.fuelExpenditureUgx ?? 0,
        methods,
        records: estRecords,
      },
      energy: {
        ...energy,
        provisionalElectricityCount: energy.provisionalElectricityCount ?? 0,
        provisionalElectricityKwh: energy.provisionalElectricityKwh ?? 0,
        provisionalFuelCount: energy.provisionalFuelCount ?? 0,
        provisionalFuelLitres: energy.provisionalFuelLitres ?? 0,
      },
    }
  })

  const overallCompleteness = totalRequiredSourceDays > 0
    ? Math.min(100, Math.round((totalVerifiedSourceDays / totalRequiredSourceDays) * 100))
    : 0

  let overallNrwPercent: number | null = null
  if (
    allSchemesNrwAvailable
    && targetSchemes.length > 0
    && totalSuppliedForOverallNrwCents > ZERO
    && totalBilledForOverallNrwCents <= totalSuppliedForOverallNrwCents
  ) {
    overallNrwPercent = Number(
      divideRoundHalfUp(
        (totalSuppliedForOverallNrwCents - totalBilledForOverallNrwCents) * BigInt(1000),
        totalSuppliedForOverallNrwCents,
      ),
    ) / 10
  }

  return {
    generatedAt: new Date().toISOString(),
    reportingMonth: month,
    billingPeriodMatch: billedResult.periodMatch,
    billingPeriodId: billedResult.periodId,
    scope: scopeLabel,
    nrwMethodology: { basis: NRW_BASIS, caveat: NRW_CAVEAT },
    totals: {
      totalSchemes: targetSchemes.length,
      completeSchemesCount,
      partialSchemesCount,
      unavailableSchemesCount,
      totalVerifiedProducedM3: Number(fromCents(totalVerifiedProducedCents)),
      totalMeasuredElectricityKwh: Number(fromCents(totalMeasuredElectricityCents)),
      totalMeasuredFuelLitres: Number(fromCents(totalMeasuredFuelCents)),
      totalMeasuredEnergyCostUgx: Number(fromCents(totalMeasuredEnergyCostCents)),
      totalUnreconciledFuelLogsCount,
      totalUnreconciledFuelExpenditureUgx: Number(fromCents(totalUnreconciledFuelExpenditureCents)),
      totalProvisionalRecordsCount,
      billedSchemesWithReadingsCount,
      billedCompleteSchemesCount,
      totalBilledConsumptionM3: billedSchemesWithReadingsCount > 0 ? Number(fromCents(totalBilledCents)) : null,
      overallCompletenessPercent: overallCompleteness,
      overallNrwStatus: overallNrwPercent !== null ? "AVAILABLE" : "UNAVAILABLE",
      overallNrwPercent,
      estimatedAllocation: {
        basis: "ESTIMATED_ALLOCATION",
        present: anyEstimated,
        producedM3: Number(fromCents(estProducedCents)),
        electricityKwh: Number(fromCents(estElecCents)),
        fuelLitres: Number(fromCents(estFuelCents)),
        electricityCostUgx: Number(fromCents(estElecCostCents)),
        fuelExpenditureUgx: Number(fromCents(estFuelCostCents)),
      },
    },
    items,
  }
}
