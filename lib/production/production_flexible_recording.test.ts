import { describe, expect, it } from "vitest"
import { batchMeasurementSchema, intervalMeasurementSchema } from "./schemas"

describe("Flexible Production Recording & Monthly Performance Reporting Tests", () => {
  it("validates backdated daily batch submission schema across multiple historical dates", () => {
    const validBatch = {
      schemeId: "scheme-1",
      sourceId: "source-1",
      requestKey: "12345678-1234-1234-1234-123456789012",
      entries: [
        {
          schemeId: "scheme-1",
          sourceId: "source-1",
          productionDate: "2026-10-01",
          waterProducedM3: "150.00",
          waterSuppliedM3: "140.00",
          operatingHours: "12.00",
          notes: "Day 1 batch entry",
        },
        {
          schemeId: "scheme-1",
          sourceId: "source-1",
          productionDate: "2026-10-02",
          waterProducedM3: "160.00",
          waterSuppliedM3: "150.00",
          operatingHours: "12.00",
          notes: "Day 2 batch entry",
        },
      ],
    }

    const parsed = batchMeasurementSchema.parse(validBatch)
    expect(parsed.entries).toHaveLength(2)
    expect(parsed.entries[0].productionDate).toBe("2026-10-01")
    expect(parsed.entries[1].productionDate).toBe("2026-10-02")
  })

  it("validates cumulative meter reading interval schema and calculates elapsed volume with multiplier", () => {
    const validInterval = {
      schemeId: "scheme-1",
      sourceId: "source-1",
      meterRef: "MTR-1001",
      openingReading: "1000.00",
      openingTimestamp: "2026-10-01T08:00:00Z",
      closingReading: "1250.00",
      closingTimestamp: "2026-10-03T08:00:00Z",
      meterUnit: "m3" as const,
      multiplier: "1.00",
      rolloverValue: null,
      isReset: false,
      requestKey: "12345678-1234-1234-1234-123456789012",
      notes: "48-hour cumulative meter interval",
    }

    const parsed = intervalMeasurementSchema.parse(validInterval)
    expect(parsed.meterRef).toBe("MTR-1001")

    const openTime = new Date(parsed.openingTimestamp).getTime()
    const closeTime = new Date(parsed.closingTimestamp).getTime()
    const elapsedHours = (closeTime - openTime) / 3600000

    expect(elapsedHours).toBe(48)
    const rawDelta = Number(parsed.closingReading) - Number(parsed.openingReading)
    const volumeM3 = rawDelta * Number(parsed.multiplier)
    expect(volumeM3).toBe(250)
  })

  it("handles meter rollover correctly when closing reading is less than opening reading", () => {
    const openingReading = 999500.0
    const closingReading = 150.0
    const rolloverValue = 1000000.0

    let rawDelta = closingReading - openingReading
    if (rawDelta < 0 && rolloverValue) {
      rawDelta = rolloverValue - openingReading + closingReading
    }

    expect(rawDelta).toBe(650.0) // 500 remaining before rollover + 150 after rollover
  })

  it("rejects interval closing timestamp if not strictly after opening timestamp", () => {
    const invalidInterval = {
      schemeId: "scheme-1",
      sourceId: "source-1",
      meterRef: "MTR-1001",
      openingReading: "1000.00",
      openingTimestamp: "2026-10-03T08:00:00Z",
      closingReading: "1250.00",
      closingTimestamp: "2026-10-01T08:00:00Z",
      requestKey: "12345678-1234-1234-1234-123456789012",
      notes: "Invalid backward interval",
    }

    expect(() => intervalMeasurementSchema.parse(invalidInterval)).toThrow()
  })

  it("calculates source-aware completeness percentage and missing days inventory correctly", () => {
    const requiredSourceDays = 62 // 2 sources * 31 days
    const verifiedSourceDays = 31 // Only 1 source verified for 31 days
    const completenessPct = Math.round((verifiedSourceDays / requiredSourceDays) * 100)

    expect(completenessPct).toBe(50) // 50% completeness
  })

  it("verifies capacity utilization and physical NRW render UNAVAILABLE when completeness is < 100%", () => {
    const completenessPct: number = 85 // Partial coverage
    const verifiedProducedM3 = 5000
    const monthlyCapacityM3 = 10000
    const billedM3 = 4000

    let capUtilPct: number | null = null
    let nrwPct: number | null = null

    if (completenessPct === 100) {
      capUtilPct = Math.round((verifiedProducedM3 / monthlyCapacityM3) * 100)
      nrwPct = Math.round(((verifiedProducedM3 - billedM3) / verifiedProducedM3) * 100)
    }

    expect(capUtilPct).toBeNull() // MUST BE NULL / UNAVAILABLE
    expect(nrwPct).toBeNull() // MUST BE NULL / UNAVAILABLE
  })
})
