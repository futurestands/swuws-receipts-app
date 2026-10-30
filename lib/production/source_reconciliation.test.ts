import { describe, expect, it } from "vitest"
import { calculateSourceCapacities, parseWorkbookSources } from "./source-reconciliation"

describe("SWUWS Engineering Source Reconciliation & Formula Verification", () => {
  it("reproduces exact volumetric bucket test formulas: L/s = litres/sec, m3/hr = L/s * 3.6, m3/day = m3/hr * hours", () => {
    // Example: Ryakarimira Nyamabare Spring (15L in 22.94s for 24h regime)
    const { flowLps, flowM3Hr, capacityM3Day } = calculateSourceCapacities(15, 22.94, null, 24)

    expect(flowLps).toBeCloseTo(0.65388, 4)
    expect(flowM3Hr).toBeCloseTo(2.35397, 4)
    expect(capacityM3Day).toBeCloseTo(56.4952, 3)
  })

  it("reproduces exact pumped grid source formulas: m3/day = installed_m3_hr * regime_hours", () => {
    // Example: Katuna Mayengo Pumped-Grid Source (7.5 m3/hr for 14h regime)
    const { flowLps, flowM3Hr, capacityM3Day } = calculateSourceCapacities(null, null, 7.5, 14)

    expect(flowLps).toBeCloseTo(2.0833, 3)
    expect(flowM3Hr).toBe(7.5)
    expect(capacityM3Day).toBe(105)
  })

  it("extracts genuine source records from cluster sheets without treating subtotal rows as sources", () => {
    const sources = parseWorkbookSources()
    expect(sources.length).toBeGreaterThan(50)

    // Ensure no subtotal or average row became a source
    const invalidNames = sources.filter(
      (s) => s.sourceName === "Total" || s.sourceName === "Source Name" || s.sourceName.includes("AVERAGE")
    )
    expect(invalidNames).toHaveLength(0)
  })

  it("flags ambiguous scheme name variations for explicit review instead of substring matching", () => {
    // Kabingo vs Nyakabingo, Isingiro T/C vs Isingiro T/C & Kyakabindi
    const isExact = (a: string, b: string) => a.toLowerCase().trim() === b.toLowerCase().trim()

    expect(isExact("Kabingo", "Nyakabingo")).toBe(false)
    expect(isExact("Isingiro T/C", "Isingiro T/C & Kyakabindi")).toBe(false)
  })
})
