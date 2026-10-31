import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm"
import type { AnyPgColumn } from "drizzle-orm/pg-core"
import type { db } from "@/lib/db"
import { waterProductionLog as logs, waterSchemeSource as sources, waterProductionElectricity, waterProductionFuel, waterProductionInterval as intervals, waterSchemeEnergyAsset as energyAssets } from "@/lib/db/schema"
import { kampalaCalendarDate } from "@/lib/billing/period-dates"
import { monthSchema } from "./schemas"
import { allocateByDays, allocateByTime, ALLOCATION_METHOD_DAYS, ALLOCATION_METHOD_TIME, type Allocation } from "./allocation"
import { fromCents, toCents } from "./decimal"

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

/** Row-level scope for measurement tables that carry their own recordedById (interval, electricity, fuel). */
export type MeasurementScopeFilter = (table: { schemeId: AnyPgColumn; recordedById: AnyPgColumn }) => SQL | undefined

/** One cross-month share. It is an estimate; the underlying measured total is shown unchanged beside it. */
export interface AllocationDetail {
  kind: "water_interval" | "electricity" | "fuel"
  recordId: string
  /** Source id (water) or energy asset id (electricity/fuel). */
  subjectId: string
  basis: "ESTIMATED_ALLOCATION"
  unit: "m3" | "kWh" | "litres"
  measuredTotal: string
  allocatedToMonth: string
  method: typeof ALLOCATION_METHOD_TIME | typeof ALLOCATION_METHOD_DAYS
  uncertainty: string
  maxAbsoluteError: string
  fraction: { numerator: number; denominator: number }
}

const ZERO = BigInt(0)
const MINUTES_PER_DAY = 1440
const cents = (value: string | null | undefined) => (value == null ? ZERO : toCents(value))
const num = (value: bigint) => Number(fromCents(value))

interface SchemeAccumulator {
  intervalMeasuredCents: bigint; intervalMeasuredCount: number; intervalMeasuredMinutes: number
  estimatedWaterCents: bigint; estimatedSourceMinutes: number
  conflictCount: number; conflictCents: bigint
  provisionalIntervalCount: number; provisionalIntervalCents: bigint
  details: AllocationDetail[]
  kwhMeasured: bigint; kwhEstimated: bigint; elecCostMeasured: bigint; elecCostEstimated: bigint; elecMinutesByAsset: Map<string, number>
  fuelMeasured: bigint; fuelEstimated: bigint; fuelCostMeasured: bigint; fuelCostEstimated: bigint; fuelDaysByAsset: Map<string, number>
  fuelUnavailableCount: number; fuelUnreconciledExpenditure: bigint
}
const emptyAccumulator = (): SchemeAccumulator => ({
  intervalMeasuredCents: ZERO, intervalMeasuredCount: 0, intervalMeasuredMinutes: 0, estimatedWaterCents: ZERO, estimatedSourceMinutes: 0,
  conflictCount: 0, conflictCents: ZERO, provisionalIntervalCount: 0, provisionalIntervalCents: ZERO, details: [],
  kwhMeasured: ZERO, kwhEstimated: ZERO, elecCostMeasured: ZERO, elecCostEstimated: ZERO, elecMinutesByAsset: new Map(),
  fuelMeasured: ZERO, fuelEstimated: ZERO, fuelCostMeasured: ZERO, fuelCostEstimated: ZERO, fuelDaysByAsset: new Map(), fuelUnavailableCount: 0, fuelUnreconciledExpenditure: ZERO,
})
const bump = (map: Map<string, number>, key: string, by: number) => map.set(key, (map.get(key) ?? 0) + by)
const detail = (kind: AllocationDetail["kind"], recordId: string, subjectId: string, unit: AllocationDetail["unit"], a: Allocation): AllocationDetail => ({
  kind, recordId, subjectId, basis: "ESTIMATED_ALLOCATION", unit, measuredTotal: fromCents(a.totalCents), allocatedToMonth: fromCents(a.allocatedCents),
  method: a.method!, uncertainty: a.uncertainty!, maxAbsoluteError: fromCents(a.maxAbsoluteErrorCents), fraction: a.fraction,
})

/**
 * SOURCE-AWARE MONTHLY PRODUCTION PERFORMANCE ENGINE
 *
 * Official figures use verified records only and never turn missing data into zero.
 *  - Daily records and verified meter intervals that lie wholly inside the month are MEASURED production.
 *  - A verified interval that crosses a month boundary keeps its single measured total; the share for
 *    this month is reported separately as ESTIMATED_ALLOCATION (method + error bound) and is never
 *    added to measured totals.
 *  - A verified interval whose dates contain any non-void daily record of the same source is excluded
 *    from official totals (counted as a conflict) so the same water is never counted twice.
 *  - Electricity and fuel follow the same measured/estimated split; each consumption record belongs to
 *    one asset and is counted once, so a generator or meter shared by several sources is not duplicated.
 *  - Fuel consumption is known only from a stock reconciliation. Purchases alone never become consumption.
 */
export async function loadProductionSummary(client: typeof db, schemeIds: string[], month: string, extraFilter?: SQL, measurementFilter?: MeasurementScopeFilter) {
  if (!schemeIds.length) return []
  const bounds = productionMonth(month)
  const dated = sql`${logs.productionDate} >= ${bounds.start}::date and ${logs.productionDate} < ${bounds.end}::date`
  const official = sql`${dated} and ${logs.workflowVersion} = 1 and ${logs.status} = 'verified'`
  const provisional = sql`${dated} and ${logs.workflowVersion} = 1 and ${logs.status} in ('entered','flagged')`

  const overlapsMonth = (start: AnyPgColumn, end: AnyPgColumn) => sql`${start} < ${bounds.end}::date and ${end} >= ${bounds.start}::date`
  const dailyConflict = sql<boolean>`exists (select 1 from ${logs} where ${logs.sourceId} = ${intervals.sourceId} and ${logs.workflowVersion} = 1 and ${logs.status} <> 'void' and ${logs.productionDate} between ${intervals.coverageStartDate} and ${intervals.coverageEndDate})`

  // Check whether migration 0075 tables exist in the active search_path without raising or poisoning transactions.
  const [tables] = await client.select({
    hasInterval: sql<boolean>`to_regclass('water_production_interval') is not null`,
    hasElectricity: sql<boolean>`to_regclass('water_production_electricity') is not null`,
    hasFuel: sql<boolean>`to_regclass('water_production_fuel') is not null`,
    hasAsset: sql<boolean>`to_regclass('water_scheme_energy_asset') is not null`,
  }).from(sql`(select 1) as _schema_probe`)

  const [rows, capacityRows, activeSourceRows, intervalRows, elecRows, fuelRows, assetRows] = await Promise.all([
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

    client.select({ id: sources.id, schemeId: sources.schemeId }).from(sources).where(and(inArray(sources.schemeId, schemeIds), eq(sources.active, true))),

    tables?.hasInterval ? client.select({
      id: intervals.id, schemeId: intervals.schemeId, sourceId: intervals.sourceId, status: intervals.status,
      openingTimestamp: intervals.openingTimestamp, closingTimestamp: intervals.closingTimestamp, calculatedVolumeM3: intervals.calculatedVolumeM3,
      conflict: dailyConflict,
    }).from(intervals).where(and(inArray(intervals.schemeId, schemeIds), sql`${intervals.status} <> 'void'`, overlapsMonth(intervals.coverageStartDate, intervals.coverageEndDate), measurementFilter?.(intervals))) : Promise.resolve([]),

    tables?.hasElectricity ? client.select({
      id: waterProductionElectricity.id, schemeId: waterProductionElectricity.schemeId, assetId: waterProductionElectricity.assetId,
      openingTimestamp: waterProductionElectricity.openingTimestamp, closingTimestamp: waterProductionElectricity.closingTimestamp,
      consumedKwh: waterProductionElectricity.calculatedConsumedKwh, costUgx: waterProductionElectricity.electricityCostUgx,
    }).from(waterProductionElectricity).where(and(inArray(waterProductionElectricity.schemeId, schemeIds), eq(waterProductionElectricity.status, "verified"), overlapsMonth(waterProductionElectricity.coverageStartDate, waterProductionElectricity.coverageEndDate), measurementFilter?.(waterProductionElectricity))) : Promise.resolve([]),

    tables?.hasFuel ? client.select({
      id: waterProductionFuel.id, schemeId: waterProductionFuel.schemeId, assetId: waterProductionFuel.assetId,
      coverageStartDate: waterProductionFuel.coverageStartDate, coverageEndDate: waterProductionFuel.coverageEndDate,
      consumedLitres: waterProductionFuel.calculatedConsumedLitres, expenditureUgx: waterProductionFuel.fuelExpenditureUgx,
    }).from(waterProductionFuel).where(and(inArray(waterProductionFuel.schemeId, schemeIds), eq(waterProductionFuel.status, "verified"), overlapsMonth(waterProductionFuel.coverageStartDate, waterProductionFuel.coverageEndDate), measurementFilter?.(waterProductionFuel))) : Promise.resolve([]),

    tables?.hasAsset ? client.select({ id: energyAssets.id, schemeId: energyAssets.schemeId, assetType: energyAssets.assetType }).from(energyAssets).where(and(inArray(energyAssets.schemeId, schemeIds), eq(energyAssets.active, true))) : Promise.resolve([]),
  ])

  const activeSourceIds = new Set(activeSourceRows.map(r => r.id))
  // Distinct verified daily source-days restricted to active sources (required source-days only count active sources).
  const sourceDayRows = activeSourceIds.size
    ? await client.select({
      schemeId: logs.schemeId,
      verifiedSourceDays: sql<number>`count(distinct concat(${logs.sourceId}, ':', ${logs.productionDate})) filter (where ${official})::int`,
    }).from(logs).where(and(inArray(logs.schemeId, schemeIds), inArray(logs.sourceId, [...activeSourceIds]), dated, extraFilter)).groupBy(logs.schemeId)
    : []

  const accumulators = new Map<string, SchemeAccumulator>(schemeIds.map(id => [id, emptyAccumulator()]))

  for (const row of intervalRows) {
    const acc = accumulators.get(row.schemeId)!
    const total = cents(row.calculatedVolumeM3)
    if (row.status !== "verified") { acc.provisionalIntervalCount++; acc.provisionalIntervalCents += total; continue }
    if (row.conflict) { acc.conflictCount++; acc.conflictCents += total; continue }
    const allocation = allocateByTime(total, row.openingTimestamp, row.closingTimestamp, month)
    if (allocation.basis === "OUTSIDE_MONTH") continue
    const counted = activeSourceIds.has(row.sourceId)
    if (allocation.basis === "MEASURED") {
      acc.intervalMeasuredCents += allocation.allocatedCents; acc.intervalMeasuredCount++
      if (counted) acc.intervalMeasuredMinutes += Math.floor((row.closingTimestamp.getTime() - row.openingTimestamp.getTime()) / 60_000)
    } else {
      acc.estimatedWaterCents += allocation.allocatedCents
      if (counted) acc.estimatedSourceMinutes += Math.floor((allocation.fraction.numerator) / 60_000)
      acc.details.push(detail("water_interval", row.id, row.sourceId, "m3", allocation))
    }
  }

  for (const row of elecRows) {
    const acc = accumulators.get(row.schemeId)!
    const allocation = allocateByTime(cents(row.consumedKwh), row.openingTimestamp, row.closingTimestamp, month)
    if (allocation.basis === "OUTSIDE_MONTH") continue
    const cost = row.costUgx == null ? null : allocateByTime(cents(row.costUgx), row.openingTimestamp, row.closingTimestamp, month)
    if (allocation.basis === "MEASURED") {
      acc.kwhMeasured += allocation.allocatedCents
      if (cost) acc.elecCostMeasured += cost.allocatedCents
      bump(acc.elecMinutesByAsset, row.assetId, Math.floor((row.closingTimestamp.getTime() - row.openingTimestamp.getTime()) / 60_000))
    } else {
      acc.kwhEstimated += allocation.allocatedCents
      if (cost) acc.elecCostEstimated += cost.allocatedCents
      acc.details.push(detail("electricity", row.id, row.assetId, "kWh", allocation))
    }
  }

  for (const row of fuelRows) {
    const acc = accumulators.get(row.schemeId)!
    if (row.consumedLitres === null) {
      // Purchases/expenditure without a stock reconciliation: consumption is unknown, not zero, and spend is not consumption.
      acc.fuelUnavailableCount++; acc.fuelUnreconciledExpenditure += cents(row.expenditureUgx)
      continue
    }
    const allocation = allocateByDays(cents(row.consumedLitres), row.coverageStartDate, row.coverageEndDate, month)
    if (allocation.basis === "OUTSIDE_MONTH") continue
    const cost = row.expenditureUgx == null ? null : allocateByDays(cents(row.expenditureUgx), row.coverageStartDate, row.coverageEndDate, month)
    if (allocation.basis === "MEASURED") {
      acc.fuelMeasured += allocation.allocatedCents
      if (cost) acc.fuelCostMeasured += cost.allocatedCents
      bump(acc.fuelDaysByAsset, row.assetId, allocation.fraction.numerator)
    } else {
      acc.fuelEstimated += allocation.allocatedCents
      if (cost) acc.fuelCostEstimated += cost.allocatedCents
      acc.details.push(detail("fuel", row.id, row.assetId, "litres", allocation))
    }
  }

  return schemeIds.map(schemeId => {
    const row = rows.find(r => r.schemeId === schemeId)
    const cap = capacityRows.find(r => r.schemeId === schemeId)
    const srcDayRow = sourceDayRows.find(r => r.schemeId === schemeId)
    const acc = accumulators.get(schemeId)!

    const logsCount = Number(row?.logsCount ?? 0)
    const sourceCount = Number(cap?.sourceCount ?? 0)
    const expectedDays = bounds.expectedDays
    const loggedDaysCount = Number(row?.loggedDaysCount ?? 0)
    const officialRecordCount = logsCount + acc.intervalMeasuredCount

    const requiredSourceDays = sourceCount > 0 ? sourceCount * expectedDays : expectedDays
    // Daily source-days are whole days; measured intervals contribute their exact elapsed time. Compared in whole minutes.
    const verifiedMinutes = Number(srcDayRow?.verifiedSourceDays ?? 0) * MINUTES_PER_DAY + acc.intervalMeasuredMinutes
    const requiredMinutes = requiredSourceDays * MINUTES_PER_DAY
    const verifiedSourceDays = Number((verifiedMinutes / MINUTES_PER_DAY).toFixed(2))
    const missingSourceDays = Number(Math.max(0, (requiredMinutes - verifiedMinutes) / MINUTES_PER_DAY).toFixed(2))
    const estimatedSourceDays = Number((acc.estimatedSourceMinutes / MINUTES_PER_DAY).toFixed(2))

    const completenessPct = requiredMinutes > 0 ? Math.min(100, Math.round((verifiedMinutes / requiredMinutes) * 100)) : 0
    // Exact comparison: 99.6% must not be rounded up to "COMPLETE".
    const isComplete = requiredMinutes > 0 && verifiedMinutes >= requiredMinutes
    const dataQualityStatus: DataQualityStatus = officialRecordCount === 0 ? "UNAVAILABLE" : isComplete ? "COMPLETE" : "PARTIAL"

    const dailyProducedText = row?.totalWaterProducedM3 ?? "0"
    const totalProducedText = acc.intervalMeasuredCents === ZERO ? dailyProducedText : fromCents(cents(dailyProducedText) + acc.intervalMeasuredCents)
    const totalProducedM3Num = Number(totalProducedText)
    const dailyProducedM3Num = Number(dailyProducedText)
    // Complete months: scheme volume per calendar day. Otherwise: legacy mean over days that have a verified daily record.
    const averageDailyProducedM3 = isComplete && expectedDays > 0 ? totalProducedM3Num / expectedDays : loggedDaysCount > 0 ? dailyProducedM3Num / loggedDaysCount : null
    const estimatedMonthlyProjectionM3 = averageDailyProducedM3 !== null ? averageDailyProducedM3 * bounds.calendarDays : null

    // Intensities need energy evidence covering the SAME whole period as complete water production. Shared assets are one record per asset.
    const elecAssets = assetRows.filter(a => a.schemeId === schemeId && a.assetType === "electricity_meter").map(a => a.id)
    const generators = assetRows.filter(a => a.schemeId === schemeId && a.assetType === "generator").map(a => a.id)
    const electricityCoverageComplete = expectedDays > 0 && elecAssets.length > 0 && elecAssets.every(id => (acc.elecMinutesByAsset.get(id) ?? 0) >= expectedDays * MINUTES_PER_DAY)
    const fuelCoverageComplete = expectedDays > 0 && generators.length > 0 && generators.every(id => (acc.fuelDaysByAsset.get(id) ?? 0) >= expectedDays)
    const totalKwh = num(acc.kwhMeasured)
    const totalFuelLitres = num(acc.fuelMeasured)
    const kwhPerM3 = isComplete && totalProducedM3Num > 0 && electricityCoverageComplete ? Number((totalKwh / totalProducedM3Num).toFixed(3)) : null
    const fuelPerM3 = isComplete && totalProducedM3Num > 0 && fuelCoverageComplete ? Number((totalFuelLitres / totalProducedM3Num).toFixed(3)) : null
    const interval = acc.intervalMeasuredCount

    return {
      schemeId,
      month,
      totalWaterProducedM3: totalProducedText,
      dailyVerifiedProducedM3: dailyProducedText,
      intervalMeasuredProducedM3: fromCents(acc.intervalMeasuredCents),
      intervalMeasuredCount: interval,
      totalWaterSuppliedM3: row?.totalWaterSuppliedM3 ?? "0",
      provisionalProducedM3: row?.provisionalProducedM3 ?? "0",
      provisionalCount: Number(row?.provisionalCount ?? 0),
      provisionalIntervalCount: acc.provisionalIntervalCount,
      /** Full, unallocated measured totals of unverified intervals touching the month. Not production until verified. */
      provisionalIntervalTotalM3: fromCents(acc.provisionalIntervalCents),
      legacyCount: Number(row?.legacyCount ?? 0),
      logsCount,
      loggedDaysCount,
      unknownSuppliedCount: Number(row?.unknownSuppliedCount ?? 0),
      available: officialRecordCount > 0,
      // Interval readings record production only: they carry no supplied volume.
      suppliedComplete: logsCount > 0 && interval === 0 && Number(row?.unknownSuppliedCount ?? 0) === 0,
      expectedDays,
      coveragePercent: completenessPct,
      sourceCount,
      requiredSourceDays,
      verifiedSourceDays,
      missingSourceDays,
      estimatedSourceDays,
      dataQualityStatus,
      averageDailyProducedM3,
      estimatedMonthlyProjectionM3,
      currentCapacityM3Month: cap && Number(cap.unconfirmed) === 0 ? Number(cap.capacity) * bounds.calendarDays : null,
      benchmarkLabel: "Confirmed current configuration; not historical installed capacity",
      /** Verified intervals excluded because they overlap daily records of the same source. */
      intervalConflictCount: acc.conflictCount,
      excludedConflictedIntervalM3: fromCents(acc.conflictCents),
      /** Month shares of cross-month intervals. ESTIMATED, kept apart from every measured total above. */
      estimatedAllocation: {
        basis: "ESTIMATED_ALLOCATION" as const,
        producedM3: fromCents(acc.estimatedWaterCents),
        electricityKwh: num(acc.kwhEstimated),
        fuelLitres: num(acc.fuelEstimated),
        electricityCostUgx: num(acc.elecCostEstimated),
        fuelExpenditureUgx: num(acc.fuelCostEstimated),
        present: acc.details.length > 0,
        records: acc.details,
      },
      energy: {
        /** Measured within the month only (cross-month shares are in estimatedAllocation). */
        totalKwh,
        totalFuelLitres,
        totalEnergyCostUgx: num(acc.elecCostMeasured + acc.fuelCostMeasured),
        kwhPerM3,
        fuelPerM3,
        electricityCoverageComplete,
        fuelCoverageComplete,
        /** Verified fuel records without both stock readings: consumption unknown (not zero). */
        fuelUnavailableCount: acc.fuelUnavailableCount,
        fuelUnreconciledExpenditureUgx: num(acc.fuelUnreconciledExpenditure),
      },
    }
  })
}

export type ProductionSummary = Awaited<ReturnType<typeof loadProductionSummary>>[number]
