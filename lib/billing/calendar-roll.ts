import {
  MONTH_NAMES,
  billMonthForCollection,
  calendarMonthBounds,
  collectionMonthHasEnded,
  kampalaCalendarDate,
  kampalaYearMonth,
  periodEndDateHasPassed,
} from "./period-dates"

export type RollPeriod = {
  id: string
  status: string
  startDate: Date
  endDate: Date
  month?: number
  year?: number
  createdAt?: Date
  closedById?: string | null
}

export type CalendarRollPlan = {
  closeIds: string[]
  clampEnds: { id: string; endDate: Date }[]
  extendEnds: { id: string; endDate: Date }[]
  activateId: string | null
  create: {
    month: number
    year: number
    periodName: string
    startDate: Date
    endDate: Date
    description: string
  } | null
}

function startsInMonth(period: RollPeriod, year: number, month: number): boolean {
  const ym = kampalaYearMonth(period.startDate)
  return ym.year === year && ym.month === month
}

function isBillMonth(period: RollPeriod, month: number, year: number): boolean {
  return period.month === month && period.year === year
}

function pickKeeper(periods: RollPeriod[], month: number, year: number): RollPeriod | null {
  const same = periods
    .filter((p) => p.status !== "archived" && isBillMonth(p, month, year))
    .sort((a, b) => {
      const ac = a.createdAt?.getTime() ?? Number.MAX_SAFE_INTEGER
      const bc = b.createdAt?.getTime() ?? Number.MAX_SAFE_INTEGER
      if (ac !== bc) return ac - bc
      return a.id.localeCompare(b.id)
    })
  return same[0] ?? null
}

function pushExtendIfNeeded(
  period: RollPeriod,
  collectionEnd: Date,
  extendEnds: { id: string; endDate: Date }[],
) {
  if (kampalaCalendarDate(period.endDate) < kampalaCalendarDate(collectionEnd)) {
    extendEnds.push({ id: period.id, endDate: collectionEnd })
  }
}

/**
 * Kampala calendar month: close when that month has ended, even if the
 * stored End Date was typed later. Period name is last month's bills.
 * Does not reopen a period staff already closed this month.
 * Reuses the existing period for this bill month instead of opening an empty clone.
 */
export function decideCalendarRoll(
  now: Date,
  periods: RollPeriod[],
  options: { open?: boolean } = {},
): CalendarRollPlan {
  const open = options.open !== false
  const { collection, bill, periodName, bounds } = billMonthForCollection(now)
  const closeIds: string[] = []
  const clampEnds: { id: string; endDate: Date }[] = []
  const extendEnds: { id: string; endDate: Date }[] = []
  const keeper = pickKeeper(periods, bill.month, bill.year)

  for (const p of periods) {
    if (p.status !== "active") continue
    if (keeper && p.id === keeper.id) continue
    if (keeper && isBillMonth(p, bill.month, bill.year)) {
      closeIds.push(p.id)
      continue
    }

    const monthEnded = collectionMonthHasEnded(p.startDate, now)
    const endPassed = periodEndDateHasPassed(p.endDate, now)
    if (!monthEnded && !endPassed) continue

    closeIds.push(p.id)
    if (monthEnded) {
      const startYm = kampalaYearMonth(p.startDate)
      const monthEnd = calendarMonthBounds(startYm.year, startYm.month).endDate
      if (kampalaCalendarDate(p.endDate) > kampalaCalendarDate(monthEnd)) {
        clampEnds.push({ id: p.id, endDate: monthEnd })
      }
    }
  }

  const closing = new Set(closeIds)
  const empty = { closeIds, clampEnds, extendEnds, activateId: null, create: null }

  if (open && keeper && !closing.has(keeper.id)) {
    pushExtendIfNeeded(keeper, bounds.endDate, extendEnds)
  }

  if (!open) return empty

  if (periods.some((p) => p.status === "active" && !closing.has(p.id))) {
    return { ...empty, extendEnds }
  }

  if (keeper) {
    const staffClosedEarly = keeper.status === "closed" && startsInMonth(keeper, collection.year, collection.month)
    const staffClosed = keeper.status === "closed" && Boolean(keeper.closedById)
    if (staffClosedEarly || staffClosed) return { ...empty, extendEnds: [] }

    if (keeper.status === "draft" || keeper.status === "validated" || keeper.status === "closed") {
      return { closeIds, clampEnds, extendEnds, activateId: keeper.id, create: null }
    }
    return { ...empty, extendEnds }
  }

  const thisMonth = periods.filter((p) =>
    p.status !== "archived" && !closing.has(p.id) && startsInMonth(p, collection.year, collection.month)
  )

  if (thisMonth.some((p) => p.status === "closed")) {
    return empty
  }

  const ready = thisMonth.find((p) => p.status === "draft" || p.status === "validated")
  if (ready) {
    return { closeIds, clampEnds, extendEnds, activateId: ready.id, create: null }
  }

  const collectionLabel = `${MONTH_NAMES[collection.month - 1]} ${collection.year}`

  return {
    closeIds,
    clampEnds,
    extendEnds,
    activateId: null,
    create: {
      month: bill.month,
      year: bill.year,
      periodName,
      startDate: bounds.startDate,
      endDate: bounds.endDate,
      description: `Auto-opened ${collectionLabel} collection of ${periodName} bills.`,
    },
  }
}
