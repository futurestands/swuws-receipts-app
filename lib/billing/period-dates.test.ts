import { describe, it, expect } from "vitest"
import { kampalaCalendarDate, kampalaDaysRemaining, paymentFallsInPeriod, periodEndDateHasPassed, resolvePeriodIdForPayment, resolvePeriodIdForCustomerPayment, resolveBillForPayment } from "./period-dates"

describe("billing period end dates (Africa/Kampala)", () => {
  it("keeps the period open on the typed end date", () => {
    const end = new Date("2026-09-30T00:00:00.000Z")
    const morningOnEndDay = new Date("2026-09-30T08:00:00.000Z")
    expect(kampalaCalendarDate(end)).toBe("2026-09-30")
    expect(periodEndDateHasPassed(end, morningOnEndDay)).toBe(false)
    expect(kampalaDaysRemaining(end, morningOnEndDay)).toBe(0)
  })

  it("closes after that Kampala calendar day", () => {
    const end = new Date("2026-09-30T00:00:00.000Z")
    const nextMorning = new Date("2026-09-30T21:30:00.000Z") // 00:30 Oct 1 Kampala
    expect(periodEndDateHasPassed(end, nextMorning)).toBe(true)
    expect(kampalaDaysRemaining(end, nextMorning)).toBe(0)
  })

  it("counts full days remaining before the end date", () => {
    const end = new Date("2026-09-30T00:00:00.000Z")
    const sept28Kampala = new Date("2026-09-28T10:00:00.000Z")
    expect(periodEndDateHasPassed(end, sept28Kampala)).toBe(false)
    expect(kampalaDaysRemaining(end, sept28Kampala)).toBe(2)
  })
})

describe("daily collection date → period", () => {
  const september = {
    id: "sept",
    status: "closed",
    startDate: new Date("2026-09-01T00:00:00.000Z"),
    endDate: new Date("2026-09-30T00:00:00.000Z"),
  }
  const october = {
    id: "oct",
    status: "active",
    startDate: new Date("2026-10-01T00:00:00.000Z"),
    endDate: new Date("2026-10-31T00:00:00.000Z"),
  }

  it("posts a payment on the closed period's last day to that closed period", () => {
    const paidOnLastDay = new Date("2026-09-30T15:00:00.000Z")
    expect(paymentFallsInPeriod(paidOnLastDay, september.startDate, september.endDate)).toBe(true)
    expect(resolvePeriodIdForPayment(paidOnLastDay, [september, october], october.id)).toBe("sept")
  })

  it("still posts after auto-close when there is no active period", () => {
    const paidInside = new Date("2026-09-28T10:00:00.000Z")
    expect(resolvePeriodIdForPayment(paidInside, [september], null)).toBe("sept")
  })

  it("does not dump a dated payment onto the new active period", () => {
    const paidInSept = new Date("2026-09-15T08:00:00.000Z")
    expect(resolvePeriodIdForPayment(paidInSept, [september, october], october.id)).toBe("sept")
  })

  it("ignores archived periods even when the payment date matches", () => {
    const archivedSept = { ...september, status: "archived" }
    const paidInSept = new Date("2026-09-15T08:00:00.000Z")
    expect(resolvePeriodIdForPayment(paidInSept, [archivedSept, october], october.id)).toBe("oct")
  })
})

describe("Pegasus bill-taken cutoff", () => {
  const july = {
    id: "july",
    status: "closed",
    startDate: new Date("2026-08-01T00:00:00.000Z"),
    endDate: new Date("2026-08-31T00:00:00.000Z"),
  }
  const august = {
    id: "august",
    status: "active",
    startDate: new Date("2026-09-01T00:00:00.000Z"),
    endDate: new Date("2026-09-30T00:00:00.000Z"),
  }
  const periods = [july, august]
  const julyBill = {
    id: "july-bill",
    billingPeriodId: "july",
    takenAt: new Date("2026-08-12T08:49:00.000Z"),
  }
  const augustBill = {
    id: "august-bill",
    billingPeriodId: "august",
    takenAt: new Date("2026-09-04T00:00:00.000Z"),
  }
  const paid3rd = new Date("2026-09-03T10:00:00.000Z")
  const paid4th = new Date("2026-09-04T10:00:00.000Z")

  it("posts a payment on the 3rd to the old bill when the new bill is taken on the 4th", () => {
    expect(resolvePeriodIdForCustomerPayment(paid3rd, [julyBill, augustBill], periods, august.id)).toBe("july")
    expect(resolveBillForPayment(paid3rd, [julyBill, augustBill], periods, august.id)).toEqual({
      billingRecordId: "july-bill",
      billingPeriodId: "july",
    })
  })

  it("posts a payment on the 4th to the new bill", () => {
    expect(resolvePeriodIdForCustomerPayment(paid4th, [julyBill, augustBill], periods, august.id)).toBe("august")
    expect(resolveBillForPayment(paid4th, [julyBill, augustBill], periods, august.id).billingRecordId).toBe("august-bill")
  })

  it("keeps September payments on the old bill until this customer is billed", () => {
    expect(resolvePeriodIdForCustomerPayment(paid3rd, [julyBill], periods, august.id)).toBe("july")
    expect(resolvePeriodIdForCustomerPayment(paid4th, [julyBill], periods, august.id)).toBe("july")
  })

  it("uses the previous closed period when the only bill was taken after the payment", () => {
    expect(resolvePeriodIdForCustomerPayment(paid3rd, [augustBill], periods, august.id)).toBe("july")
  })

  it("falls back to the collection window when the customer has no bills yet", () => {
    expect(resolvePeriodIdForCustomerPayment(paid3rd, [], periods, august.id)).toBe("august")
  })

  it("still applies the 3rd-vs-4th rule when dates arrive as ISO strings", () => {
    const stringBills = [
      { id: "july-bill", billingPeriodId: "july", takenAt: "2026-08-12T08:49:00.000Z" },
      { id: "august-bill", billingPeriodId: "august", takenAt: "2026-09-04T00:00:00.000Z" },
    ]
    const stringPeriods = [
      { ...july, startDate: "2026-08-01T00:00:00.000Z", endDate: "2026-08-31T00:00:00.000Z" },
      { ...august, startDate: "2026-09-01T00:00:00.000Z", endDate: "2026-09-30T00:00:00.000Z" },
    ]
    expect(resolvePeriodIdForCustomerPayment("2026-09-03T10:00:00.000Z", stringBills, stringPeriods, august.id)).toBe("july")
    expect(resolvePeriodIdForCustomerPayment("2026-09-04T10:00:00.000Z", stringBills, stringPeriods, august.id)).toBe("august")
  })
})
