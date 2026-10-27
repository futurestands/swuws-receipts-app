import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { waterProductionLog as logs, waterSchemeSource as sources } from "@/lib/db/schema"
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
  return expected > 0 ? Math.min(100, Math.round(days / expected * 100)) : 0
}

/** Single eligibility rule for workspace, intelligence and management reporting. */
export async function loadProductionSummary(client: typeof db, schemeIds: string[], month: string, extraFilter?: SQL) {
  if (!schemeIds.length) return []
  const bounds = productionMonth(month)
  const dated = sql`${logs.productionDate} >= ${bounds.start}::date and ${logs.productionDate} < ${bounds.end}::date`
  const official = sql`${dated} and ${logs.workflowVersion} = 1 and ${logs.status} = 'verified'`
  const provisional = sql`${dated} and ${logs.workflowVersion} = 1 and ${logs.status} in ('entered','flagged')`
  const [rows, capacityRows] = await Promise.all([
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
    client.select({ schemeId: sources.schemeId, sourceCount: sql<number>`count(*)::int`,
      unconfirmed: sql<number>`count(*) filter (where ${sources.capacityConfirmedAt} is null or ${sources.currentCapacityM3Day} is null)::int`,
      capacity: sql<string>`coalesce(sum(${sources.currentCapacityM3Day}),0)::text`,
    }).from(sources).where(and(inArray(sources.schemeId, schemeIds), eq(sources.active, true))).groupBy(sources.schemeId),
  ])
  return schemeIds.map(schemeId => {
    const row = rows.find(r => r.schemeId === schemeId)
    const cap = capacityRows.find(r => r.schemeId === schemeId)
    const logsCount = Number(row?.logsCount ?? 0)
    return {
      schemeId, month,
      totalWaterProducedM3: row?.totalWaterProducedM3 ?? "0",
      totalWaterSuppliedM3: row?.totalWaterSuppliedM3 ?? "0",
      provisionalProducedM3: row?.provisionalProducedM3 ?? "0",
      provisionalCount: Number(row?.provisionalCount ?? 0), legacyCount: Number(row?.legacyCount ?? 0),
      logsCount, loggedDaysCount: Number(row?.loggedDaysCount ?? 0),
      unknownSuppliedCount: Number(row?.unknownSuppliedCount ?? 0),
      available: logsCount > 0,
      suppliedComplete: logsCount > 0 && Number(row?.unknownSuppliedCount ?? 0) === 0,
      expectedDays: bounds.expectedDays,
      coveragePercent: coveragePercent(Number(row?.loggedDaysCount ?? 0), bounds.expectedDays),
      sourceCount: Number(cap?.sourceCount ?? 0),
      currentCapacityM3Month: cap && Number(cap.unconfirmed) === 0 ? Number(cap.capacity) * bounds.calendarDays : null,
      benchmarkLabel: "Confirmed current configuration; not historical installed capacity",
    }
  })
}
export type ProductionSummary = Awaited<ReturnType<typeof loadProductionSummary>>[number]
