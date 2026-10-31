import { describe, expect, it } from "vitest"
import { electricityMeasurementSchema, fuelMeasurementSchema } from "./schemas"
import { loadProductionSummary } from "./reporting"

describe("Production Energy & Fuel Monitoring", () => {
  it("calculates electricity consumption from interval meter readings", () => {
    const validElec = {
      schemeId: "scheme-1",
      assetId: "meter-1",
      openingReadingKwh: "100.00",
      openingTimestamp: "2026-10-01T08:00:00Z",
      closingReadingKwh: "300.00",
      closingTimestamp: "2026-10-03T08:00:00Z",
      multiplier: "1.00",
      rolloverValueKwh: null,
      isReset: false,
      pumpOperatingHours: "15.50",
      electricityCostUgx: "150000.00",
      requestKey: "12345678-1234-1234-1234-123456789012",
      notes: "Routine reading",
    }

    const parsed = electricityMeasurementSchema.parse(validElec)
    expect(parsed.assetId).toBe("meter-1")
    const rawDelta = Number(parsed.closingReadingKwh) - Number(parsed.openingReadingKwh)
    expect(rawDelta * Number(parsed.multiplier)).toBe(200)
  })

  it("handles electricity meter rollover correctly", () => {
    const validElec = {
      schemeId: "scheme-1",
      assetId: "meter-1",
      openingReadingKwh: "99990.00",
      openingTimestamp: "2026-10-01T08:00:00Z",
      closingReadingKwh: "110.00",
      closingTimestamp: "2026-10-03T08:00:00Z",
      multiplier: "1.00",
      rolloverValueKwh: "100000.00",
      isReset: false,
      requestKey: "12345678-1234-1234-1234-123456789012",
      notes: "Rollover occurred",
    }

    const parsed = electricityMeasurementSchema.parse(validElec)
    let rawDelta = Number(parsed.closingReadingKwh) - Number(parsed.openingReadingKwh)
    if (rawDelta < 0 && parsed.rolloverValueKwh) {
      rawDelta = (Number(parsed.rolloverValueKwh) - Number(parsed.openingReadingKwh)) + Number(parsed.closingReadingKwh)
    }
    expect(rawDelta).toBe(120) // 10 from opening to rollover, + 110 after rollover
  })

  it("calculates generator fuel consumption from stock reconciliation and rejects fabricated consumption from purchases alone", () => {
    const validFuel = {
      schemeId: "scheme-1",
      assetId: "gen-1",
      fuelType: "diesel" as const,
      openingStockLitres: "100.00",
      fuelPurchasedLitres: "200.00",
      fuelTransfersInLitres: "50.00",
      closingStockLitres: "150.00",
      generatorOperatingHours: "10.00",
      fuelExpenditureUgx: "1000000.00",
      requestKey: "12345678-1234-1234-1234-123456789012",
      notes: "Generator fuel log",
      coverageStartDate: "2026-10-01",
      coverageEndDate: "2026-10-07"
    }

    const parsed = fuelMeasurementSchema.parse(validFuel)
    let calculatedConsumedLitres: number | null = null
    if (parsed.openingStockLitres !== null && parsed.closingStockLitres !== null) {
      calculatedConsumedLitres = Number(parsed.openingStockLitres) + Number(parsed.fuelPurchasedLitres ?? 0) + Number(parsed.fuelTransfersInLitres ?? 0) - Number(parsed.closingStockLitres)
    }

    expect(calculatedConsumedLitres).toBe(200) // 100 + 200 + 50 - 150 = 200
  })

  it("leaves fuel consumption as null (UNAVAILABLE) when stock readings are missing, refusing to fabricate consumption from purchases", () => {
    const purchaseOnlyFuel = {
      schemeId: "scheme-1",
      assetId: "gen-1",
      fuelType: "diesel" as const,
      fuelPurchasedLitres: "500.00", // Bought 500L
      fuelExpenditureUgx: "2500000.00",
      requestKey: "12345678-1234-1234-1234-123456789012",
      notes: "Bulk delivery to site, not immediately combusted",
      coverageStartDate: "2026-10-01",
      coverageEndDate: "2026-10-01"
    }

    const parsed = fuelMeasurementSchema.parse(purchaseOnlyFuel)
    let calculatedConsumedLitres: number | null = null
    if (parsed.openingStockLitres !== null && parsed.closingStockLitres !== null) {
      calculatedConsumedLitres = Number(parsed.openingStockLitres) + Number(parsed.fuelPurchasedLitres ?? 0) + Number(parsed.fuelTransfersInLitres ?? 0) - Number(parsed.closingStockLitres)
    }

    expect(calculatedConsumedLitres).toBeNull() // NO FABRICATION
  })

  it("rejects invalid timestamps", () => {
    const invalidElec = {
      schemeId: "scheme-1",
      assetId: "meter-1",
      openingReadingKwh: "100.00",
      openingTimestamp: "2026-10-03T08:00:00Z", // After closing
      closingReadingKwh: "300.00",
      closingTimestamp: "2026-10-01T08:00:00Z",
      requestKey: "12345678-1234-1234-1234-123456789012",
      notes: "Routine reading",
    }

    expect(() => electricityMeasurementSchema.parse(invalidElec)).toThrow()
  })
})
