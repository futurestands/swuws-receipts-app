import { and, eq, inArray, sql } from "drizzle-orm"
import type { db } from "@/lib/db"
import { billingPeriod, billingRecord, customer, meterReading } from "@/lib/db/schema"
import { fromCents, toCents } from "./decimal"
import type { BilledVolume, PeriodMatch } from "./nrw"

/**
 * Billed water volume for a calendar month, traced to customer meter readings.
 *
 * Billing periods are matched strictly by (year, month) - never by "active" status or collection
 * dates - and ambiguity is surfaced, not resolved by guessing. Only readings that
 *   - belong to a customer assigned to the requested scheme,
 *   - are for the matched billing period,
 *   - are linked to a billing_record of the same customer and period (evidence the reading was billed), and
 *   - have non-negative consumption
 * are summed. Replaces the former `billAmount / 2000.0`, which invented volumes from revenue and
 * ignored the billing period and scheme boundaries.
 */
export async function loadBilledVolumes(client: typeof db, schemeIds: string[], month: string): Promise<{ periodMatch: PeriodMatch; periodId: string | null; bySchemeId: Map<string, BilledVolume> }> {
  const bySchemeId = new Map<string, BilledVolume>()
  if (!schemeIds.length) return { periodMatch: "NONE", periodId: null, bySchemeId }
  const [year, monthNumber] = month.split("-").map(Number)
  const periods = await client.select({ id: billingPeriod.id }).from(billingPeriod).where(and(eq(billingPeriod.year, year), eq(billingPeriod.month, monthNumber))).limit(2)
  if (periods.length !== 1) return { periodMatch: periods.length === 0 ? "NONE" : "AMBIGUOUS", periodId: null, bySchemeId }
  const periodId = periods[0].id
  const meteredCustomer = sql`nullif(btrim(coalesce(${customer.meterRef}, '')), '') is not null`

  const [readingRows, customerRows] = await Promise.all([
    client.select({
      schemeId: customer.waterSchemeId,
      volume: sql<string>`coalesce(sum(${meterReading.consumption}), 0)::text`,
      eligibleReadings: sql<number>`count(*)::int`,
      withReading: sql<number>`count(distinct ${meterReading.customerId}) filter (where ${customer.active} and ${meteredCustomer})::int`,
    }).from(meterReading)
      .innerJoin(customer, eq(customer.id, meterReading.customerId))
      .innerJoin(billingRecord, and(eq(billingRecord.id, meterReading.billingRecordId), eq(billingRecord.customerId, meterReading.customerId), eq(billingRecord.billingPeriodId, meterReading.billingPeriodId)))
      .where(and(inArray(customer.waterSchemeId, schemeIds), eq(meterReading.billingPeriodId, periodId), sql`${meterReading.consumption} >= 0`))
      .groupBy(customer.waterSchemeId),
    client.select({
      schemeId: customer.waterSchemeId,
      metered: sql<number>`count(*) filter (where ${meteredCustomer})::int`,
      unmetered: sql<number>`count(*) filter (where not (${meteredCustomer}))::int`,
    }).from(customer).where(and(inArray(customer.waterSchemeId, schemeIds), eq(customer.active, true))).groupBy(customer.waterSchemeId),
  ])
  for (const schemeId of schemeIds) {
    const readings = readingRows.find(r => r.schemeId === schemeId)
    const customers = customerRows.find(r => r.schemeId === schemeId)
    if (!readings) continue
    bySchemeId.set(schemeId, {
      // meter_reading.consumption is whole cubic metres (bigint); toCents("2400") = 240000n -> fromCents = "2400.00".
      volumeM3: fromCents(toCents(readings.volume)),
      eligibleReadings: Number(readings.eligibleReadings),
      meteredActiveCustomers: Number(customers?.metered ?? 0),
      meteredCustomersWithReading: Number(readings.withReading),
      unmeteredActiveCustomers: Number(customers?.unmetered ?? 0),
    })
  }
  return { periodMatch: "ONE", periodId, bySchemeId }
}
