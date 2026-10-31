// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ReportGeneratorClient } from "@/app/dashboard/reports/catalog/[id]/report-generator-client"
import { buildMonthlyProductionExcelSheets } from "@/lib/reports/production-report-export"
import type { MonthlyProductionReportOutput } from "@/lib/reports/production-executive-report"

const mocks = vi.hoisted(() => ({
  scopeOptions: vi.fn(),
  generateProdReport: vi.fn(),
  writeFile: vi.fn(),
}))

vi.mock("@/app/actions/executive-reports", () => ({
  getProductionReportScopeOptions: mocks.scopeOptions,
  getMonthlyProductionExecutiveReport: mocks.generateProdReport,
  getReportData: vi.fn(),
}))

vi.mock("@/app/actions/billing", () => ({
  getCollectionPeriods: vi.fn().mockResolvedValue([]),
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("xlsx", async () => {
  const actual = await vi.importActual<typeof import("xlsx")>("xlsx")
  return {
    ...actual,
    writeFile: mocks.writeFile,
  }
})

const sampleReport = (): MonthlyProductionReportOutput => ({
  generatedAt: "2026-10-15T10:00:00.000Z",
  reportingMonth: "2026-09",
  billingPeriodMatch: "ONE",
  billingPeriodId: "bp-2026-09",
  scope: "Cluster: Kigezi",
  nrwMethodology: {
    basis: "APPARENT_METERED_CUSTOMER_NRW",
    caveat: "Unbilled authorised consumption is not separately metered.",
  },
  totals: {
    totalSchemes: 2,
    completeSchemesCount: 1,
    partialSchemesCount: 0,
    unavailableSchemesCount: 1,
    totalVerifiedProducedM3: 3000,
    totalMeasuredElectricityKwh: 1500,
    totalMeasuredFuelLitres: 120,
    totalMeasuredEnergyCostUgx: 1350000,
    totalUnreconciledFuelLogsCount: 1,
    totalUnreconciledFuelExpenditureUgx: 800000,
    totalProvisionalRecordsCount: 2,
    billedSchemesWithReadingsCount: 1,
    billedCompleteSchemesCount: 1,
    totalBilledConsumptionM3: 2400,
    overallCompletenessPercent: 50,
    overallNrwStatus: "UNAVAILABLE",
    overallNrwPercent: null,
    estimatedAllocation: {
      basis: "ESTIMATED_ALLOCATION",
      present: true,
      producedM3: 180,
      electricityKwh: 90,
      fuelLitres: 0,
      electricityCostUgx: 63000,
      fuelExpenditureUgx: 0,
    },
  },
  items: [
    {
      schemeId: "sch-1",
      schemeName: "Kabale Central",
      branchName: "Kabale Area",
      clusterName: "Kigezi",
      dataQualityStatus: "COMPLETE",
      requiredSourceDays: 30,
      verifiedSourceDays: 30,
      missingSourceDays: 0,
      estimatedSourceDays: 0,
      completenessPercent: 100,
      verifiedProducedM3: 3000,
      dailyVerifiedProducedM3: 2000,
      intervalMeasuredProducedM3: 1000,
      intervalMeasuredCount: 1,
      intervalConflictCount: 0,
      excludedConflictedIntervalM3: 0,
      verifiedSuppliedM3: 2900,
      suppliedComplete: true,
      provisionalDailyCount: 1,
      provisionalProducedM3: 45,
      provisionalIntervalCount: 0,
      provisionalIntervalTotalM3: 0,
      averageDailyProducedM3: 100,
      monthlyCapacityM3: 3600,
      capacityUtilizationPercent: 83,
      billedConsumptionM3: 2400,
      billedDetails: {
        volumeM3: "2400.00",
        eligibleReadings: 10,
        meteredActiveCustomers: 10,
        meteredCustomersWithReading: 10,
        unmeteredActiveCustomers: 0,
      },
      billedEvidenceComplete: true,
      nrwStatus: "AVAILABLE",
      nrwPercent: 17.2,
      nrwUnavailableReasons: [],
      estimatedAllocation: {
        basis: "ESTIMATED_ALLOCATION",
        present: true,
        producedM3: 180,
        electricityKwh: 90,
        fuelLitres: 0,
        electricityCostUgx: 63000,
        fuelExpenditureUgx: 0,
        methods: ["TIME_PROPORTIONAL_UNIFORM_RATE"],
        records: [
          {
            kind: "water_interval",
            recordId: "int-cross-1",
            subjectId: "src-1",
            basis: "ESTIMATED_ALLOCATION",
            unit: "m3",
            measuredTotal: "450.00",
            allocatedToMonth: "180.00",
            method: "TIME_PROPORTIONAL_UNIFORM_RATE",
            uncertainty: "Uniform flow rate assumed across boundary",
            maxAbsoluteError: "270.00",
            fraction: { numerator: 2, denominator: 5 },
          },
        ],
      },
      energy: {
        totalKwh: 1500,
        totalFuelLitres: 120,
        totalEnergyCostUgx: 1350000,
        kwhPerM3: 0.5,
        fuelPerM3: 0.04,
        electricityCoverageComplete: true,
        fuelCoverageComplete: true,
        fuelUnavailableCount: 1,
        fuelUnreconciledExpenditureUgx: 800000,
        provisionalElectricityCount: 1,
        provisionalElectricityKwh: 85,
        provisionalFuelCount: 0,
        provisionalFuelLitres: 0,
      },
    },
    {
      schemeId: "sch-2",
      schemeName: "Kisoro Gravity",
      branchName: "Kisoro Area",
      clusterName: "Kigezi",
      dataQualityStatus: "UNAVAILABLE",
      requiredSourceDays: 30,
      verifiedSourceDays: 0,
      missingSourceDays: 30,
      estimatedSourceDays: 0,
      completenessPercent: 0,
      verifiedProducedM3: 0,
      dailyVerifiedProducedM3: 0,
      intervalMeasuredProducedM3: 0,
      intervalMeasuredCount: 0,
      intervalConflictCount: 0,
      excludedConflictedIntervalM3: 0,
      verifiedSuppliedM3: null,
      suppliedComplete: false,
      provisionalDailyCount: 0,
      provisionalProducedM3: 0,
      provisionalIntervalCount: 0,
      provisionalIntervalTotalM3: 0,
      averageDailyProducedM3: null,
      monthlyCapacityM3: null,
      capacityUtilizationPercent: null,
      billedConsumptionM3: null,
      billedDetails: null,
      billedEvidenceComplete: false,
      nrwStatus: "UNAVAILABLE",
      nrwPercent: null,
      nrwUnavailableReasons: ["Production data is incomplete or unavailable"],
      estimatedAllocation: {
        basis: "ESTIMATED_ALLOCATION",
        present: false,
        producedM3: 0,
        electricityKwh: 0,
        fuelLitres: 0,
        electricityCostUgx: 0,
        fuelExpenditureUgx: 0,
        methods: [],
        records: [],
      },
      energy: {
        totalKwh: 0,
        totalFuelLitres: 0,
        totalEnergyCostUgx: 0,
        kwhPerM3: null,
        fuelPerM3: null,
        electricityCoverageComplete: false,
        fuelCoverageComplete: false,
        fuelUnavailableCount: 0,
        fuelUnreconciledExpenditureUgx: 0,
        provisionalElectricityCount: 0,
        provisionalElectricityKwh: 0,
        provisionalFuelCount: 0,
        provisionalFuelLitres: 0,
      },
    },
  ],
})

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

describe("Monthly Water Production & Energy Executive Report UI & Export", () => {
  it("filters by month, cluster, area and scheme, distinguishes all 8 data classes, and exports a 3-sheet Excel workbook", async () => {
    mocks.scopeOptions.mockResolvedValue({
      defaultMonth: "2026-09",
      clusters: [
        { id: "c-kigezi", name: "Kigezi" },
        { id: "c-ankole", name: "Ankole" },
      ],
      branches: [
        { id: "b-kabale", name: "Kabale Area", clusterId: "c-kigezi" },
        { id: "b-ibanda", name: "Ibanda Area", clusterId: "c-ankole" },
      ],
      schemes: [
        { id: "sch-1", name: "Kabale Central", branchId: "b-kabale", clusterId: "c-kigezi" },
        { id: "sch-3", name: "Ibanda North", branchId: "b-ibanda", clusterId: "c-ankole" },
      ],
    })
    mocks.generateProdReport.mockResolvedValue(sampleReport())

    render(
      <ReportGeneratorClient
        reportId="monthly-water-production"
        title="Monthly Water Production & Energy Performance"
      />,
    )

    await waitFor(() => expect(mocks.scopeOptions).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText("Reporting Month"), { target: { value: "2026-09" } })
    fireEvent.change(screen.getByLabelText("Cluster filter"), { target: { value: "c-kigezi" } })
    // Cascading filter hides Ankole's branch
    expect(screen.queryByText("Ibanda Area")).toBeNull()
    fireEvent.change(screen.getByLabelText("Area filter"), { target: { value: "b-kabale" } })
    fireEvent.change(screen.getByLabelText("Scheme filter"), { target: { value: "sch-1" } })

    fireEvent.click(screen.getByText("Generate Report"))
    await waitFor(() =>
      expect(mocks.generateProdReport).toHaveBeenCalledWith({
        month: "2026-09",
        clusterId: "c-kigezi",
        branchId: "b-kabale",
        schemeId: "sch-1",
      }),
    )

    // Verify clear visual distinction across all required data categories
    expect((await screen.findAllByText(/3,000\.00 m³/)).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/UNAVAILABLE \(no verified records\)/)).toBeTruthy()
    expect(screen.getByText(/NRW: 17\.2%/)).toBeTruthy()
    expect(screen.getByText(/Production data is incomplete or unavailable/)).toBeTruthy()
    expect(screen.getByText(/0\.5 kWh\/m³/)).toBeTruthy()
    expect(screen.getByText(/0\.04 L\/m³/)).toBeTruthy()
    expect(screen.getByText(/purchase-only log\(s\) — consumption UNKNOWN/)).toBeTruthy()
    expect(screen.getByText(/TIME_PROPORTIONAL_UNIFORM_RATE/)).toBeTruthy()
    expect(screen.getByText(/Dedicated server-side PDF rendering is not yet installed/)).toBeTruthy()

    // Verify 3-sheet Excel workbook export
    fireEvent.click(screen.getByText(/Export Excel \(\.xlsx\)/))
    expect(mocks.writeFile).toHaveBeenCalledTimes(1)
    const [workbook, filename] = mocks.writeFile.mock.calls[0]
    expect(filename).toBe("SWUWS_monthly-water-production_2026-09.xlsx")
    expect(workbook.SheetNames).toEqual([
      "Executive Summary",
      "Scheme Performance",
      "Cross-Month Allocations",
    ])

    const sheets = buildMonthlyProductionExcelSheets(sampleReport())
    expect(sheets.schemePerformance[0]["Verified Measured Prod (m3)"]).toBe(3000)
    expect(sheets.schemePerformance[1]["Verified Measured Prod (m3)"]).toBe("UNAVAILABLE")
    expect(sheets.crossMonthAllocations[0]["Basis"]).toBe("ESTIMATED_ALLOCATION")
  })
})
