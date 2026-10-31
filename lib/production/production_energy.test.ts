import { describe, expect, it, vi } from "vitest"
vi.mock("@/lib/db", () => ({ db: {} }))
import { electricityMeasurementSchema, fuelMeasurementSchema, intervalMeasurementSchema } from "./schemas"
import { loadProductionSummary } from "./reporting"
import { generateMonthlyWaterProductionReport } from "@/lib/reports/production-executive-report"
import type { db } from "@/lib/db"
import type { UserPermissionsContext } from "@/lib/permissions"

/** Sequential query-queue stub so pure unit tests verify reporting & executive-report orchestration with zero DB connection. */
function makeMockClient(responses: unknown[][]): typeof db {
  let cursor = 0
  const next = () => {
    if (cursor >= responses.length) throw new Error(`Unexpected DB select #${cursor + 1}`)
    return responses[cursor++]
  }
  const makeBuilder = () => {
    let result: unknown[] | null = null
    const resolve = () => {
      if (result === null) result = next()
      return Promise.resolve(result)
    }
    const chain: Record<string, unknown> = {}
    for (const method of ["from", "innerJoin", "leftJoin", "where", "groupBy", "orderBy", "limit", "for"]) {
      chain[method] = () => chain
    }
    chain.then = (onFulfilled?: (v: unknown[]) => unknown, onRejected?: (e: unknown) => unknown) =>
      resolve().then(onFulfilled, onRejected)
    return chain
  }
  return { select: () => makeBuilder() } as unknown as typeof db
}

const globalViewer: UserPermissionsContext = {
  id: "u-exec",
  role: "head_commercial",
  organizationId: "org-1",
  clusterId: null,
  branchId: null,
  schemeId: null,
  roleLevel: 9,
  permissions: [{ code: "reports.view", scope: "global" }],
  grants: [],
}

describe("Production Energy, Fuel & Multi-Day Interval Validation and Reporting", () => {
  it("calculates electricity consumption from interval meter readings and supports multi-day operating hours > 24 h", () => {
    const validElec = {
      schemeId: "scheme-1",
      assetId: "meter-1",
      openingReadingKwh: "100.00",
      openingTimestamp: "2026-10-01T08:00:00Z",
      closingReadingKwh: "1300.00",
      closingTimestamp: "2026-10-15T08:00:00Z", // 14 days = 336 elapsed hours
      multiplier: "1.00",
      rolloverValueKwh: null,
      isReset: false,
      pumpOperatingHours: "140.50", // Previously rejected by fixed 24.00 cap
      electricityCostUgx: "950000.00",
      requestKey: "12345678-1234-1234-1234-123456789012",
      notes: "Bi-weekly reading",
    }

    const parsed = electricityMeasurementSchema.parse(validElec)
    expect(parsed.assetId).toBe("meter-1")
    expect(parsed.pumpOperatingHours).toBe("140.50")
  })

  it("handles electricity and water meter rollover and rejects unsolicited or missing rollover values", () => {
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
    expect(electricityMeasurementSchema.parse(validElec).rolloverValueKwh).toBe("100000.00")

    // Missing rollover when closing < opening must fail schema validation
    expect(() =>
      intervalMeasurementSchema.parse({
        schemeId: "scheme-1",
        sourceId: "src-1",
        meterRef: "M-1",
        openingReading: "500.00",
        openingTimestamp: "2026-10-01T08:00:00Z",
        closingReading: "100.00",
        closingTimestamp: "2026-10-02T08:00:00Z",
        rolloverValue: null,
        isReset: false,
        requestKey: "12345678-1234-1234-1234-123456789012",
      }),
    ).toThrow()

    // Unsolicited rollover when closing >= opening and not reset must fail schema validation
    expect(() =>
      electricityMeasurementSchema.parse({
        ...validElec,
        openingReadingKwh: "100.00",
        closingReadingKwh: "200.00",
        rolloverValueKwh: "100000.00",
      }),
    ).toThrow()
  })

  it("validates generator operating hours against covered calendar days and requires paired stock readings", () => {
    const sevenDayFuel = {
      schemeId: "scheme-1",
      assetId: "gen-1",
      fuelType: "diesel" as const,
      openingStockLitres: "100.00",
      fuelPurchasedLitres: "200.00",
      fuelTransfersInLitres: "50.00",
      closingStockLitres: "150.00",
      generatorOperatingHours: "60.00", // Valid across 7 days (max 168 h)
      fuelExpenditureUgx: "1000000.00",
      requestKey: "12345678-1234-1234-1234-123456789012",
      notes: "Weekly generator fuel log",
      coverageStartDate: "2026-10-01",
      coverageEndDate: "2026-10-07",
    }
    expect(fuelMeasurementSchema.parse(sevenDayFuel).generatorOperatingHours).toBe("60.00")

    // Exceeding 7 * 24 = 168 h must fail
    expect(() =>
      fuelMeasurementSchema.parse({ ...sevenDayFuel, generatorOperatingHours: "170.00" }),
    ).toThrow()

    // Single-day period still caps at 24 h
    expect(() =>
      fuelMeasurementSchema.parse({
        ...sevenDayFuel,
        coverageStartDate: "2026-10-01",
        coverageEndDate: "2026-10-01",
        generatorOperatingHours: "25.00",
      }),
    ).toThrow()

    // Lone opening stock without closing stock must fail
    expect(() =>
      fuelMeasurementSchema.parse({ ...sevenDayFuel, closingStockLitres: null }),
    ).toThrow()
  })

  it("leaves fuel consumption null when stock readings are absent (purchases alone never establish consumption)", () => {
    const purchaseOnlyFuel = {
      schemeId: "scheme-1",
      assetId: "gen-1",
      fuelType: "diesel" as const,
      fuelPurchasedLitres: "500.00",
      fuelExpenditureUgx: "2500000.00",
      requestKey: "12345678-1234-1234-1234-123456789012",
      notes: "Bulk delivery to site, not immediately combusted",
      coverageStartDate: "2026-10-01",
      coverageEndDate: "2026-10-01",
    }
    const parsed = fuelMeasurementSchema.parse(purchaseOnlyFuel)
    expect(parsed.openingStockLitres).toBeNull()
    expect(parsed.closingStockLitres).toBeNull()
  })

  it("rejects inverted or future timestamps", () => {
    expect(() =>
      electricityMeasurementSchema.parse({
        schemeId: "scheme-1",
        assetId: "meter-1",
        openingReadingKwh: "100.00",
        openingTimestamp: "2026-10-03T08:00:00Z",
        closingReadingKwh: "300.00",
        closingTimestamp: "2026-10-01T08:00:00Z",
        requestKey: "12345678-1234-1234-1234-123456789012",
      }),
    ).toThrow()

    const farFuture = new Date(Date.now() + 86_400_000).toISOString()
    expect(() =>
      intervalMeasurementSchema.parse({
        schemeId: "scheme-1",
        sourceId: "src-1",
        meterRef: "M-1",
        openingReading: "100.00",
        openingTimestamp: "2026-10-01T08:00:00Z",
        closingReading: "200.00",
        closingTimestamp: farFuture,
        requestKey: "12345678-1234-1234-1234-123456789012",
      }),
    ).toThrow()
  })

  it("includes verified in-month intervals, excludes conflicted intervals, and separates cross-month ESTIMATED_ALLOCATION", async () => {
    // Month: 2026-09 (30 calendar days, 1 active source -> 30 required source-days)
    // - 20 verified daily logs = 2000.00 m3
    // - 1 verified in-month 10-day interval (Sept 11..21 Kampala) = 1000.00 m3 -> MEASURED -> completes 30/30 source-days!
    // - 1 verified interval overlapping daily records (conflict: true) = 999.00 m3 -> EXCLUDED, conflictCount = 1
    // - 1 verified cross-month electricity interval (10 days: 4 in Sept, 6 in Oct, 500.00 kWh) -> 200.00 kWh in estimatedAllocation ONLY
    // - 1 verified cross-month fuel period (7 days: 3 in Sept, 4 in Oct, 140.00 L) -> 60.00 L in estimatedAllocation ONLY
    // - 1 verified purchase-only fuel record (consumedLitres: null, expenditure 800000) -> fuelUnavailableCount = 1
    const client = makeMockClient([
      [{ hasInterval: true, hasElectricity: true, hasFuel: true, hasAsset: true }],
      [
        {
          schemeId: "s-1",
          totalWaterProducedM3: "2000.00",
          totalWaterSuppliedM3: "1950.00",
          provisionalProducedM3: "0.00",
          logsCount: 20,
          loggedDaysCount: 20,
          unknownSuppliedCount: 0,
          provisionalCount: 0,
          legacyCount: 0,
        },
      ],
      [{ schemeId: "s-1", sourceCount: 1, unconfirmed: 0, capacity: "120.00" }],
      [{ id: "src-1", schemeId: "s-1" }],
      [
        {
          id: "int-measured",
          schemeId: "s-1",
          sourceId: "src-1",
          status: "verified",
          openingTimestamp: new Date("2026-09-10T21:00:00Z"),
          closingTimestamp: new Date("2026-09-20T21:00:00Z"),
          calculatedVolumeM3: "1000.00",
          conflict: false,
        },
        {
          id: "int-conflict",
          schemeId: "s-1",
          sourceId: "src-1",
          status: "verified",
          openingTimestamp: new Date("2026-09-01T21:00:00Z"),
          closingTimestamp: new Date("2026-09-03T21:00:00Z"),
          calculatedVolumeM3: "999.00",
          conflict: true,
        },
      ],
      [
        {
          id: "elec-cross",
          schemeId: "s-1",
          assetId: "asset-e1",
          openingTimestamp: new Date("2026-09-26T21:00:00Z"),
          closingTimestamp: new Date("2026-10-06T21:00:00Z"),
          consumedKwh: "500.00",
          costUgx: "250000.00",
        },
      ],
      [
        {
          id: "fuel-cross",
          schemeId: "s-1",
          assetId: "asset-g1",
          coverageStartDate: "2026-09-28",
          coverageEndDate: "2026-10-04",
          consumedLitres: "140.00",
          expenditureUgx: "700000.00",
        },
        {
          id: "fuel-purchase-only",
          schemeId: "s-1",
          assetId: "asset-g1",
          coverageStartDate: "2026-09-10",
          coverageEndDate: "2026-09-10",
          consumedLitres: null,
          expenditureUgx: "800000.00",
        },
      ],
      [
        { id: "asset-e1", schemeId: "s-1", assetType: "electricity_meter" },
        { id: "asset-g1", schemeId: "s-1", assetType: "generator" },
      ],
      [{ schemeId: "s-1", verifiedSourceDays: 20 }],
    ])

    const [sum] = await loadProductionSummary(client, ["s-1"], "2026-09")
    expect(sum.dailyVerifiedProducedM3).toBe("2000.00")
    expect(sum.intervalMeasuredProducedM3).toBe("1000.00")
    expect(sum.totalWaterProducedM3).toBe("3000.00") // Excludes 999.00 conflicted interval
    expect(sum.intervalConflictCount).toBe(1)
    expect(sum.excludedConflictedIntervalM3).toBe("999.00")
    expect(sum.verifiedSourceDays).toBe(30)
    expect(sum.dataQualityStatus).toBe("COMPLETE")
    expect(sum.suppliedComplete).toBe(false) // Interval readings carry no supplied volume

    // Measured energy must NOT include cross-month estimated shares
    expect(sum.energy.totalKwh).toBe(0)
    expect(sum.energy.totalFuelLitres).toBe(0)
    expect(sum.energy.kwhPerM3).toBeNull()
    expect(sum.energy.fuelPerM3).toBeNull()
    expect(sum.energy.fuelUnavailableCount).toBe(1)
    expect(sum.energy.fuelUnreconciledExpenditureUgx).toBe(800000)

    // Cross-month shares appear strictly under estimatedAllocation with unaltered measured totals
    expect(sum.estimatedAllocation.present).toBe(true)
    expect(sum.estimatedAllocation.electricityKwh).toBe(200)
    expect(sum.estimatedAllocation.fuelLitres).toBe(60)
    expect(sum.estimatedAllocation.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "electricity",
          basis: "ESTIMATED_ALLOCATION",
          measuredTotal: "500.00",
          allocatedToMonth: "200.00",
        }),
        expect.objectContaining({
          kind: "fuel",
          basis: "ESTIMATED_ALLOCATION",
          measuredTotal: "140.00",
          allocatedToMonth: "60.00",
        }),
      ]),
    )
  })

  it("traces executive-report billed volume to customer meter readings (never billAmount/2000) and gates NRW", async () => {
    // Two schemes in 2026-09:
    //  - s-complete: 30/30 daily logs, produced 3100 m3, supplied 3000 m3; 10/10 metered customers billed = 2400 m3 -> NRW = 20%
    //  - s-partial:  10/30 daily logs, produced 1000 m3, supplied 950 m3; 8/10 metered customers billed = 700 m3 -> NRW = UNAVAILABLE
    const client = makeMockClient([
      // 1. targetSchemes
      [
        { id: "s-complete", name: "Kabale Central", branchName: "Kabale", clusterName: "Kigezi" },
        { id: "s-partial", name: "Ibanda North", branchName: "Ibanda", clusterName: "Ankole" },
      ],
      // 2. loadProductionSummary -> _schema_probe
      [{ hasInterval: false, hasElectricity: false, hasFuel: false, hasAsset: false }],
      // 3. loadBilledVolumes -> billingPeriod lookup
      [{ id: "bp-2026-09" }],
      // 4..6. loadProductionSummary: logs, capacityRows, activeSourceRows
      [
        {
          schemeId: "s-complete",
          totalWaterProducedM3: "3100.00",
          totalWaterSuppliedM3: "3000.00",
          provisionalProducedM3: "0.00",
          logsCount: 30,
          loggedDaysCount: 30,
          unknownSuppliedCount: 0,
          provisionalCount: 0,
          legacyCount: 0,
        },
        {
          schemeId: "s-partial",
          totalWaterProducedM3: "1000.00",
          totalWaterSuppliedM3: "950.00",
          provisionalProducedM3: "50.00",
          logsCount: 10,
          loggedDaysCount: 10,
          unknownSuppliedCount: 0,
          provisionalCount: 1,
          legacyCount: 0,
        },
      ],
      [
        { schemeId: "s-complete", sourceCount: 1, unconfirmed: 0, capacity: "120.00" },
        { schemeId: "s-partial", sourceCount: 1, unconfirmed: 1, capacity: "0.00" },
      ],
      [
        { id: "src-c", schemeId: "s-complete" },
        { id: "src-p", schemeId: "s-partial" },
      ],
      // 7..8. loadBilledVolumes: readingRows, customerRows
      [
        { schemeId: "s-complete", volume: "2400", eligibleReadings: 10, withReading: 10 },
        { schemeId: "s-partial", volume: "700", eligibleReadings: 8, withReading: 8 },
      ],
      [
        { schemeId: "s-complete", metered: 10, unmetered: 0 },
        { schemeId: "s-partial", metered: 10, unmetered: 0 },
      ],
      // 9. loadProductionSummary -> sourceDayRows
      [
        { schemeId: "s-complete", verifiedSourceDays: 30 },
        { schemeId: "s-partial", verifiedSourceDays: 10 },
      ],
    ])

    const report = await generateMonthlyWaterProductionReport(globalViewer, { month: "2026-09" }, client)
    expect(report.billingPeriodMatch).toBe("ONE")
    expect(report.items).toHaveLength(2)

    const complete = report.items.find((i) => i.schemeId === "s-complete")!
    expect(complete.billedConsumptionM3).toBe(2400)
    expect(complete.nrwStatus).toBe("AVAILABLE")
    expect(complete.nrwPercent).toBe(20) // (3000 supplied - 2400 billed) / 3000 = 20%, NOT (3100 - 2400)/3100

    const partial = report.items.find((i) => i.schemeId === "s-partial")!
    expect(partial.billedConsumptionM3).toBe(700)
    expect(partial.nrwStatus).toBe("UNAVAILABLE")
    expect(partial.nrwPercent).toBeNull()

    // Overall NRW must remain UNAVAILABLE when any scheme in scope has incomplete NRW evidence
    expect(report.totals.overallNrwStatus).toBe("UNAVAILABLE")
    expect(report.totals.overallNrwPercent).toBeNull()
  })
})
