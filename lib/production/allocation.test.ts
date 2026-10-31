import { describe, expect, it } from "vitest"
import {
  allocateByDays,
  allocateByTime,
  ALLOCATION_METHOD_DAYS,
  ALLOCATION_METHOD_TIME,
  coverageDates,
  kampalaMonthBounds,
} from "./allocation"
import { fromCents, toCents } from "./decimal"

describe("Kampala month bounds & cross-month interval allocation", () => {
  it("computes Africa/Kampala (UTC+3) month boundaries and half-open coverage dates", () => {
    const oct = kampalaMonthBounds("2026-10")
    expect(oct.start.toISOString()).toBe("2026-09-30T21:00:00.000Z")
    expect(oct.end.toISOString()).toBe("2026-10-31T21:00:00.000Z")

    // Midnight-to-midnight in Kampala (21:00Z prior day to 21:00Z) stays wholly in October
    const dates = coverageDates(new Date("2026-09-30T21:00:00Z"), new Date("2026-10-07T21:00:00Z"))
    expect(dates).toEqual({ start: "2026-10-01", end: "2026-10-07" })
  })

  it("keeps intervals wholly inside a Kampala month as MEASURED with zero estimation error", () => {
    const alloc = allocateByTime(
      toCents("450.00"),
      new Date("2026-10-01T05:00:00Z"),
      new Date("2026-10-15T05:00:00Z"),
      "2026-10",
    )
    expect(alloc.basis).toBe("MEASURED")
    expect(fromCents(alloc.totalCents)).toBe("450.00")
    expect(fromCents(alloc.allocatedCents)).toBe("450.00")
    expect(alloc.method).toBeNull()
    expect(alloc.uncertainty).toBeNull()
    expect(alloc.maxAbsoluteErrorCents).toBe(BigInt(0))
  })

  it("splits cross-month timestamp intervals as ESTIMATED_ALLOCATION without mutating total or double counting", () => {
    // 10 Kampala days: 2026-09-27 00:00 EAT -> 2026-10-07 00:00 EAT (4 days in Sept, 6 days in Oct)
    const opening = new Date("2026-09-26T21:00:00Z")
    const closing = new Date("2026-10-06T21:00:00Z")
    const total = toCents("1000.00")

    const sept = allocateByTime(total, opening, closing, "2026-09")
    const oct = allocateByTime(total, opening, closing, "2026-10")
    const nov = allocateByTime(total, opening, closing, "2026-11")

    expect(sept.basis).toBe("ESTIMATED_ALLOCATION")
    expect(sept.method).toBe(ALLOCATION_METHOD_TIME)
    expect(fromCents(sept.totalCents)).toBe("1000.00")
    expect(fromCents(sept.allocatedCents)).toBe("400.00")
    expect(fromCents(sept.maxAbsoluteErrorCents)).toBe("600.00")
    expect(sept.uncertainty).toContain("uniform rate")

    expect(oct.basis).toBe("ESTIMATED_ALLOCATION")
    expect(fromCents(oct.totalCents)).toBe("1000.00")
    expect(fromCents(oct.allocatedCents)).toBe("600.00")
    expect(fromCents(oct.maxAbsoluteErrorCents)).toBe("600.00")

    // Allocations conserve the single measured total rather than counting 1000 m3 in both months
    expect(fromCents(sept.allocatedCents + oct.allocatedCents)).toBe("1000.00")
    expect(nov.basis).toBe("OUTSIDE_MONTH")
    expect(nov.allocatedCents).toBe(BigInt(0))
  })

  it("allocates cross-month fuel stock periods by calendar days as ESTIMATED_ALLOCATION", () => {
    // 2026-09-28..2026-10-04 = 7 days (3 in Sept, 4 in Oct)
    const total = toCents("140.00")
    const sept = allocateByDays(total, "2026-09-28", "2026-10-04", "2026-09")
    const oct = allocateByDays(total, "2026-09-28", "2026-10-04", "2026-10")

    expect(sept.basis).toBe("ESTIMATED_ALLOCATION")
    expect(sept.method).toBe(ALLOCATION_METHOD_DAYS)
    expect(fromCents(sept.allocatedCents)).toBe("60.00")
    expect(fromCents(oct.allocatedCents)).toBe("80.00")
    expect(fromCents(sept.totalCents)).toBe("140.00")
    expect(fromCents(oct.totalCents)).toBe("140.00")
  })
})
