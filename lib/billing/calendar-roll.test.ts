import { describe, it, expect } from "vitest"
import { decideCalendarRoll } from "./calendar-roll"
import { billMonthForCollection, calendarMonthBounds, nextCollectionPeriodPlan } from "./period-dates"

function d(iso: string) {
  return new Date(iso)
}

describe("bill month lag (Africa/Kampala)", () => {
  it("names September collection after August bills", () => {
    const planned = billMonthForCollection(d("2026-09-17T10:00:00.000Z"))
    expect(planned.collection).toEqual({ year: 2026, month: 9 })
    expect(planned.bill).toEqual({ year: 2026, month: 8 })
    expect(planned.periodName).toBe("August 2026")
    expect(planned.bounds).toEqual(calendarMonthBounds(2026, 9))
    expect(planned.bounds.startDate.toISOString().slice(0, 10)).toBe("2026-09-01")
    expect(planned.bounds.endDate.toISOString().slice(0, 10)).toBe("2026-09-30")
  })

  it("names January collection after December of the previous year", () => {
    const planned = billMonthForCollection(d("2027-01-01T00:00:00+03:00"))
    expect(planned.bill).toEqual({ year: 2026, month: 12 })
    expect(planned.periodName).toBe("December 2026")
    expect(planned.bounds.endDate.toISOString().slice(0, 10)).toBe("2027-01-31")
  })

  it("prepares next month as September bills collected in October", () => {
    const planned = nextCollectionPeriodPlan(d("2026-09-17T10:00:00.000Z"))
    expect(planned.collection).toEqual({ year: 2026, month: 10 })
    expect(planned.bill).toEqual({ year: 2026, month: 9 })
    expect(planned.periodName).toBe("September 2026")
    expect(planned.bounds.startDate.toISOString().slice(0, 10)).toBe("2026-10-01")
    expect(planned.bounds.endDate.toISOString().slice(0, 10)).toBe("2026-10-31")
  })
})

describe("calendar month open/close", () => {
  const augustWindow = {
    id: "july-bills",
    status: "active",
    startDate: d("2026-08-01T00:00:00.000Z"),
    endDate: d("2026-08-31T00:00:00.000Z"),
  }

  it("closes last month and opens this month named for last month's bills", () => {
    const plan = decideCalendarRoll(d("2026-09-01T00:00:00+03:00"), [augustWindow])
    expect(plan.closeIds).toEqual(["july-bills"])
    expect(plan.activateId).toBeNull()
    expect(plan.create?.periodName).toBe("August 2026")
    expect(plan.create?.startDate.toISOString().slice(0, 10)).toBe("2026-09-01")
    expect(plan.create?.endDate.toISOString().slice(0, 10)).toBe("2026-09-30")
  })

  it("keeps a period that still covers today", () => {
    const current = {
      id: "aug-bills",
      status: "active",
      startDate: d("2026-09-01T00:00:00.000Z"),
      endDate: d("2026-09-30T00:00:00.000Z"),
    }
    const plan = decideCalendarRoll(d("2026-09-17T08:00:00.000Z"), [current])
    expect(plan.closeIds).toEqual([])
    expect(plan.create).toBeNull()
    expect(plan.activateId).toBeNull()
  })

  it("does not reopen a period staff closed early this month", () => {
    const closed = {
      id: "aug-bills",
      status: "closed",
      startDate: d("2026-09-01T00:00:00.000Z"),
      endDate: d("2026-09-30T00:00:00.000Z"),
    }
    const plan = decideCalendarRoll(d("2026-09-17T08:00:00.000Z"), [closed])
    expect(plan.create).toBeNull()
    expect(plan.activateId).toBeNull()
  })

  it("activates a draft prepared for this calendar month", () => {
    const draft = {
      id: "prepared",
      status: "draft",
      startDate: d("2026-09-01T00:00:00.000Z"),
      endDate: d("2026-09-30T00:00:00.000Z"),
    }
    const plan = decideCalendarRoll(d("2026-09-02T08:00:00.000Z"), [draft])
    expect(plan.activateId).toBe("prepared")
    expect(plan.create).toBeNull()
  })

  it("closes a period whose start month has ended even if End Date is later", () => {
    const long = {
      id: "aug-bills",
      status: "active",
      startDate: d("2026-09-01T00:00:00.000Z"),
      endDate: d("2026-10-31T00:00:00.000Z"),
    }
    const plan = decideCalendarRoll(d("2026-10-01T00:00:00+03:00"), [long])
    expect(plan.closeIds).toEqual(["aug-bills"])
    expect(plan.clampEnds[0]?.endDate.toISOString().slice(0, 10)).toBe("2026-09-30")
    expect(plan.create?.periodName).toBe("September 2026")
    expect(plan.create?.startDate.toISOString().slice(0, 10)).toBe("2026-10-01")
  })

  it("does not auto-open when only closing", () => {
    const plan = decideCalendarRoll(d("2026-09-01T00:00:00+03:00"), [augustWindow], { open: false })
    expect(plan.closeIds).toEqual(["july-bills"])
    expect(plan.create).toBeNull()
    expect(plan.activateId).toBeNull()
  })

  it("keeps the current bill-month period open and extends its window", () => {
    const original = {
      id: "orig",
      status: "active",
      month: 8,
      year: 2026,
      startDate: d("2026-08-02T00:00:00.000Z"),
      endDate: d("2026-08-29T00:00:00.000Z"),
      createdAt: d("2026-08-03T10:19:12.000Z"),
    }
    const plan = decideCalendarRoll(d("2026-09-17T10:00:00.000Z"), [original])
    expect(plan.closeIds).toEqual([])
    expect(plan.create).toBeNull()
    expect(plan.activateId).toBeNull()
    expect(plan.extendEnds[0]?.id).toBe("orig")
    expect(plan.extendEnds[0]?.endDate.toISOString().slice(0, 10)).toBe("2026-09-30")
  })

  it("collapses empty auto-opened clones onto the original bill-month period", () => {
    const original = {
      id: "orig",
      status: "closed",
      month: 8,
      year: 2026,
      startDate: d("2026-08-02T00:00:00.000Z"),
      endDate: d("2026-08-29T00:00:00.000Z"),
      createdAt: d("2026-08-03T10:19:12.000Z"),
      closedById: null,
    }
    const clone = {
      id: "clone",
      status: "active",
      month: 8,
      year: 2026,
      startDate: d("2026-09-01T00:00:00.000Z"),
      endDate: d("2026-09-30T00:00:00.000Z"),
      createdAt: d("2026-09-17T00:47:48.000Z"),
    }
    const plan = decideCalendarRoll(d("2026-09-17T10:00:00.000Z"), [original, clone])
    expect(plan.closeIds).toEqual(["clone"])
    expect(plan.activateId).toBe("orig")
    expect(plan.create).toBeNull()
    expect(plan.extendEnds[0]?.id).toBe("orig")
    expect(plan.extendEnds[0]?.endDate.toISOString().slice(0, 10)).toBe("2026-09-30")
  })

  it("pushes July back and opens August bills in September", () => {
    const july = {
      id: "july-bills",
      status: "active",
      month: 7,
      year: 2026,
      startDate: d("2026-08-02T00:00:00.000Z"),
      endDate: d("2026-09-30T00:00:00.000Z"),
      createdAt: d("2026-08-03T10:19:12.000Z"),
    }
    const plan = decideCalendarRoll(d("2026-09-17T10:00:00.000Z"), [july])
    expect(plan.closeIds).toEqual(["july-bills"])
    expect(plan.clampEnds[0]?.endDate.toISOString().slice(0, 10)).toBe("2026-08-31")
    expect(plan.create?.periodName).toBe("August 2026")
    expect(plan.create?.startDate.toISOString().slice(0, 10)).toBe("2026-09-01")
    expect(plan.create?.endDate.toISOString().slice(0, 10)).toBe("2026-09-30")
  })

  it("does not reopen a bill-month period staff closed themselves", () => {
    const closed = {
      id: "aug-bills",
      status: "closed",
      month: 8,
      year: 2026,
      startDate: d("2026-09-01T00:00:00.000Z"),
      endDate: d("2026-09-30T00:00:00.000Z"),
      createdAt: d("2026-09-01T08:00:00.000Z"),
      closedById: "staff-1",
    }
    const plan = decideCalendarRoll(d("2026-09-17T08:00:00.000Z"), [closed])
    expect(plan.create).toBeNull()
    expect(plan.activateId).toBeNull()
    expect(plan.extendEnds).toEqual([])
  })
})
