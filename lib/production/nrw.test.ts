import { describe, expect, it } from "vitest"
import { evaluateNrw, type NrwInput } from "./nrw"

function validInput(): NrwInput {
  return {
    periodMatch: "ONE",
    production: {
      dataQualityStatus: "COMPLETE",
      suppliedComplete: true,
      totalWaterSuppliedM3: "1000.00",
      intervalConflictCount: 0,
      estimatedAllocationPresent: false,
    },
    billed: {
      volumeM3: "745.00",
      eligibleReadings: 50,
      meteredActiveCustomers: 50,
      meteredCustomersWithReading: 50,
      unmeteredActiveCustomers: 0,
    },
  }
}

describe("Non-Revenue Water compatibility gate", () => {
  it("computes NRW % to one decimal place when all boundary and completeness gates are met", () => {
    const res = evaluateNrw(validInput())
    expect(res.status).toBe("AVAILABLE")
    expect(res.percent).toBe(25.5)
    expect(res.systemInputM3).toBe("1000.00")
    expect(res.billedM3).toBe("745.00")
    expect(res.reasons).toHaveLength(0)
  })

  it("returns UNAVAILABLE when production coverage is PARTIAL or UNAVAILABLE", () => {
    const base = validInput()
    const res = evaluateNrw({ ...base, production: { ...base.production, dataQualityStatus: "PARTIAL" } })
    expect(res.status).toBe("UNAVAILABLE")
    expect(res.percent).toBeNull()
    expect(res.reasons[0]).toMatch(/PARTIAL/)
  })

  it("returns UNAVAILABLE when supplied volume is incomplete (e.g. interval-only production)", () => {
    const base = validInput()
    const res = evaluateNrw({ ...base, production: { ...base.production, suppliedComplete: false } })
    expect(res.status).toBe("UNAVAILABLE")
    expect(res.percent).toBeNull()
    expect(res.reasons.join(" ")).toMatch(/supplied/i)
  })

  it("returns UNAVAILABLE when daily/interval conflicts or cross-month estimated allocations exist", () => {
    const base = validInput()
    expect(
      evaluateNrw({ ...base, production: { ...base.production, intervalConflictCount: 1 } }).status,
    ).toBe("UNAVAILABLE")
    expect(
      evaluateNrw({ ...base, production: { ...base.production, estimatedAllocationPresent: true } }).status,
    ).toBe("UNAVAILABLE")
  })

  it("returns UNAVAILABLE when billing period is missing or ambiguous", () => {
    const base = validInput()
    expect(evaluateNrw({ ...base, periodMatch: "NONE", billed: null }).status).toBe("UNAVAILABLE")
    expect(evaluateNrw({ ...base, periodMatch: "AMBIGUOUS", billed: null }).status).toBe("UNAVAILABLE")
  })

  it("returns UNAVAILABLE when active customers lack billed readings or are unmetered", () => {
    const base = validInput()
    const missingReading = evaluateNrw({
      ...base,
      billed: { ...base.billed!, meteredCustomersWithReading: 49 },
    })
    expect(missingReading.status).toBe("UNAVAILABLE")
    expect(missingReading.reasons.join(" ")).toMatch(/1 of 50 active metered customers/)

    const unmetered = evaluateNrw({
      ...base,
      billed: { ...base.billed!, unmeteredActiveCustomers: 3 },
    })
    expect(unmetered.status).toBe("UNAVAILABLE")
    expect(unmetered.reasons.join(" ")).toMatch(/3 active customer/)
  })

  it("refuses to clamp negative NRW to 0% when billed volume exceeds system input volume", () => {
    const base = validInput()
    const res = evaluateNrw({
      ...base,
      billed: { ...base.billed!, volumeM3: "1050.00" },
    })
    expect(res.status).toBe("UNAVAILABLE")
    expect(res.percent).toBeNull()
    expect(res.reasons.join(" ")).toMatch(/exceeds system input volume/)
  })
})
