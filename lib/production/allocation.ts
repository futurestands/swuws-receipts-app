import { kampalaCalendarDate } from "@/lib/billing/period-dates"
import { divideRoundHalfUp } from "./decimal"

/**
 * Month attribution of multi-day measurements.
 *
 * A meter/stock interval is ONE genuine measurement. Its total is never edited. When it lies
 * wholly inside the reporting month the month figure is that measurement (MEASURED). When it
 * crosses a month boundary the data cannot say how the total split, so the month share is a
 * separate ESTIMATED_ALLOCATION with its method and an explicit error bound. The shares of all
 * months are derived from the same unchanged total, so nothing is counted twice in full.
 *
 * Time zone convention: timestamps are persisted as UTC wall-clock (Drizzle `timestamp`, no zone);
 * reporting months are Africa/Kampala calendar months (UTC+3, no daylight saving).
 */
export const KAMPALA_UTC_OFFSET_HOURS = 3
export const ALLOCATION_METHOD_TIME = "TIME_PROPORTIONAL_UNIFORM_RATE" as const
export const ALLOCATION_METHOD_DAYS = "CALENDAR_DAY_PROPORTIONAL_UNIFORM_RATE" as const
export type AllocationMethod = typeof ALLOCATION_METHOD_TIME | typeof ALLOCATION_METHOD_DAYS
export type AllocationBasis = "MEASURED" | "ESTIMATED_ALLOCATION" | "OUTSIDE_MONTH"

export interface Allocation {
  basis: AllocationBasis
  /** Unaltered measured total of the whole interval, hundredths. */
  totalCents: bigint
  /** Share attributed to the requested month, hundredths (equals total when MEASURED). */
  allocatedCents: bigint
  method: AllocationMethod | null
  /** Human-readable assumption, null when MEASURED. */
  uncertainty: string | null
  /**
   * The true month share is unknown but lies within [0, total] when only a uniform-rate assumption is available,
   * so the worst-case absolute error of the estimate is max(allocated, total - allocated). Zero when MEASURED.
   */
  maxAbsoluteErrorCents: bigint
  /** Share of the interval attributed to the month as numerator/denominator (milliseconds or days). */
  fraction: { numerator: number; denominator: number }
}

export function kampalaMonthBounds(month: string): { start: Date; end: Date } {
  const [year, number] = month.split("-").map(Number)
  const startLocal = Date.UTC(year, number - 1, 1) - KAMPALA_UTC_OFFSET_HOURS * 3_600_000
  const endLocal = Date.UTC(year, number, 1) - KAMPALA_UTC_OFFSET_HOURS * 3_600_000
  return { start: new Date(startLocal), end: new Date(endLocal) }
}

/** Kampala calendar dates touched by a half-open interval [opening, closing). */
export function coverageDates(opening: Date, closing: Date): { start: string; end: string } {
  const start = kampalaCalendarDate(opening)
  const lastInstant = new Date(closing.getTime() - 1)
  const end = kampalaCalendarDate(lastInstant)
  return { start, end: end < start ? start : end }
}

const ZERO = BigInt(0)
const UNIFORM_NOTE = "Assumes the quantity accrued at a uniform rate over the whole interval; the true split between months is not measured and may lie anywhere between 0 and the interval total."

function estimate(total: bigint, allocated: bigint, method: AllocationMethod, numerator: number, denominator: number): Allocation {
  const rest = total - allocated
  return { basis: "ESTIMATED_ALLOCATION", totalCents: total, allocatedCents: allocated, method, uncertainty: UNIFORM_NOTE, maxAbsoluteErrorCents: allocated > rest ? allocated : rest, fraction: { numerator, denominator } }
}

/** Instant-based allocation for meter readings with opening/closing timestamps. */
export function allocateByTime(totalCents: bigint, opening: Date, closing: Date, month: string): Allocation {
  const { start, end } = kampalaMonthBounds(month)
  const o = opening.getTime(), c = closing.getTime(), s = start.getTime(), e = end.getTime()
  if (c <= o) throw new Error("Interval closing must be after opening")
  if (c <= s || o >= e) return { basis: "OUTSIDE_MONTH", totalCents, allocatedCents: ZERO, method: null, uncertainty: null, maxAbsoluteErrorCents: ZERO, fraction: { numerator: 0, denominator: c - o } }
  if (o >= s && c <= e) return { basis: "MEASURED", totalCents, allocatedCents: totalCents, method: null, uncertainty: null, maxAbsoluteErrorCents: ZERO, fraction: { numerator: c - o, denominator: c - o } }
  const overlap = Math.min(c, e) - Math.max(o, s)
  return estimate(totalCents, divideRoundHalfUp(totalCents * BigInt(overlap), BigInt(c - o)), ALLOCATION_METHOD_TIME, overlap, c - o)
}

const dayNumber = (date: string) => Math.floor(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 86_400_000)

/** Calendar-day allocation for records that only carry inclusive coverage dates (fuel stock periods). */
export function allocateByDays(totalCents: bigint, startDate: string, endDate: string, month: string): Allocation {
  const first = `${month}-01`
  const [year, number] = month.split("-").map(Number)
  const last = `${month}-${String(new Date(Date.UTC(year, number, 0)).getUTCDate()).padStart(2, "0")}`
  const s = dayNumber(startDate), e = dayNumber(endDate), f = dayNumber(first), l = dayNumber(last)
  if (e < s) throw new Error("Coverage end date precedes start date")
  const days = e - s + 1
  if (e < f || s > l) return { basis: "OUTSIDE_MONTH", totalCents, allocatedCents: ZERO, method: null, uncertainty: null, maxAbsoluteErrorCents: ZERO, fraction: { numerator: 0, denominator: days } }
  if (s >= f && e <= l) return { basis: "MEASURED", totalCents, allocatedCents: totalCents, method: null, uncertainty: null, maxAbsoluteErrorCents: ZERO, fraction: { numerator: days, denominator: days } }
  const overlap = Math.min(e, l) - Math.max(s, f) + 1
  return estimate(totalCents, divideRoundHalfUp(totalCents * BigInt(overlap), BigInt(days)), ALLOCATION_METHOD_DAYS, overlap, days)
}
