import { describe, expect, it } from "vitest"
import { evaluateCommercialPerformance, type SchemeCommercialInput } from "./commercial"
const data: SchemeCommercialInput = { schemeId: "s", schemeName: "Spring", totalBilledUgx: 100, currentBilledUgx: 100, totalCashCollectedUgx: 20, cashToArrearsUgx: 0, totalArrearsUgx: 80, dataCompletenessPercent: 100, collectionBasis: "balance_inference" }
describe("commercial evidence separates legacy rules from approved targets and estimates", () => {
  it("retains the 85 percent heuristic as an unapproved assumption, not a target", () => {
    const f = evaluateCommercialPerformance(data)[0]
    expect(f).toMatchObject({ severity: "watch", confidence: "MEDIUM", evidence: { additionalDetails: { legacyReferencePercent: 85, ruleApproval: "UNRESOLVED", lowRateThresholdPercent: 60 } } })
    expect(f.evidence.baseline).toBeUndefined(); expect(f.evidence.variance).toBeUndefined()
    expect(f.recommendation).not.toContain("disconnection")
    expect(f.title).toContain("Estimated")
  })
  it("does not treat omitted, missing or nonfinite cash provenance as verified receipts", () => {
    expect(evaluateCommercialPerformance({ ...data, collectionBasis: undefined })).toEqual([])
    expect(evaluateCommercialPerformance({ ...data, totalCashCollectedUgx: NaN })).toEqual([])
    expect(evaluateCommercialPerformance({ ...data, collectionBasis: "unavailable" })).toEqual([])
  })
  it("retains the existing low-rate review for explicitly verified receipt inputs", () => {
    expect(evaluateCommercialPerformance({ ...data, collectionBasis: "verified_receipts" })[0]).toMatchObject({ severity: "critical", confidence: "HIGH", evidence: { actual: 20 } })
  })
})
