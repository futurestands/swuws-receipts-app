import { describe, expect, it, vi } from "vitest"
vi.mock("@/lib/db",()=>({db:{}}))
import { coveragePercent, productionMonth } from "./reporting"
import { calculatePeriodDelta } from "@/lib/intelligence/trends"

describe("production calendar reporting",()=>{
  it.each([["2024-02",29],["2023-02",28],["2024-04",30],["2024-01",31]] as const)("uses calendar days for %s",(month,days)=>expect(productionMonth(month,new Date("2026-01-01Z")).expectedDays).toBe(days))
  it("uses Kampala date for elapsed coverage",()=>{
    expect(productionMonth("2024-02",new Date("2024-02-09T22:00:00Z")).expectedDays).toBe(10)
    expect(productionMonth("2024-03",new Date("2024-02-09T22:00:00Z")).expectedDays).toBe(0)
  })
  it("crosses year boundaries and does not use collection-window dates",()=>expect(productionMonth("2024-01").previousMonth).toBe("2023-12"))
  it("does not invent coverage for a future month",()=>expect(coveragePercent(0,0)).toBe(0))
  it("preserves absolute change but has no percentage for a zero baseline",()=>expect(calculatePeriodDelta({schemeId:"s",schemeName:"S",metric:"Production",currentValue:5,previousValue:0,unit:"m³"})).toMatchObject({deltaValue:5,deltaPercent:null}))
})
