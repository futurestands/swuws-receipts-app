import { describe, it, expect } from "vitest"
import { findClosedPeriodForLatePayment, type PeriodWindow } from "./cross-period"

function d(iso: string) {
  return new Date(iso)
}

const july: PeriodWindow = {
  id: "july",
  status: "closed",
  periodName: "July 2026",
  startDate: d("2026-07-01T00:00:00Z"),
  endDate: d("2026-07-31T23:59:59Z"),
  closedAt: d("2026-08-02T12:00:00Z"),
}

const august: PeriodWindow = {
  id: "august",
  status: "active",
  periodName: "August 2026",
  startDate: d("2026-08-01T00:00:00Z"),
  endDate: d("2026-08-31T23:59:59Z"),
  closedAt: null,
}

describe("findClosedPeriodForLatePayment", () => {
  it("flags a payment a few days after close that was posted to the new period", () => {
    const hit = findClosedPeriodForLatePayment(
      d("2026-08-04T10:00:00Z"),
      "august",
      [july, august],
      14,
    )
    expect(hit?.id).toBe("july")
  })

  it("does not flag when the payment already sits on the closed period", () => {
    const hit = findClosedPeriodForLatePayment(
      d("2026-08-04T10:00:00Z"),
      "july",
      [july, august],
      14,
    )
    expect(hit).toBeNull()
  })

  it("does not flag payments well after the grace window", () => {
    const hit = findClosedPeriodForLatePayment(
      d("2026-08-25T10:00:00Z"),
      "august",
      [july, august],
      14,
    )
    expect(hit).toBeNull()
  })

  it("does not flag when there is no payment date", () => {
    expect(findClosedPeriodForLatePayment(null, "august", [july, august], 14)).toBeNull()
  })
})
