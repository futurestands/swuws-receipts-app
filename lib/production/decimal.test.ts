import { describe, expect, it } from "vitest"
import {
  divideRoundHalfUp,
  electricityKwhCents,
  fromCents,
  fuelConsumedCents,
  intervalVolumeCents,
  meterDeltaCents,
  MeterReadingError,
  toCents,
} from "./decimal"

describe("exact production decimal arithmetic", () => {
  it("parses and formats fixed two-decimal strings without floating-point drift", () => {
    expect(toCents("0")).toBe(BigInt(0))
    expect(toCents("12.3")).toBe(BigInt(1230))
    expect(toCents("12.34")).toBe(BigInt(1234))
    expect(fromCents(BigInt(1234))).toBe("12.34")
    expect(fromCents(BigInt(5))).toBe("0.05")
    expect(() => toCents("-1.00")).toThrow(MeterReadingError)
    expect(() => toCents("1.234")).toThrow(MeterReadingError)
    expect(() => toCents("1e5")).toThrow(MeterReadingError)
  })

  it("rounds half-up identically to PostgreSQL round(numeric, 2)", () => {
    expect(divideRoundHalfUp(BigInt(1), BigInt(2))).toBe(BigInt(1))
    expect(divideRoundHalfUp(BigInt(49), BigInt(100))).toBe(BigInt(0))
    expect(divideRoundHalfUp(BigInt(50), BigInt(100))).toBe(BigInt(1))
  })

  it("computes normal, rollover, and reset meter deltas strictly", () => {
    expect(fromCents(meterDeltaCents("1000.10", "1250.45", null, false))).toBe("250.35")

    // Unsolicited rollover value when meter neither wrapped nor reset is rejected
    expect(() => meterDeltaCents("100.00", "200.00", "1000.00", false)).toThrow(MeterReadingError)

    // Rollover when closing < opening
    expect(fromCents(meterDeltaCents("99990.00", "110.00", "100000.00", false))).toBe("120.00")
    expect(() => meterDeltaCents("99990.00", "110.00", null, false)).toThrow(MeterReadingError)
    expect(() => meterDeltaCents("99990.00", "110.00", "99980.00", false)).toThrow(MeterReadingError)

    // Explicit reset even when replacement meter climbed above prior opening reading
    expect(fromCents(meterDeltaCents("100.00", "180.00", "150.00", true))).toBe("230.00")
    expect(() => meterDeltaCents("100.00", "180.00", null, true)).toThrow(MeterReadingError)
  })

  it("converts m3, litres, gallons, and CT-multiplied electricity kWh accurately", () => {
    const delta = meterDeltaCents("0.00", "12345.00", null, false)
    expect(fromCents(intervalVolumeCents(delta, "1.00", "m3"))).toBe("12345.00")
    expect(fromCents(intervalVolumeCents(delta, "1.00", "litres"))).toBe("12.35")
    expect(fromCents(intervalVolumeCents(toCents("10000.00"), "1.00", "gallons"))).toBe("37.85")
    expect(fromCents(electricityKwhCents(toCents("12.34"), "40.00"))).toBe("493.60")
  })

  it("computes fuel consumption from stock balance and returns null without both stock readings", () => {
    expect(
      fuelConsumedCents({
        openingStockLitres: null,
        closingStockLitres: null,
        fuelPurchasedLitres: "500.00",
        fuelTransfersInLitres: null,
        fuelTransfersOutLitres: null,
        fuelAdjustmentsLitres: null,
      }),
    ).toBeNull()

    expect(
      fuelConsumedCents({
        openingStockLitres: "100.00",
        closingStockLitres: null,
        fuelPurchasedLitres: "200.00",
        fuelTransfersInLitres: null,
        fuelTransfersOutLitres: null,
        fuelAdjustmentsLitres: null,
      }),
    ).toBeNull()

    const consumed = fuelConsumedCents({
      openingStockLitres: "120.50",
      closingStockLitres: "95.25",
      fuelPurchasedLitres: "200.00",
      fuelTransfersInLitres: "30.00",
      fuelTransfersOutLitres: "15.00",
      fuelAdjustmentsLitres: "4.75",
    })
    expect(consumed).not.toBeNull()
    expect(fromCents(consumed!)).toBe("245.00")
  })
})
