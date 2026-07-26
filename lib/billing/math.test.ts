import { describe, it, expect } from "vitest"
import { calculateBill } from "./math"

describe("Billing Math Logic", () => {
  const tariff = {
    unitPrice: 3500, // USh per m3
    serviceFee: 5000,
    vatPercentage: 18,
  }

  it("calculates basic consumption correctly", () => {
    // 10m3 consumption
    const result = calculateBill(100, 110, tariff)

    // (10 * 3500) = 35000
    // 35000 + 5000 = 40000 (Subtotal)
    // 40000 * 0.18 = 7200 (VAT)
    // Total = 47200

    expect(result.consumption).toBe(10)
    expect(result.waterCharge).toBe(35000)
    expect(result.serviceFee).toBe(5000)
    expect(result.vatAmount).toBe(7200)
    expect(result.totalNewBill).toBe(47200)
  })

  it("handles zero consumption correctly", () => {
    const result = calculateBill(100, 100, tariff)

    // (0 * 3500) = 0
    // 0 + 5000 = 5000 (Subtotal)
    // 5000 * 0.18 = 900 (VAT)
    // Total = 5900

    expect(result.consumption).toBe(0)
    expect(result.totalNewBill).toBe(5900)
  })

  it("handles negative consumption by capping at zero", () => {
    // Current < Previous (Possible meter reset or error)
    const result = calculateBill(100, 90, tariff)

    expect(result.consumption).toBe(0)
    expect(result.totalNewBill).toBe(5900)
  })

  it("rounds VAT to the nearest whole shilling", () => {
    const microTariff = {
      unitPrice: 1,
      serviceFee: 1,
      vatPercentage: 18,
    }
    const result = calculateBill(0, 1, microTariff)
    // Subtotal = 1 + 1 = 2
    // VAT = 2 * 0.18 = 0.36
    // Rounded VAT = 0
    // Total = 2
    expect(result.vatAmount).toBe(0)
    expect(result.totalNewBill).toBe(2)
  })
})
