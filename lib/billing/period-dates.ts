/** Collection dates are calendar days in Uganda, not UTC midnights. */
export const COLLECTION_TIMEZONE = "Africa/Kampala"

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const

export type YearMonth = { year: number; month: number }

export function kampalaCalendarDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: COLLECTION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

/**
 * Collection stays open through the End Date staff typed.
 * It closes at the start of the next Kampala calendar day.
 */
export function periodEndDateHasPassed(endDate: Date, now = new Date()): boolean {
  return kampalaCalendarDate(now) > kampalaCalendarDate(endDate)
}

export function kampalaDaysRemaining(endDate: Date, now = new Date()): number {
  const today = kampalaCalendarDate(now)
  const end = kampalaCalendarDate(endDate)
  const t = Date.parse(`${today}T00:00:00+03:00`)
  const e = Date.parse(`${end}T00:00:00+03:00`)
  return Math.max(0, Math.round((e - t) / 86_400_000))
}

/** Payment belongs to a period if its Uganda calendar day sits inside Start–End. */
export function paymentFallsInPeriod(paymentDate: Date | string, startDate: Date | string, endDate: Date | string): boolean {
  const pay = kampalaCalendarDate(paymentDate)
  return pay >= kampalaCalendarDate(startDate) && pay <= kampalaCalendarDate(endDate)
}

export type PeriodDateWindow = { id: string; status: string; startDate: Date | string; endDate: Date | string }

export type CustomerBillTaken = {
  id?: string
  billingPeriodId: string
  takenAt: Date | string | null
}

function asDate(value?: Date | string | null): Date | null {
  if (value == null || value === "") return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** BillingDate from EBS, else the day the scheme file landed, else row insert time. */
export function effectiveBillTakenDate(bill: {
  billingDate?: Date | string | null
  runUploadedAt?: Date | string | null
  createdAt?: Date | string | null
}): Date | null {
  return asDate(bill.billingDate) ?? asDate(bill.runUploadedAt) ?? asDate(bill.createdAt)
}

export function resolvePeriodIdForPayment(
  paymentDate: Date | string | null,
  periods: PeriodDateWindow[],
  fallbackActiveId?: string | null,
): string | null {
  if (paymentDate) {
    const open = periods.filter((p) => p.status !== "archived")
    const hit = open.find((p) => paymentFallsInPeriod(paymentDate, p.startDate, p.endDate))
    if (hit) return hit.id
  }
  return fallbackActiveId ?? null
}

/**
 * Pegasus: a payment pays the latest bill that already existed that day.
 * Period open on the 1st does not mean the 4th bill is collectable on the 3rd.
 */
export function resolvePeriodIdForCustomerPayment(
  paymentDate: Date | string | null,
  bills: CustomerBillTaken[],
  periods: PeriodDateWindow[],
  fallbackActiveId?: string | null,
): string | null {
  if (!paymentDate) {
    return resolvePeriodIdForPayment(null, periods, fallbackActiveId)
  }

  const pay = kampalaCalendarDate(paymentDate)
  const live = periods.filter((p) => p.status !== "archived")
  const startOf = (id: string) => asDate(live.find((p) => p.id === id)?.startDate)?.getTime() ?? 0

  const eligible = bills
    .filter((b) => b.takenAt && kampalaCalendarDate(b.takenAt) <= pay)
    .sort((a, b) => {
      const byTaken = kampalaCalendarDate(b.takenAt!).localeCompare(kampalaCalendarDate(a.takenAt!))
      if (byTaken !== 0) return byTaken
      return startOf(b.billingPeriodId) - startOf(a.billingPeriodId)
    })
  if (eligible[0]) return eligible[0].billingPeriodId

  const blockedIds = new Set(
    bills
      .filter((b) => b.takenAt && kampalaCalendarDate(b.takenAt) > pay)
      .map((b) => b.billingPeriodId),
  )
  if (blockedIds.size > 0) {
    const older = live.filter((p) => !blockedIds.has(p.id))
    const byWindow = resolvePeriodIdForPayment(paymentDate, older, null)
    if (byWindow) return byWindow
    const previousClosed = [...older]
      .filter((p) => p.status === "closed")
      .sort((a, b) => (asDate(b.endDate)?.getTime() ?? 0) - (asDate(a.endDate)?.getTime() ?? 0))
    return previousClosed[0]?.id ?? fallbackActiveId ?? null
  }

  return resolvePeriodIdForPayment(paymentDate, live, fallbackActiveId)
}

export function resolveBillForPayment(
  paymentDate: Date | string | null,
  bills: Array<CustomerBillTaken & { id: string }>,
  periods: PeriodDateWindow[],
  fallbackActiveId?: string | null,
): { billingRecordId: string | null; billingPeriodId: string | null } {
  const billingPeriodId = resolvePeriodIdForCustomerPayment(
    paymentDate,
    bills,
    periods,
    fallbackActiveId,
  )
  if (!billingPeriodId) return { billingRecordId: null, billingPeriodId: null }
  const bill = bills.find((b) => b.billingPeriodId === billingPeriodId)
  return { billingRecordId: bill?.id ?? null, billingPeriodId }
}

export function kampalaYearMonth(date: Date): YearMonth {
  const ymd = kampalaCalendarDate(date)
  return { year: Number(ymd.slice(0, 4)), month: Number(ymd.slice(5, 7)) }
}

export function previousYearMonth({ year, month }: YearMonth): YearMonth {
  if (month === 1) return { year: year - 1, month: 12 }
  return { year, month: month - 1 }
}

export function nextYearMonth({ year, month }: YearMonth): YearMonth {
  if (month === 12) return { year: year + 1, month: 1 }
  return { year, month: month + 1 }
}

/** True once Kampala has moved into a later month than this period started in. */
export function collectionMonthHasEnded(startDate: Date, now = new Date()): boolean {
  const start = kampalaYearMonth(startDate)
  const today = kampalaYearMonth(now)
  return today.year > start.year || (today.year === start.year && today.month > start.month)
}

export function periodNameForMonth(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

function pad2(n: number) {
  return String(n).padStart(2, "0")
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** UTC-midnight bounds, same shape as the date inputs staff type. */
export function calendarMonthBounds(year: number, month: number): { startDate: Date; endDate: Date } {
  const last = lastDayOfMonth(year, month)
  return {
    startDate: new Date(`${year}-${pad2(month)}-01T00:00:00.000Z`),
    endDate: new Date(`${year}-${pad2(month)}-${pad2(last)}T00:00:00.000Z`),
  }
}

/**
 * In September we collect August bills.
 * Collection window = this Kampala calendar month; name = previous month.
 */
export function billMonthForCollection(now = new Date()) {
  const collection = kampalaYearMonth(now)
  const bill = previousYearMonth(collection)
  return {
    collection,
    bill,
    periodName: periodNameForMonth(bill.month, bill.year),
    bounds: calendarMonthBounds(collection.year, collection.month),
  }
}

/** Draft for the next Kampala month. This month opens on its own. */
export function nextCollectionPeriodPlan(now = new Date()) {
  const collection = nextYearMonth(kampalaYearMonth(now))
  const bill = previousYearMonth(collection)
  return {
    collection,
    bill,
    periodName: periodNameForMonth(bill.month, bill.year),
    bounds: calendarMonthBounds(collection.year, collection.month),
  }
}

