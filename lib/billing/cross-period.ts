export type PeriodWindow = {
  id: string
  status: string
  periodName: string
  startDate: Date
  endDate: Date
  closedAt: Date | null
}

/**
 * A payment dated shortly after a period closed is often still for that
 * period's bill, but daily sync attributes by calendar window and will
 * post it to the new active period. We flag — we do not rewrite history.
 */
export function findClosedPeriodForLatePayment(
  paymentDate: Date | null,
  attributedPeriodId: string,
  periods: PeriodWindow[],
  graceDays: number,
): PeriodWindow | null {
  if (!paymentDate || graceDays < 0) return null

  const graceMs = graceDays * 24 * 60 * 60 * 1000
  const pay = paymentDate.getTime()

  const matches = periods.filter((p) => {
    if (p.status !== "closed") return false
    if (p.id === attributedPeriodId) return false
    const boundary = (p.closedAt && p.closedAt.getTime() > p.endDate.getTime()
      ? p.closedAt
      : p.endDate).getTime()
    return pay > p.endDate.getTime() && pay <= boundary + graceMs
  })

  if (matches.length === 0) return null
  matches.sort((a, b) => b.endDate.getTime() - a.endDate.getTime())
  return matches[0]
}
