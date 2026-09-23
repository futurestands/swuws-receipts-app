import { db } from "@/lib/db"
import {
  waterScheme,
  billingPeriod,
  billingRecord,
  meterReading,
  waterSchemeSource,
  waterProductionLog,
  schemeTarget,
} from "@/lib/db/schema"
import { eq, and, sql, sum, count, desc, inArray } from "drizzle-orm"
import { UserPermissionsContext } from "@/lib/permissions"
import { applyIntelligenceSchemeFilter } from "@/lib/intelligence/scope"
import { validateWaterBalanceAndCapacity } from "./data-validation"
import {
  TrustedPerformanceDataset,
  SchemePerformanceMatrixItem,
  DecisionSupportDeltaItem,
  TraceableMetric,
} from "./types"

export async function getTrustedPerformanceDataset(
  user: UserPermissionsContext,
  periodIdInput?: string,
  schemeIdInput?: string
): Promise<TrustedPerformanceDataset> {
  // 1. Resolve Hierarchy Scope
  const schemeScopeCondition = applyIntelligenceSchemeFilter(user, schemeIdInput)
  const schemesCondition = schemeScopeCondition
    ? and(eq(waterScheme.active, true), schemeScopeCondition)
    : eq(waterScheme.active, true)

  const activeSchemes = await db
    .select({
      id: waterScheme.id,
      name: waterScheme.name,
      branchId: waterScheme.branchId,
    })
    .from(waterScheme)
    .where(schemesCondition)

  const schemeIds = activeSchemes.map((s) => s.id)

  // 2. Resolve Active or Target Period
  let selectedPeriod: { id: string; periodName: string; year: number; month: number } | undefined
  if (periodIdInput && periodIdInput !== "all") {
    const [p] = await db
      .select({
        id: billingPeriod.id,
        periodName: billingPeriod.periodName,
        year: billingPeriod.year,
        month: billingPeriod.month,
      })
      .from(billingPeriod)
      .where(eq(billingPeriod.id, periodIdInput))
      .limit(1)
    selectedPeriod = p
  } else {
    const [p] = await db
      .select({
        id: billingPeriod.id,
        periodName: billingPeriod.periodName,
        year: billingPeriod.year,
        month: billingPeriod.month,
      })
      .from(billingPeriod)
      .where(eq(billingPeriod.status, "active"))
      .orderBy(desc(billingPeriod.year), desc(billingPeriod.month))
      .limit(1)
    selectedPeriod = p
  }

  const period = selectedPeriod || {
    id: "active",
    periodName: "Current Period",
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  }

  if (schemeIds.length === 0) {
    return {
      period,
      scope: { level: "organization" },
      kpis: {
        waterProducedM3: 0,
        waterSuppliedM3: 0,
        waterSoldM3: 0,
        unbilledLossM3: 0,
        rawCalculatedLossIndicator: 0,
        displayLossIndicator: "0.0%",
        lossValidationStatus: "VALID",
        practicalCapacityM3Month: 0,
        capacityUtilizationPercent: 0,
        currentBilledUgx: 0,
        totalCashCollectedUgx: 0,
        cashToArrearsUgx: 0,
        cashToCurrentUgx: 0,
        totalArrearsUgx: 0,
        collectionEfficiencyPercent: 0,
        arrearsRecoveryPercent: 0,
      },
      dataQuality: { completenessPercent: 0, flagsCount: 0, issues: [] },
      schemesMatrix: [],
      periodDeltas: [],
      traceability: [],
    }
  }

  // 3. Fetch Operational & Commercial Data in Parallel
  const [sourcesRows, prodLogRows, meterReadingsRows, billingRows, targetRows] = await Promise.all([
    // A. Scheme Sources (Capacity)
    db
      .select({
        schemeId: waterSchemeSource.schemeId,
        practicalCapacityM3Month: waterSchemeSource.practicalCapacityM3Month,
      })
      .from(waterSchemeSource)
      .where(and(inArray(waterSchemeSource.schemeId, schemeIds), eq(waterSchemeSource.active, true))),

    // B. Water Production Logs
    period.id !== "active"
      ? db
          .select({
            schemeId: waterProductionLog.schemeId,
            totalWaterProducedM3: sum(waterProductionLog.waterProducedM3),
            totalWaterSuppliedM3: sum(waterProductionLog.waterSuppliedM3),
            logsCount: count(waterProductionLog.id),
          })
          .from(waterProductionLog)
          .where(and(inArray(waterProductionLog.schemeId, schemeIds), eq(waterProductionLog.billingPeriodId, period.id)))
          .groupBy(waterProductionLog.schemeId)
      : Promise.resolve([]),

    // C. Billed Meter Readings ($M^3$ Sales)
    period.id !== "active"
      ? db
          .select({
            schemeId: waterScheme.id,
            totalConsumptionM3: sum(meterReading.consumption),
            totalBilledAmount: sum(meterReading.billedAmount),
            readingsCount: count(meterReading.id),
          })
          .from(meterReading)
          .innerJoin(
            waterScheme,
            eq(
              waterScheme.id,
              sql`(SELECT "waterSchemeId" FROM customer c WHERE c.id = ${meterReading.customerId})`
            )
          )
          .where(and(inArray(waterScheme.id, schemeIds), eq(meterReading.billingPeriodId, period.id)))
          .groupBy(waterScheme.id)
      : Promise.resolve([]),

    // D. Commercial Billing & Cash Collections
    period.id !== "active"
      ? db
          .select({
            schemeId: waterScheme.id,
            totalCurrentBilled: sum(billingRecord.billAmount),
            totalArrearsBilled: sum(billingRecord.arrears),
            cashToArrears: sum(sql`
              least(
                greatest(0, coalesce(${billingRecord.arrears}, 0)::numeric),
                greatest(0, (coalesce(${billingRecord.arrears}, 0)::numeric + coalesce(${billingRecord.billAmount}, 0)::numeric) - coalesce(${billingRecord.totalDue}, 0)::numeric)
              )
            `),
            cashToCurrent: sum(sql`
              least(
                coalesce(${billingRecord.billAmount}, 0)::numeric,
                greatest(0, ((coalesce(${billingRecord.arrears}, 0)::numeric + coalesce(${billingRecord.billAmount}, 0)::numeric) - coalesce(${billingRecord.totalDue}, 0)::numeric) -
                least(
                  greatest(0, coalesce(${billingRecord.arrears}, 0)::numeric),
                  greatest(0, (coalesce(${billingRecord.arrears}, 0)::numeric + coalesce(${billingRecord.billAmount}, 0)::numeric) - coalesce(${billingRecord.totalDue}, 0)::numeric)
                ))
              )
            `),
            totalDue: sum(billingRecord.totalDue),
          })
          .from(billingRecord)
          .innerJoin(
            waterScheme,
            eq(
              waterScheme.id,
              sql`(SELECT "waterSchemeId" FROM customer c WHERE c.id = ${billingRecord.customerId})`
            )
          )
          .where(and(inArray(waterScheme.id, schemeIds), eq(billingRecord.billingPeriodId, period.id)))
          .groupBy(waterScheme.id)
      : Promise.resolve([]),

    // E. Scheme Targets
    period.id !== "active"
      ? db
          .select({
            schemeId: schemeTarget.schemeId,
            targetProductionM3: schemeTarget.targetProductionM3,
            targetCollectionEfficiencyPercent: schemeTarget.targetCollectionEfficiencyPercent,
          })
          .from(schemeTarget)
          .where(and(inArray(schemeTarget.schemeId, schemeIds), eq(schemeTarget.billingPeriodId, period.id)))
      : Promise.resolve([]),
  ])

  // 4. Map & Aggregate Performance Across Schemes
  let aggProducedM3 = 0
  let aggSuppliedM3 = 0
  let aggSoldM3 = 0
  let aggPracticalCapacityM3 = 0
  let aggCurrentBilledUgx = 0
  let aggCashToArrearsUgx = 0
  let aggCashToCurrentUgx = 0
  let aggTotalArrearsUgx = 0
  let aggArrearsBilledUgx = 0
  let totalLogsCount = 0

  const capacityMap = new Map<string, number>()
  for (const s of sourcesRows) {
    capacityMap.set(s.schemeId, (capacityMap.get(s.schemeId) || 0) + Number(s.practicalCapacityM3Month || 0))
  }

  const prodMap = new Map<string, { prod: number; sup: number; logs: number }>()
  for (const p of prodLogRows) {
    const prod = Number(p.totalWaterProducedM3 || 0)
    const sup = Number(p.totalWaterSuppliedM3 || 0)
    const logs = Number(p.logsCount || 0)
    prodMap.set(p.schemeId, { prod, sup, logs })
    aggProducedM3 += prod
    aggSuppliedM3 += sup
    totalLogsCount += logs
  }

  const salesMap = new Map<string, { sold: number; billed: number }>()
  for (const m of meterReadingsRows) {
    const sold = Number(m.totalConsumptionM3 || 0)
    const billed = Number(m.totalBilledAmount || 0)
    salesMap.set(m.schemeId, { sold, billed })
    aggSoldM3 += sold
  }

  const commMap = new Map<string, { currentBilled: number; cashArrears: number; cashCurrent: number; totalDue: number; arrearsBilled: number }>()
  for (const b of billingRows) {
    const currentBilled = Number(b.totalCurrentBilled || 0)
    const cashArrears = Number(b.cashToArrears || 0)
    const cashCurrent = Number(b.cashToCurrent || 0)
    const totalDue = Number(b.totalDue || 0)
    const arrearsBilled = Number(b.totalArrearsBilled || 0)
    commMap.set(b.schemeId, { currentBilled, cashArrears, cashCurrent, totalDue, arrearsBilled })

    aggCurrentBilledUgx += currentBilled
    aggCashToArrearsUgx += cashArrears
    aggCashToCurrentUgx += cashCurrent
    aggTotalArrearsUgx += totalDue
    aggArrearsBilledUgx += arrearsBilled
  }

  for (const cap of capacityMap.values()) {
    aggPracticalCapacityM3 += cap
  }

  // 5. Build Scheme Performance Matrix Items
  const schemesMatrix: SchemePerformanceMatrixItem[] = activeSchemes.map((sch) => {
    const cap = capacityMap.get(sch.id) || 0
    const pData = prodMap.get(sch.id) || { prod: 0, sup: 0, logs: 0 }
    const sData = salesMap.get(sch.id) || { sold: 0, billed: 0 }
    const cData = commMap.get(sch.id) || { currentBilled: 0, cashArrears: 0, cashCurrent: 0, totalDue: 0, arrearsBilled: 0 }

    const validation = validateWaterBalanceAndCapacity({
      waterProducedM3: pData.prod,
      waterBilledSoldM3: sData.sold,
      loggedDaysCount: pData.logs,
      daysInPeriod: 30,
      practicalCapacityM3Period: cap,
    })

    const totalCash = cData.cashArrears + cData.cashCurrent
    const collEff = cData.currentBilled > 0 ? Math.round((totalCash / cData.currentBilled) * 1000) / 10 : 0

    let statusLabel = "Benchmark unavailable"
    if (cap > 0 && pData.prod > 0) {
      if (validation.capacityUtilizationPercent > 95) statusLabel = "Stressed (>95%)"
      else if (validation.capacityUtilizationPercent >= 75) statusLabel = "Healthy (75-95%)"
      else statusLabel = "Watch (<75%)"
    }

    return {
      schemeId: sch.id,
      schemeName: sch.name,
      branchId: sch.branchId,
      producedM3: pData.prod,
      practicalCapacityM3: cap,
      utilizationPercent: validation.capacityUtilizationPercent,
      soldM3: sData.sold,
      rawLossPercent: validation.rawCalculatedLossIndicator,
      displayLoss: validation.displayLossIndicator,
      currentBilledUgx: cData.currentBilled,
      cashCollectedUgx: totalCash,
      collectionEfficiencyPercent: collEff,
      totalArrearsUgx: cData.totalDue,
      statusLabel,
      dataQualityStatus: validation.lossValidationStatus,
    }
  })

  // 6. Global Validation & KPIs
  const globalValidation = validateWaterBalanceAndCapacity({
    waterProducedM3: aggProducedM3,
    waterBilledSoldM3: aggSoldM3,
    loggedDaysCount: totalLogsCount,
    daysInPeriod: 30 * Math.max(1, activeSchemes.length),
    practicalCapacityM3Period: aggPracticalCapacityM3,
  })

  const totalCollectedUgx = aggCashToArrearsUgx + aggCashToCurrentUgx
  const globalCollectionEff = aggCurrentBilledUgx > 0 ? Math.round((totalCollectedUgx / aggCurrentBilledUgx) * 1000) / 10 : 0
  const globalArrearsRecovery = aggArrearsBilledUgx > 0 ? Math.round((aggCashToArrearsUgx / aggArrearsBilledUgx) * 1000) / 10 : 0

  // 7. Build Traceability Records
  const traceability: TraceableMetric[] = [
    {
      metricName: "Water Production (m³)",
      period: period.periodName,
      scopeName: user.branchId ? "Branch Scope" : "Organization Scope",
      sourceRecordsSummary: `Sum of ${totalLogsCount} water_production_log records across ${activeSchemes.length} schemes`,
      formulaDescription: "sum(water_production_log.waterProducedM3)",
      rawResult: aggProducedM3,
      validationStatus: globalValidation.completenessPercent >= 80 ? "VALID" : "INCOMPLETE_DATA",
      displayedResult: `${aggProducedM3.toLocaleString()} m³`,
    },
    {
      metricName: "Capacity Utilisation %",
      period: period.periodName,
      scopeName: user.branchId ? "Branch Scope" : "Organization Scope",
      sourceRecordsSummary: `Aggregated production (${aggProducedM3.toLocaleString()} m³) ÷ Aggregated practical capacity (${aggPracticalCapacityM3.toLocaleString()} m³)`,
      formulaDescription: "(Total Production m³ ÷ Total Practical Capacity m³) × 100",
      rawResult: globalValidation.capacityUtilizationPercent,
      validationStatus: aggPracticalCapacityM3 > 0 ? "VALID" : "TARGET_UNAVAILABLE",
      displayedResult: aggPracticalCapacityM3 > 0 ? `${globalValidation.capacityUtilizationPercent}%` : "Benchmark unavailable",
    },
    {
      metricName: "Production-to-Sales Loss Indicator %",
      period: period.periodName,
      scopeName: user.branchId ? "Branch Scope" : "Organization Scope",
      sourceRecordsSummary: `Produced: ${aggProducedM3.toLocaleString()} m³, Billed Sold: ${aggSoldM3.toLocaleString()} m³`,
      formulaDescription: "((Produced m³ - Sold m³) ÷ Produced m³) × 100",
      rawResult: globalValidation.rawCalculatedLossIndicator,
      validationStatus: globalValidation.lossValidationStatus,
      displayedResult: globalValidation.displayLossIndicator,
    },
  ]

  return {
    period,
    scope: { level: "organization" },
    kpis: {
      waterProducedM3: aggProducedM3,
      waterSuppliedM3: aggSuppliedM3,
      waterSoldM3: aggSoldM3,
      unbilledLossM3: globalValidation.unbilledLossM3,
      rawCalculatedLossIndicator: globalValidation.rawCalculatedLossIndicator,
      displayLossIndicator: globalValidation.displayLossIndicator,
      lossValidationStatus: globalValidation.lossValidationStatus,
      practicalCapacityM3Month: aggPracticalCapacityM3,
      capacityUtilizationPercent: globalValidation.capacityUtilizationPercent,
      currentBilledUgx: aggCurrentBilledUgx,
      totalCashCollectedUgx: totalCollectedUgx,
      cashToArrearsUgx: aggCashToArrearsUgx,
      cashToCurrentUgx: aggCashToCurrentUgx,
      totalArrearsUgx: aggTotalArrearsUgx,
      collectionEfficiencyPercent: globalCollectionEff,
      arrearsRecoveryPercent: globalArrearsRecovery,
    },
    dataQuality: {
      completenessPercent: globalValidation.completenessPercent,
      flagsCount: globalValidation.dataQualityIssues.length,
      issues: globalValidation.dataQualityIssues,
    },
    schemesMatrix,
    periodDeltas: [],
    traceability,
  }
}
