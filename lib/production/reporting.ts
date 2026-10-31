import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { waterProductionLog as logs, waterSchemeSource as sources, waterProductionElectricity, waterProductionFuel } from "@/lib/db/schema"
import { kampalaCalendarDate } from "@/lib/billing/period-dates"
import { monthSchema } from "./schemas"

export function productionMonth(month: string, now = new Date()) {
  monthSchema.parse(month)
  const [year, number] = month.split("-").map(Number)
  const calendarDays = new Date(Date.UTC(year, number, 0)).getUTCDate()
  const end = new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10)
  const today = kampalaCalendarDate(now)
  const expectedDays = month < today.slice(0, 7) ? calendarDays : month === today.slice(0, 7) ? Number(today.slice(8)) : 0
  const previousMonth = new Date(Date.UTC(year, number - 2, 1)).toISOString().slice(0, 7)
  return { start: `${month}-01`, end, calendarDays, expectedDays, previousMonth }
}

export function coveragePercent(days: number, expected: number) {
  return expected > 0 ? Math.min(100, Math.round((days / expected) * 100)) : 0
}

export type DataQualityStatus = "COMPLETE" | "PARTIAL" | "UNAVAILABLE"

/**
 * SOURCE-AWARE MONTHLY PRODUCTION PERFORMANCE ENGINE (Phases 3 & 5)
 *
 * Calculates source-days, genuine coverage, provisional volumes,
 * capacity utilization, and physical NRW without fabricating zero values.
 */
export async function loadProductionSummary(client: typeof db, schemeIds: string[], month: string, extraFilter?: SQL) {
  if (!schemeIds.length) return []
  const bounds = productionMonth(month)
  const dated = sql`${logs.productionDate} >= ${bounds.start}::date and ${logs.productionDate} < ${bounds.end}::date`
  const official = sql`${dated} and ${logs.workflowVersion} = 1 and ${logs.status} = 'verified'`
  const provisional = sql`${dated} and ${logs.workflowVersion} = 1 and ${logs.status} in ('entered','flagged')`

  const elecDated = sql`(${waterProductionElectricity.coverageStartDate} >= ${bounds.start}::date AND ${waterProductionElectricity.coverageStartDate} < ${bounds.end}::date) OR (${waterProductionElectricity.coverageEndDate} >= ${bounds.start}::date AND ${waterProductionElectricity.coverageEndDate} < ${bounds.end}::date)`
  const elecOfficial = sql`${elecDated} and ${waterProductionElectricity.status} = 'verified'`
  const fuelDated = sql`(${waterProductionFuel.coverageStartDate} >= ${bounds.start}::date AND ${waterProductionFuel.coverageStartDate} < ${bounds.end}::date) OR (${waterProductionFuel.coverageEndDate} >= ${bounds.start}::date AND ${waterProductionFuel.coverageEndDate} < ${bounds.end}::date)`
  const fuelOfficial = sql`${fuelDated} and ${waterProductionFuel.status} = 'verified'`

  const [rows, capacityRows, sourceDayRows, elecRows, fuelRows] = await Promise.all([
    client.select({
      schemeId: logs.schemeId,
      totalWaterProducedM3: sql<string>`coalesce(sum(${logs.waterProducedM3}) filter (where ${official}), 0)::text`,
      totalWaterSuppliedM3: sql<string>`coalesce(sum(${logs.waterSuppliedM3}) filter (where ${official}), 0)::text`,
      provisionalProducedM3: sql<string>`coalesce(sum(${logs.waterProducedM3}) filter (where ${provisional}), 0)::text`,
      logsCount: sql<number>`count(*) filter (where ${official})::int`,
      loggedDaysCount: sql<number>`count(distinct ${logs.productionDate}) filter (where ${official})::int`,
      unknownSuppliedCount: sql<number>`count(*) filter (where ${official} and ${logs.waterSuppliedM3} is null)::int`,
      provisionalCount: sql<number>`count(*) filter (where ${provisional})::int`,
      legacyCount: sql<number>`count(*) filter (where ${logs.workflowVersion} = 0 and ${logs.status} <> 'void')::int`,
    }).from(logs).where(and(inArray(logs.schemeId, schemeIds), or(dated, eq(logs.workflowVersion, 0)), extraFilter)).groupBy(logs.schemeId),

    client.select({
      schemeId: sources.schemeId,
      sourceCount: sql<number>`count(*)::int`,
      unconfirmed: sql<number>`count(*) filter (where ${sources.capacityConfirmedAt} is null or ${sources.currentCapacityM3Day} is null)::int`,
      capacity: sql<string>`coalesce(sum(${sources.currentCapacityM3Day}),0)::text`,
    }).from(sources).where(and(inArray(sources.schemeId, schemeIds), eq(sources.active, true))).groupBy(sources.schemeId),

    // Source-Aware Source-Days Verified Count
    client.select({
      schemeId: logs.schemeId,
      verifiedSourceDays: sql<number>`count(distinct concat(${logs.sourceId}, ':', ${logs.productionDate})) filter (where ${official})::int`,
    }).from(logs).where(and(inArray(logs.schemeId, schemeIds), dated, extraFilter)).groupBy(logs.schemeId),

    // Electricity Summary
    client.select({
      schemeId: waterProductionElectricity.schemeId,
      totalKwh: sql<string>`coalesce(sum(${waterProductionElectricity.calculatedConsumedKwh}) filter (where ${elecOfficial}), 0)::text`,
      totalCostUgx: sql<string>`coalesce(sum(${waterProductionElectricity.electricityCostUgx}) filter (where ${elecOfficial}), 0)::text`,
    }).from(waterProductionElectricity).where(and(inArray(waterProductionElectricity.schemeId, schemeIds), elecDated)).groupBy(waterProductionElectricity.schemeId),

    // Fuel Summary
    client.select({
      schemeId: waterProductionFuel.schemeId,
      totalLitres: sql<string>`coalesce(sum(${waterProductionFuel.calculatedConsumedLitres}) filter (where ${fuelOfficial}), 0)::text`,
      totalCostUgx: sql<string>`coalesce(sum(${waterProductionFuel.fuelExpenditureUgx}) filter (where ${fuelOfficial}), 0)::text`,
    }).from(waterProductionFuel).where(and(inArray(waterProductionFuel.schemeId, schemeIds), fuelDated)).groupBy(waterProductionFuel.schemeId),
  ])

  return schemeIds.map(schemeId => {
    const row = rows.find(r => r.schemeId === schemeId)
    const cap = capacityRows.find(r => r.schemeId === schemeId)
    const srcDayRow = sourceDayRows.find(r => r.schemeId === schemeId)
    const elecRow = elecRows.find(r => r.schemeId === schemeId)
    const fuelRow = fuelRows.find(r => r.schemeId === schemeId)

    const logsCount = Number(row?.logsCount ?? 0)
    const sourceCount = Number(cap?.sourceCount ?? 0)
    const expectedDays = bounds.expectedDays
    const loggedDaysCount = Number(row?.loggedDaysCount ?? 0)

    const requiredSourceDays = sourceCount > 0 ? sourceCount * expectedDays : expectedDays
    const verifiedSourceDays = Number(srcDayRow?.verifiedSourceDays ?? 0)
    const missingSourceDays = Math.max(0, requiredSourceDays - verifiedSourceDays)

    const completenessPct = requiredSourceDays > 0 ? Math.min(100, Math.round((verifiedSourceDays / requiredSourceDays) * 100)) : 0
    const isComplete = completenessPct >= 100
    const dataQualityStatus: DataQualityStatus = logsCount === 0 ? "UNAVAILABLE" : isComplete ? "COMPLETE" : "PARTIAL"

    const totalProducedM3Num = Number(row?.totalWaterProducedM3 ?? "0")
    const averageDailyProducedM3 = loggedDaysCount > 0 ? totalProducedM3Num / loggedDaysCount : null
    const estimatedMonthlyProjectionM3 = loggedDaysCount > 0 ? (totalProducedM3Num / loggedDaysCount) * bounds.calendarDays : null

    // Energy calculations
    const totalKwh = Number(elecRow?.totalKwh ?? 0)
    const totalFuelLitres = Number(fuelRow?.totalLitres ?? 0)
    const totalEnergyCostUgx = Number(elecRow?.totalCostUgx ?? 0) + Number(fuelRow?.totalCostUgx ?? 0)

    // ONLY compute intensities if water production exists and data is complete
    let kwhPerM3: number | null = null
    let fuelPerM3: number | null = null
    if (isComplete && totalProducedM3Num > 0) {
      if (totalKwh > 0) kwhPerM3 = Number((totalKwh / totalProducedM3Num).toFixed(3))
      if (totalFuelLitres > 0) fuelPerM3 = Number((totalFuelLitres / totalProducedM3Num).toFixed(3))
    }

    return {
      schemeId,
      month,
      totalWaterProducedM3: row?.totalWaterProducedM3 ?? "0",
      totalWaterSuppliedM3: row?.totalWaterSuppliedM3 ?? "0",
      provisionalProducedM3: row?.provisionalProducedM3 ?? "0",
      provisionalCount: Number(row?.provisionalCount ?? 0),
      legacyCount: Number(row?.legacyCount ?? 0),
      logsCount,
      loggedDaysCount,
      unknownSuppliedCount: Number(row?.unknownSuppliedCount ?? 0),
      available: logsCount > 0,
      suppliedComplete: logsCount > 0 && Number(row?.unknownSuppliedCount ?? 0) === 0,
      expectedDays,
      coveragePercent: completenessPct,
      sourceCount,
      requiredSourceDays,
      verifiedSourceDays,
      missingSourceDays,
      dataQualityStatus,
      averageDailyProducedM3,
      estimatedMonthlyProjectionM3,
      currentCapacityM3Month: cap && Number(cap.unconfirmed) === 0 ? Number(cap.capacity) * bounds.calendarDays : null,
      benchmarkLabel: "Confirmed current configuration; not historical installed capacity",
      energy: {
        totalKwh,
        totalFuelLitres,
        totalEnergyCostUgx,
        kwhPerM3,
        fuelPerM3
      }
    }
  })
}

export type ProductionSummary = Awaited<ReturnType<typeof loadProductionSummary>>[number]
