import { describe, expect, it } from "vitest"
import { billingInsertValues, customerInsertValues, toSqliteValue } from "./sqlite-values"

describe("toSqliteValue", () => {
  it("keeps strings, numbers, and null", () => {
    expect(toSqliteValue("SW-1")).toBe("SW-1")
    expect(toSqliteValue(12)).toBe(12)
    expect(toSqliteValue(null)).toBeNull()
    expect(toSqliteValue(undefined)).toBeNull()
  })

  it("serializes Date objects to ISO strings", () => {
    const d = new Date("2026-09-16T09:00:00.000Z")
    expect(toSqliteValue(d)).toBe("2026-09-16T09:00:00.000Z")
  })

  it("stores booleans as 0/1", () => {
    expect(toSqliteValue(true)).toBe(1)
    expect(toSqliteValue(false)).toBe(0)
  })
})

describe("customerInsertValues", () => {
  it("never leaves a Date in the bind list", () => {
    const values = customerInsertValues({
      id: "c1",
      customerAccount: "A-1",
      name: "Jane",
      phone: null,
      address: null,
      accountBalance: "1500.00",
      category: "domestic",
      active: true,
      updatedAt: new Date("2026-09-16T09:00:00.000Z"),
      lastReading: 42,
    })
    expect(values).toHaveLength(10)
    expect(values.every((v) => v == null || typeof v === "string" || typeof v === "number")).toBe(true)
    expect(values[8]).toBe("2026-09-16T09:00:00.000Z")
    expect(values[7]).toBe(1)
  })
})

describe("billingInsertValues", () => {
  it("stringifies numeric fields", () => {
    const values = billingInsertValues({
      id: "b1",
      customerId: "c1",
      totalDue: 9000,
      arrears: null,
      billAmount: "100.50",
      status: "unpaid",
      billingPeriodId: "p1",
    })
    expect(values[2]).toBe("9000")
    expect(values[3]).toBe("0")
  })
})
