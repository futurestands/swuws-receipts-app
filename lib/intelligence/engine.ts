import { loadProductionSummary, productionMonth } from "@/lib/production/reporting"
import { nonNegativeNumber } from "@/lib/decision-support/data-validation"
import { kampalaCalendarDate } from "@/lib/billing/period-dates"
import { db } from "@/lib/db"
import { waterScheme, billingPeriod, billingRecord, meterReading, schemeTarget, intelligenceFinding } from "@/lib/db/schema"
import { eq, and, sql, sum, count, desc, inArray } from "drizzle-orm"
import { UserPermissionsContext } from "@/lib/permissions"
import { applyIntelligenceSchemeFilter } from "./scope"
import { intelligenceMutationFilter } from "@/lib/production/scope"
import { evaluateDataQuality } from "./data-quality"
import { evaluateCapacityUtilization } from "./capacity"
import { evaluateProductionTrends } from "./production"
import { evaluateNrwLoss } from "./nrw"
import { evaluateCommercialPerformance } from "./commercial"
import { evaluateTargetsVariance } from "./targets"
import { calculatePeriodDelta } from "./trends"
import {
  StructuredFinding,
  IntelligenceFilters,
  IntelligenceSummaryKPIs,
  PeriodChangeItem,
  PriorityInvestigationItem,
} from "./types"

export async function runIntelligenceEngine(
  user: UserPermissionsContext,
  filters: IntelligenceFilters = {}
): Promise<{
  findings: StructuredFinding[]
  kpis: IntelligenceSummaryKPIs
  periodChanges: PeriodChangeItem[]
  priorityInvestigations: PriorityInvestigationItem[]
}> {
  // 1. Build Scope Filter
  const schemeScopeCondition = applyIntelligenceSchemeFilter(user, filters.schemeId)

  // 2. Fetch Schemes in User Scope
  const schemesCondition = schemeScopeCondition ? and(eq(waterScheme.active, true), schemeScopeCondition) : eq(waterScheme.active, true)
  const activeSchemes = await db
    .select({
      id: waterScheme.id,
      name: waterScheme.name,
      branchId: waterScheme.branchId,
    })
    .from(waterScheme)
    .where(schemesCondition)

  if (activeSchemes.length === 0) {
    return {
      findings: [],
      kpis: {
        criticalCount: 0,
        highPriorityCount: 0,
        watchCount: 0,
        dataQualityCount: 0,
        schemesNeedingAttentionCount: 0,
        potentialFinancialImpactUgx: 0,
      },
      periodChanges: [],
      priorityInvestigations: [],
    }
  }

  const schemeIds = activeSchemes.map((s) => s.id)

  // 3. Resolve Active or Selected Billing Period
  let selectedPeriod: { id: string; periodName: string; year: number; month: number } | undefined
  if (filters.periodId && filters.periodId !== "all") {
    const [p] = await db
      .select({ id: billingPeriod.id, periodName: billingPeriod.periodName, year: billingPeriod.year, month: billingPeriod.month })
      .from(billingPeriod)
      .where(eq(billingPeriod.id, filters.periodId))
      .limit(1)
    selectedPeriod = p
  } else {
    const [p] = await db
      .select({ id: billingPeriod.id, periodName: billingPeriod.periodName, year: billingPeriod.year, month: billingPeriod.month })
      .from(billingPeriod)
      .where(eq(billingPeriod.status, "active"))
      .orderBy(desc(billingPeriod.year), desc(billingPeriod.month))
      .limit(1)
    selectedPeriod = p
  }

  const periodId = selectedPeriod?.id
  const periodName = selectedPeriod?.periodName || "Current Period"

  const productionMonthKey = selectedPeriod ? `${selectedPeriod.year}-${String(selectedPeriod.month).padStart(2, "0")}` : kampalaCalendarDate(new Date()).slice(0, 7)
  const productionBounds = productionMonth(productionMonthKey)
  // 4. Gather DB Data Across Schemes in Parallel
  const [prodLogRows, previousRows, meterReadingsRows, billingRows, targetRows, persistedFindings] = await Promise.all([
    loadProductionSummary(db, schemeIds, productionMonthKey),
    loadProductionSummary(db, schemeIds, productionBounds.previousMonth),

    // C. Billed Meter Readings ($M^3$ sold / consumption)
    periodId
      ? db
          .select({
            schemeId: waterScheme.id,
            totalConsumptionM3: sum(meterReading.consumption),
            totalBilledAmount: sum(meterReading.billedAmount),
            readingsCount: count(meterReading.id),
          })
          .from(meterReading)
          .innerJoin(waterScheme, eq(waterScheme.id, sql`
            (SELECT "waterSchemeId" FROM customer c WHERE c.id = ${meterReading.customerId})
          `))
          .where(and(inArray(waterScheme.id, schemeIds), eq(meterReading.billingPeriodId, periodId)))
          .groupBy(waterScheme.id)
      : Promise.resolve([]),

    // D. Billing & Arrears Records
    periodId
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
          .innerJoin(waterScheme, eq(waterScheme.id, sql`
            (SELECT "waterSchemeId" FROM customer c WHERE c.id = ${billingRecord.customerId})
          `))
          .where(and(inArray(waterScheme.id, schemeIds), eq(billingRecord.billingPeriodId, periodId)))
          .groupBy(waterScheme.id)
      : Promise.resolve([]),

    // E. Scheme Targets
    periodId
      ? db
          .select({
            schemeId: schemeTarget.schemeId,
            targetProductionM3: schemeTarget.targetProductionM3,
            targetCollectionEfficiencyPercent: schemeTarget.targetCollectionEfficiencyPercent,
          })
          .from(schemeTarget)
          .where(and(inArray(schemeTarget.schemeId, schemeIds), eq(schemeTarget.billingPeriodId, periodId)))
      : Promise.resolve([]),

    // F. Persisted Findings
    db
      .select()
      .from(intelligenceFinding)
      .where(inArray(intelligenceFinding.schemeId, schemeIds)),
  ])

  // 5. Build Lookups
  const sourcesByScheme = new Map<string, number>()
  const capacityByScheme = new Map<string, number>()
  for (const p of prodLogRows) {
    sourcesByScheme.set(p.schemeId, p.sourceCount)
    capacityByScheme.set(p.schemeId, p.currentCapacityM3Month ?? 0)
  }
  const prodByScheme = new Map(prodLogRows.map(p => [p.schemeId, { producedM3: Number(p.totalWaterProducedM3), logsCount: p.logsCount, days: p.loggedDaysCount }]))

  const salesByScheme = new Map<string, { soldM3: number; billedUgx: number; count: number }>()
  for (const m of meterReadingsRows) {
    salesByScheme.set(m.schemeId, {
      soldM3: Number(m.totalConsumptionM3 || 0),
      billedUgx: Number(m.totalBilledAmount || 0),
      count: Number(m.readingsCount || 0),
    })
  }

  const billingByScheme = new Map<string, { currentBilled: number; cashCollected: number; totalArrears: number }>()
  for (const b of billingRows) {
    const cashToArrears = Number(b.cashToArrears || 0)
    const cashToCurrent = Number(b.cashToCurrent || 0)
    billingByScheme.set(b.schemeId, {
      currentBilled: Number(b.totalCurrentBilled || 0),
      cashCollected: cashToArrears + cashToCurrent,
      totalArrears: Number(b.totalDue || 0),
    })
  }

  const targetByScheme = new Map<string, { targetProd?: number; targetColl?: number }>()
  for (const t of targetRows) {
    targetByScheme.set(t.schemeId, {
      targetProd: nonNegativeNumber(t.targetProductionM3) ?? undefined,
      targetColl: nonNegativeNumber(t.targetCollectionEfficiencyPercent) ?? undefined,
    })
  }

  // 6. Run Rule Evaluators Deterministically Across Schemes
  const generatedFindings: StructuredFinding[] = []
  const periodChanges: PeriodChangeItem[] = []

  const daysInPeriod = productionBounds.expectedDays

  for (const sch of activeSchemes) {
    const sourcesCount = sourcesByScheme.get(sch.id) || 0
    const practicalCapacity = capacityByScheme.get(sch.id) || 0
    const prodData = prodByScheme.get(sch.id) || { producedM3: 0, logsCount: 0, days: 0 }
    const salesData = salesByScheme.get(sch.id) || { soldM3: 0, billedUgx: 0, count: 0 }
    const commData = billingByScheme.get(sch.id) || { currentBilled: 0, cashCollected: 0, totalArrears: 0 }
    const tgtData = targetByScheme.get(sch.id) || {}

    const loggedDays = prodData.days
    const dataCompleteness = Math.min(100, Math.round((loggedDays / Math.max(1, daysInPeriod)) * 100))

    // Domain A: Data Quality
    const dqFindings = evaluateDataQuality({
      schemeId: sch.id,
      schemeName: sch.name,
      branchId: sch.branchId,
      periodName,
      sourcesCount,
      productionLogsCount: prodData.logsCount,
      meterReadingsCount: salesData.count,
      daysInPeriod,
      loggedDaysCount: loggedDays,
      hasTargets: Boolean(tgtData.targetProd || tgtData.targetColl),
    })
    generatedFindings.push(...dqFindings)

    // Domain B: Capacity
    const capFindings = evaluateCapacityUtilization({
      schemeId: sch.id,
      schemeName: sch.name,
      branchId: sch.branchId,
      periodName,
      practicalCapacityM3Month: practicalCapacity,
      actualProductionM3Month: prodData.producedM3,
      dataCompletenessPercent: dataCompleteness,
    })
    generatedFindings.push(...capFindings)

    // Domain C: Production Trends
    const previous = previousRows.find(p => p.schemeId === sch.id)
    // Compare completed calendar months only: a partial current month is not a comparable total.
    const comparable = productionMonthKey < kampalaCalendarDate(new Date()).slice(0, 7) && dataCompleteness >= 60 && previous && previous.coveragePercent >= 60 && previous.available
    const prodFindings = comparable ? evaluateProductionTrends({
      schemeId: sch.id,
      schemeName: sch.name,
      branchId: sch.branchId,
      periodName,
      currentProductionM3: prodData.producedM3,
      previousProductionM3: Number(previous.totalWaterProducedM3),
      historicalAvgProductionM3: 0,
      dataCompletenessPercent: dataCompleteness,
    }) : []
    generatedFindings.push(...prodFindings)

    // Domain D: NRW / Production-to-Sales Loss
    const nrwFindings = evaluateNrwLoss({
      schemeId: sch.id,
      schemeName: sch.name,
      branchId: sch.branchId,
      periodName,
      waterProducedM3: prodData.producedM3,
      waterBilledSoldM3: salesData.soldM3,
      salesAvailable: salesByScheme.has(sch.id),
      dataCompletenessPercent: dataCompleteness,
    })
    generatedFindings.push(...nrwFindings)

    // Domain E: Commercial
    const commFindings = evaluateCommercialPerformance({
      schemeId: sch.id,
      schemeName: sch.name,
      branchId: sch.branchId,
      periodName,
      totalBilledUgx: salesData.billedUgx,
      currentBilledUgx: commData.currentBilled,
      totalCashCollectedUgx: commData.cashCollected,
      collectionBasis: "balance_inference",
      cashToArrearsUgx: commData.cashCollected,
      totalArrearsUgx: commData.totalArrears,
      dataCompletenessPercent: dataCompleteness,
    })
    generatedFindings.push(...commFindings)

    // Domain F: Targets
    const tgtFindings = evaluateTargetsVariance({
      schemeId: sch.id,
      schemeName: sch.name,
      branchId: sch.branchId,
      periodName,
      targetProductionM3: tgtData.targetProd,
      actualProductionM3: prodData.producedM3,
      targetCollectionEfficiencyPercent: tgtData.targetColl,
      actualCollectionEfficiencyPercent: undefined, // Balance estimates do not verify collection target achievement.
      dataCompletenessPercent: dataCompleteness,
    })
    generatedFindings.push(...tgtFindings)

    // Domain G: Trends / "What Changed?"
    if (comparable) {
      const delta = calculatePeriodDelta({
        schemeId: sch.id,
        schemeName: sch.name,
        metric: "Water Production",
        currentValue: prodData.producedM3,
        previousValue: Number(previous.totalWaterProducedM3),
        unit: "m³",
        higherIsBetter: true,
      })
      if (delta) periodChanges.push(delta)
    }
  }

  // Combine generated findings with DB persisted findings
  const [investigationSchemes, dismissalSchemes] = await Promise.all([
    db.select({ id: waterScheme.id }).from(waterScheme).where(intelligenceMutationFilter(user, "intelligence.investigate")),
    db.select({ id: waterScheme.id }).from(waterScheme).where(intelligenceMutationFilter(user, "intelligence.dismiss")),
  ])
  const mayInvestigate = new Set(investigationSchemes.map(s => s.id))
  const mayDismiss = new Set(dismissalSchemes.map(s => s.id))
  const persistedById = new Map(persistedFindings.map(f => [f.id, f]))
  const allFindings = generatedFindings.map(f => {
    const candidate = persistedById.get(f.id)
    // Rule IDs are scheme-based; never carry an old month's disposition into a new one.
    const saved = candidate?.reportingPeriod === f.reportingPeriod ? candidate : undefined
    return { ...f, ...(saved ? { status: saved.status as StructuredFinding["status"], assignedToUserId: saved.assignedToUserId, resolutionNotes: saved.resolutionNotes, resolvedAt: saved.resolvedAt } : {}), capabilities: { investigate: mayInvestigate.has(f.schemeId ?? ""), dismiss: mayDismiss.has(f.schemeId ?? "") } }
  })

  // Filter Findings by UI Filters
  let filteredFindings = allFindings
  if (filters.category && filters.category !== "all") {
    filteredFindings = filteredFindings.filter((f) => f.category === filters.category)
  }
  if (filters.severity && filters.severity !== "all") {
    filteredFindings = filteredFindings.filter((f) => f.severity === filters.severity)
  }
  if (filters.status && filters.status !== "all") {
    filteredFindings = filteredFindings.filter((f) => f.status === filters.status)
  }

  // 7. Calculate Summary KPIs
  const criticalCount = allFindings.filter((f) => f.severity === "critical").length
  const highPriorityCount = allFindings.filter((f) => f.severity === "high").length
  const watchCount = allFindings.filter((f) => f.severity === "watch").length
  const dataQualityCount = allFindings.filter((f) => f.category === "data_quality").length

  const schemesNeedingAttention = new Set(
    allFindings.filter((f) => f.severity === "critical" || f.severity === "high").map((f) => f.schemeId)
  )

  // Calculate legitimate financial exposure (uncollected bill demand from commercial findings)
  let potentialImpactUgx = 0
  for (const f of allFindings) {
    if (f.category === "commercial" && f.evidence.additionalDetails?.uncollectedUgx) {
      potentialImpactUgx += Number(f.evidence.additionalDetails.uncollectedUgx)
    }
  }

  const kpis: IntelligenceSummaryKPIs = {
    criticalCount,
    highPriorityCount,
    watchCount,
    dataQualityCount,
    schemesNeedingAttentionCount: schemesNeedingAttention.size,
    potentialFinancialImpactUgx: potentialImpactUgx > 0 ? potentialImpactUgx : 0,
  }

  // 8. Generate Priority Investigations ("What Should I Investigate?")
  const priorityInvestigations: PriorityInvestigationItem[] = allFindings
    .filter((f) => f.severity === "critical" || f.severity === "high")
    .map((f, idx) => ({
      id: `prio-${idx}-${f.schemeId}`,
      schemeId: f.schemeId || "",
      schemeName: f.schemeName || "Scheme",
      category: f.category,
      severity: f.severity,
      title: f.title,
      whatHappened: f.description,
      evidenceSummary: `Actual: ${f.evidence.actual} ${f.evidence.unit || ""}` + (f.evidence.baseline ? ` (Baseline: ${f.evidence.baseline})` : ""),
      whyItMatters: f.observation || "Requires operational verification.",
      whatShouldBeChecked: f.recommendation || "Check source pumps, daily production logs, and collection records.",
      confidence: f.confidence,
      priorityScore: f.severity === "critical" ? 100 - idx : 80 - idx,
      findingId: f.id,
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore)

  return {
    findings: filteredFindings,
    kpis,
    periodChanges,
    priorityInvestigations,
  }
}
