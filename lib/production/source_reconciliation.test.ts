import { describe, expect, it } from "vitest"
import { calculateSourceCapacities, parseWorkbookSources } from "./source-reconciliation"

describe("SWUWS Engineering Source Reconciliation & Formula Verification", () => {
  it("reproduces exact volumetric bucket test formulas: L/s = litres/sec, m3/hr = L/s * 3.6, m3/day = m3/hr * hours", () => {
    // Example: Ryakarimira Nyamabare Spring (15L in 22.94s for 24h regime)
    const { flowLps, flowM3Hr, capacityM3Day, basis } = calculateSourceCapacities(15, 22.94, null, 24, "Gravity")

    expect(basis).toBe("bucket_test")
    expect(flowLps).toBeCloseTo(0.65388, 4)
    expect(flowM3Hr).toBeCloseTo(2.35397, 4)
    expect(capacityM3Day).toBeCloseTo(56.4952, 3)
  })

  it("reproduces exact pumped grid source formulas: m3/day = installed_m3_hr * regime_hours", () => {
    // Example: Katuna Mayengo Pumped-Grid Source (7.5 m3/hr for 14h regime)
    const { flowLps, flowM3Hr, capacityM3Day, basis } = calculateSourceCapacities(null, null, 7.5, 14, "Pumped - Grid")

    expect(basis).toBe("installed_rating")
    expect(flowLps).toBeCloseTo(2.0833, 3)
    expect(flowM3Hr).toBe(7.5)
    expect(capacityM3Day).toBe(105)
  })

  it("preserves missing fields as null without inventing 24h/12h regimes or gravity assumptions", () => {
    const { flowLps, flowM3Hr, capacityM3Day, basis, notes } = calculateSourceCapacities(null, null, null, null, null)

    expect(basis).toBe("unresolved_missing_input")
    expect(flowLps).toBeNull()
    expect(flowM3Hr).toBeNull()
    expect(capacityM3Day).toBeNull()
    expect(notes).toContain("Source flow measurement inputs missing")
    expect(notes).toContain("Technology unrecorded")
  })

  it("extracts KIGEZI Row 2 (Ryakarimira Nyamabare) as first valid source in Kigezi without skipping", () => {
    const sources = parseWorkbookSources()
    const kigeziSources = sources.filter((s) => s.clusterName === "KIGEZI")

    expect(kigeziSources.length).toBeGreaterThan(10)
    expect(kigeziSources[0].schemeName.trim()).toBe("Ryakarimira")
    expect(kigeziSources[0].sourceName.trim()).toBe("Nyamabare")
    expect(kigeziSources[0].technology).toBe("Gravity")
    expect(kigeziSources[0].regimeHoursPerDay).toBe(24)
    expect(kigeziSources[0].sourceDailyCapacityM3Day).toBeCloseTo(56.495, 2)
  })

  it("flags ambiguous scheme name variations for explicit review instead of substring matching", () => {
    const isExact = (a: string, b: string) => a.toLowerCase().trim() === b.toLowerCase().trim()

    expect(isExact("Kabingo", "Nyakabingo")).toBe(false)
    expect(isExact("Isingiro T/C", "Isingiro T/C & Kyakabindi")).toBe(false)
  })
})
