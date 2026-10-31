import "server-only"
import { db } from "@/lib/db"
import { waterScheme, branch, cluster, customer, billingRecord } from "@/lib/db/schema"
import { loadProductionSummary } from "@/lib/production/reporting"
import { eq, inArray, sql } from "drizzle-orm"

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
  dataQualityStatus: "COMPLETE" | "PARTIAL" | "UNAVAILABLE"
  requiredSourceDays: number
  verifiedSourceDays: number
  missingSourceDays: number
  completenessPercent: number
  verifiedProducedM3: number
  provisionalProducedM3: number
  averageDailyProducedM3: number | null
  monthlyCapacityM3: number | null
  capacityUtilizationPercent: number | null
  billedConsumptionM3: number | null
  physicalNrwPercent: number | null
  energy?: {
    totalKwh: number
    totalFuelLitres: number
    totalEnergyCostUgx: number
    kwhPerM3: number | null
    fuelPerM3: number | null
  }
}

export interface MonthlyProductionReportOutput {
  generatedAt: string
  reportingMonth: string
  scope: string
  totals: {
    totalSchemes: number
    completeSchemesCount: number
    partialSchemesCount: number
    unavailableSchemesCount: number
    totalVerifiedProducedM3: number
    totalBilledConsumptionM3: number
    overallCompletenessPercent: number
    overallPhysicalNrwPercent: number | null
  }
  items: MonthlyProductionReportItem[]
}

export async function generateMonthlyWaterProductionReport(
  filters: MonthlyProductionReportFilter
): Promise<MonthlyProductionReportOutput> {
  const { month, clusterId, branchId, schemeId } = filters

  // 1. Query target schemes matching filters
  const baseQuery = db
    .select({
      id: waterScheme.id,
      name: waterScheme.name,
      branchName: branch.name,
      clusterName: cluster.name,
    })
    .from(waterScheme)
    .innerJoin(branch, eq(branch.id, waterScheme.branchId))
    .innerJoin(cluster, eq(cluster.id, branch.clusterId))

  const targetSchemes = schemeId
    ? await baseQuery.where(eq(waterScheme.id, schemeId))
    : branchId
    ? await baseQuery.where(eq(waterScheme.branchId, branchId))
    : clusterId
    ? await baseQuery.where(eq(branch.clusterId, clusterId))
    : await baseQuery

  const schemeIds = targetSchemes.map((s: { id: string }) => s.id)

  if (!schemeIds.length) {
    return {
      generatedAt: new Date().toISOString(),
      reportingMonth: month,
      scope: "No matching schemes found",
      totals: {
        totalSchemes: 0,
        completeSchemesCount: 0,
        partialSchemesCount: 0,
        unavailableSchemesCount: 0,
        totalVerifiedProducedM3: 0,
        totalBilledConsumptionM3: 0,
        overallCompletenessPercent: 0,
        overallPhysicalNrwPercent: null,
      },
      items: [],
    }
  }

  // 2. Load Production Summaries
  const summaries = await loadProductionSummary(db, schemeIds, month)

  // 3. Query Billed Consumption per Scheme
  const billingRows = await db
    .select({
      schemeId: customer.waterSchemeId,
      totalBilledM3: sql<string>`coalesce(sum(${billingRecord.billAmount} / 2000.0), 0)::text`,
    })
    .from(billingRecord)
    .innerJoin(customer, eq(customer.id, billingRecord.customerId))
    .where(inArray(customer.waterSchemeId, schemeIds))
    .groupBy(customer.waterSchemeId)

  const billingMap = new Map<string, number>()
  for (const r of billingRows) {
    if (r.schemeId) {
      billingMap.set(r.schemeId, Number(r.totalBilledM3))
    }
  }

  // 4. Build Report Items
  let totalVerifiedProducedM3 = 0
  let totalBilledConsumptionM3 = 0
  let totalRequiredSourceDays = 0
  let totalVerifiedSourceDays = 0
  let completeSchemesCount = 0
  let partialSchemesCount = 0
  let unavailableSchemesCount = 0

  const items: MonthlyProductionReportItem[] = targetSchemes.map((sch: { id: string; name: string; branchName: string; clusterName: string }) => {
    const sum = summaries.find((s) => s.schemeId === sch.id)
    const verifiedProduced = Number(sum?.totalWaterProducedM3 ?? 0)
    const provisionalProduced = Number(sum?.provisionalProducedM3 ?? 0)
    const status = sum?.dataQualityStatus ?? "UNAVAILABLE"

    if (status === "COMPLETE") completeSchemesCount++
    else if (status === "PARTIAL") partialSchemesCount++
    else unavailableSchemesCount++

    totalVerifiedProducedM3 += verifiedProduced
    const reqDays = sum?.requiredSourceDays ?? 30
    const verDays = sum?.verifiedSourceDays ?? 0
    totalRequiredSourceDays += reqDays
    totalVerifiedSourceDays += verDays

    const monthlyCap = sum?.currentCapacityM3Month ?? null
    let capUtilPct: number | null = null
    if (monthlyCap && monthlyCap > 0 && status === "COMPLETE") {
      capUtilPct = Math.round((verifiedProduced / monthlyCap) * 100)
    }

    const billedM3 = billingMap.get(sch.id) ?? null
    if (billedM3 !== null) totalBilledConsumptionM3 += billedM3

    let nrwPct: number | null = null
    if (verifiedProduced > 0 && billedM3 !== null && status === "COMPLETE") {
      nrwPct = Math.max(0, Math.round(((verifiedProduced - billedM3) / verifiedProduced) * 100))
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
      completenessPercent: sum?.coveragePercent ?? 0,
      verifiedProducedM3: verifiedProduced,
      provisionalProducedM3: provisionalProduced,
      averageDailyProducedM3: sum?.averageDailyProducedM3 ?? null,
      monthlyCapacityM3: monthlyCap,
      capacityUtilizationPercent: capUtilPct,
      billedConsumptionM3: billedM3,
      physicalNrwPercent: nrwPct,
      energy: sum?.energy,
    }
  })

  const overallCompleteness = totalRequiredSourceDays > 0 ? Math.round((totalVerifiedSourceDays / totalRequiredSourceDays) * 100) : 0
  let overallNrw: number | null = null
  if (totalVerifiedProducedM3 > 0 && totalBilledConsumptionM3 > 0 && overallCompleteness === 100) {
    overallNrw = Math.max(0, Math.round(((totalVerifiedProducedM3 - totalBilledConsumptionM3) / totalVerifiedProducedM3) * 100))
  }

  return {
    generatedAt: new Date().toISOString(),
    reportingMonth: month,
    scope: schemeId ? `Scheme: ${schemeIds[0]}` : branchId ? `Branch: ${branchId}` : clusterId ? `Cluster: ${clusterId}` : "SWUWS Overall",
    totals: {
      totalSchemes: targetSchemes.length,
      completeSchemesCount,
      partialSchemesCount,
      unavailableSchemesCount,
      totalVerifiedProducedM3,
      totalBilledConsumptionM3,
      overallCompletenessPercent: overallCompleteness,
      overallPhysicalNrwPercent: overallNrw,
    },
    items,
  }
}
