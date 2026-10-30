import { beforeEach, describe, expect, it, vi } from "vitest"
import JSZip from "jszip"
import { displayMeasurement } from "./display"
import { nonNegativeNumber } from "./data-validation"
import { generateManagementReport } from "./reports"
import { generateBoardPackPptx } from "./board-pack"
import { generateManagementAttentionItems } from "./attention-engine"
import { evaluateCapacityUtilization } from "@/lib/intelligence/capacity"
import type { UserPermissionsContext } from "@/lib/permissions"
const mock = vi.hoisted(() => ({ select: vi.fn(), summary: vi.fn() }))
vi.mock("@/lib/db", () => ({ db: { select: mock.select } }))
vi.mock("@/lib/production/reporting", async original => ({ ...await original<typeof import("@/lib/production/reporting")>(), loadProductionSummary: mock.summary }))
import { getTrustedPerformanceDataset } from "./performance-engine"
const user = { id: "reader", role: "admin", organizationId: "org", permissions: [], grants: [] } as UserPermissionsContext
function queries(target: unknown = "200", sales = true, targetOverride?: unknown[]) {
  const result: unknown[][] = [
    [{ id: "s", name: "Spring & Pump", branchId: "b" }],
    [{ id: "p", periodName: "July 2024", year: 2024, month: 7 }],
    sales ? [{ schemeId: "s", totalConsumptionM3: "80", totalBilledAmount: "100", readingsCount: 1 }] : [],
    [{ schemeId: "s", totalCurrentBilled: "100", totalArrearsBilled: "0", cashToArrears: "0", cashToCurrent: "20", totalDue: "80" }],
    targetOverride ?? [{ schemeId: "s", targetProductionM3: target, targetCollectionEfficiencyPercent: null }],
  ]
  mock.select.mockImplementation(() => {
    const rows = result.shift() ?? []
    const b = { from: () => b, where: () => b, orderBy: () => b, limit: () => b, innerJoin: () => b, groupBy: () => b, then: (resolve: (v: unknown[]) => unknown) => Promise.resolve(rows).then(resolve) }
    return b
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  mock.summary.mockResolvedValue([{ schemeId: "s", totalWaterProducedM3: "100", totalWaterSuppliedM3: "0", currentCapacityM3Month: 105, loggedDaysCount: 31, available: true, suppliedComplete: false, provisionalProducedM3: "0", legacyCount: 0 }])
})
describe("target and provenance boundaries", () => {
  it.each([null, undefined, "", " ", true, "NaN", "Infinity", Infinity, NaN, "-1", -1, "0x10"])("rejects invalid numeric input %s", value => expect(nonNegativeNumber(value)).toBeNull())
  it.each([0, "0", "0.00", "2.50"])("preserves an explicit finite value %s", value => expect(nonNegativeNumber(value)).toBe(Number(value)))
  it.each(["NaN", "Infinity", "-1", null, undefined, ""])("does not aggregate invalid target %s", async target => {
    queries(target, true, [{ schemeId: "s", targetProductionM3: target }])
    const d = await getTrustedPerformanceDataset(user, "p")
    expect(d.kpis.targetProductionM3).toBeNull()
    expect(d.dataQuality.issues.some(i => i.includes("Production target unresolved"))).toBe(true)
  })
  it("rejects duplicate/missing target membership rather than relying on row count", async () => {
    queries("0", true, [{ schemeId: "s", targetProductionM3: "1" }, { schemeId: "s", targetProductionM3: "2" }])
    expect((await getTrustedPerformanceDataset(user, "p")).kpis.targetProductionM3).toBeNull()
    queries("0", true, [])
    expect((await getTrustedPerformanceDataset(user, "p")).kpis.targetProductionM3).toBeNull()
  })
  it("retains explicit zero targets and observed zero measurements", async () => {
    queries("0"); expect((await getTrustedPerformanceDataset(user, "p")).kpis.targetProductionM3).toBe(0)
    expect(displayMeasurement(0, true)).toBe("0")
    expect(displayMeasurement(85, undefined, "percent")).toBe("Unresolved")
  })
  it("withholds legacy financial metrics when provenance flags are absent", async () => {
    queries(); const d = await getTrustedPerformanceDataset(user, "p"); delete d.availability
    const rows = generateManagementReport("monthly_management", d).sections[0].metricsTable!.rows
    expect(rows.find(r => r[0] === "Cash Collected")).toEqual(["Cash Collected", "Unresolved", "UNRESOLVED"])
    expect(rows.find(r => r[0] === "Water Sold (Billed)")?.[2]).toBe("INCOMPLETE_DATA")
    d.availability = { sales: true, billing: true, collections: true, arrears: true }; d.kpis.totalCashCollectedUgx = NaN
    expect(generateManagementReport("monthly_management", d).sections[0].metricsTable!.rows.find(r => r[0] === "Cash Collected")).toEqual(["Cash Collected", "Unresolved", "UNRESOLVED"])
    d.kpis.totalCashCollectedUgx = 20
    expect(generateManagementReport("monthly_management", d).sections[0].metricsTable!.rows.find(r => r[0] === "Cash Collected")?.[2]).toBe("UNRESOLVED")
    d.collectionBasis = "verified_receipts"
    expect(generateManagementReport("monthly_management", d).sections[0].metricsTable!.rows.find(r => r[0] === "Cash Collected")?.[2]).toBe("VALID")
  })
})
describe("independent capacity evidence and honest Board reporting", () => {
  it("retains capacity attention when sales are missing, but not when production coverage is unknown", async () => {
    queries("200", false); const d = await getTrustedPerformanceDataset(user, "p")
    expect(d.schemesMatrix[0].dataQualityStatus).toBe("INCOMPLETE_DATA")
    expect(generateManagementAttentionItems(d).find(f => f.category === "capacity")).toMatchObject({ severity: "critical", evidence: { dataCompletenessPercent: 100 } })
    delete d.schemesMatrix[0].productionDayCoveragePercent
    expect(generateManagementAttentionItems(d).some(f => f.category === "capacity")).toBe(false)
  })
  it("uses the unrounded underused band", () => {
    const f = evaluateCapacityUtilization({ schemeId: "s", schemeName: "Spring", actualProductionM3Month: 49.999, practicalCapacityM3Month: 100, dataCompletenessPercent: 100 })
    expect(f[0]).toMatchObject({ id: "cap-underutilized-s", severity: "watch" })
  })
  it("keeps all fourteen slides and replaces unsupported status claims with evidence", async () => {
    queries("200", false); const d = await getTrustedPerformanceDataset(user, "p")
    const zip = await JSZip.loadAsync(await generateBoardPackPptx(d))
    expect(Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))).toHaveLength(14)
    const text = async (n: number) => zip.file(`ppt/slides/slide${n}.xml`)!.async("string")
    expect(await text(4)).not.toContain("Approved TPS Targets")
    expect(await text(10)).toContain("No verified period comparison")
    expect(await text(11)).toContain("Critical Capacity at Spring &amp; Pump")
    expect(await text(12)).toContain("register data unavailable")
    expect(await text(12)).not.toContain("No open management actions")
  })
})
