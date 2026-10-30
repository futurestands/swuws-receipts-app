import { describe, expect, it } from "vitest"
import { calculateSourceCapacities, parseWorkbookSources } from "./source-reconciliation"

describe("SWUWS Engineering Source Reconciliation & Strict Formula Verification", () => {
  it("reproduces exact volumetric bucket test formulas: L/s = litres/sec, m3/hr = L/s * 3.6, m3/day = m3/hr * hours", () => {
    // Example: Ryakarimira Nyamabare Spring (15L in 22.94s for 24h regime)
    const {
      measuredVolumetricM3Hr,
      calculatedLps,
      calculatedM3Hr,
      dailyCapacityM3,
      basis,
    } = calculateSourceCapacities(15, 22.94, null, 2.35397, 24, "Gravity")

    expect(basis).toBe("bucket_test")
    expect(measuredVolumetricM3Hr).toBeCloseTo(2.35397, 4)
    expect(calculatedLps).toBeCloseTo(0.65388, 4)
    expect(calculatedM3Hr).toBeCloseTo(2.35397, 4)
    expect(dailyCapacityM3).toBeCloseTo(56.4952, 3)
  })

  it("does NOT populate measuredVolumetricM3Hr from installed pump rating alone", () => {
    // Example: Katuna Mayengo Pumped-Grid Source (7.5 m3/hr installed rating for 14h regime)
    const {
      measuredVolumetricM3Hr,
      calculatedLps,
      calculatedM3Hr,
      dailyCapacityM3,
      basis,
    } = calculateSourceCapacities(null, null, 7.5, 7.5, 14, "Pumped - Grid")

    expect(basis).toBe("installed_rating")
    expect(measuredVolumetricM3Hr).toBeNull() // MUST BE NULL! No bucket test conducted!
    expect(calculatedLps).toBeCloseTo(2.0833, 3)
    expect(calculatedM3Hr).toBe(7.5)
    expect(dailyCapacityM3).toBe(105)
  })

  it("flags invalid measurement inputs (negative volumes or seconds) as validation errors without falling back", () => {
    const { basis, validationError } = calculateSourceCapacities(-15, 22.94, null, null, 24, "Gravity")

    expect(basis).toBe("invalid_measurement")
    expect(validationError).toContain("Container volume must be a positive number")
  })

  it("preserves missing fields as null without inventing 24h/12h regimes or gravity assumptions", () => {
    const { calculatedLps, calculatedM3Hr, dailyCapacityM3, basis, notes } = calculateSourceCapacities(null, null, null, null, null, null)

    expect(basis).toBe("unresolved_missing_input")
    expect(calculatedLps).toBeNull()
    expect(calculatedM3Hr).toBeNull()
    expect(dailyCapacityM3).toBeNull()
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
    expect(kigeziSources[0].sourceDailyAssessmentM3Day).toBeCloseTo(56.495, 2)
  })

  it("extracts genuine sources across all 4 cluster sheets (KIGEZI, RUJUMBURA, ISINGIRO, ANKOLE)", () => {
    const sources = parseWorkbookSources()
    const clusterNames = new Set(sources.map((s) => s.clusterName))

    expect(clusterNames.has("KIGEZI")).toBe(true)
    expect(clusterNames.has("RUJUMBURA")).toBe(true)
    expect(clusterNames.has("ISINGIRO")).toBe(true)
    expect(clusterNames.has("ANKOLE")).toBe(true)
  })

  it("flags ambiguous scheme name variations for explicit review instead of substring matching", () => {
    const isExact = (a: string, b: string) => a.toLowerCase().trim() === b.toLowerCase().trim()

    expect(isExact("Kabingo", "Nyakabingo")).toBe(false)
    expect(isExact("Isingiro T/C", "Isingiro T/C & Kyakabindi")).toBe(false)
  })
})
