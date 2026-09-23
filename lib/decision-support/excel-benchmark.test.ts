import { describe, it, expect } from "vitest"
import { parseExcelReferenceDataset } from "./excel-reference"
import { getExcelReferencePerformanceDataset } from "./excel-fixture"
import { validateWaterBalanceAndCapacity } from "./data-validation"
import { generateBoardPackPptx } from "./board-pack"
import JSZip from "jszip"

describe("SWUWS Excel Reference Benchmark & Decision Support Pipeline", () => {
  it("should parse global target.xlsx and discover all 10 areas and 64 schemes across 3 periods", () => {
    const dataset = parseExcelReferenceDataset()
    expect(dataset.fileFound).toBe(true)
    expect(dataset.totalAreas).toBeGreaterThanOrEqual(10)
    expect(dataset.totalSchemes).toBeGreaterThanOrEqual(60)
    expect(dataset.periods.map((p) => p.periodName)).toEqual(["July", "August", "September"])

    // Check specific benchmark schemes
    const ryakarimira = dataset.schemes.find((s) => s.schemeName.toLowerCase() === "ryakarimira")
    expect(ryakarimira).toBeDefined()
    expect(ryakarimira?.practicalCapacityM3Month).toBeGreaterThan(1600)
    expect(ryakarimira?.julyProducedM3).toBe(810)
    expect(ryakarimira?.augustProducedM3).toBe(900)
    expect(ryakarimira?.septemberProducedM3).toBe(1710)
  })

  it("should independently reproduce capacity utilization and raw loss indicator formulas", () => {
    // Ryakarimira: July Produced = 810 m3, Practical Capacity = 1694.86 m3, July Sold = 746 m3
    const val = validateWaterBalanceAndCapacity({
      waterProducedM3: 810,
      waterBilledSoldM3: 746,
      loggedDaysCount: 31,
      daysInPeriod: 31,
      practicalCapacityM3Period: 1694.8561464690495,
    })

    // Capacity Utilisation % = (810 / 1694.856) * 100 = 47.79%
    expect(val.capacityUtilizationPercent).toBeCloseTo(47.8, 1)

    // Raw Loss % = ((810 - 746) / 810) * 100 = 7.9%
    expect(val.rawCalculatedLossIndicator).toBeCloseTo(7.9, 1)
  })

  it("should preserve negative raw loss indicators when water sold exceeds recorded production", () => {
    // Test anomaly where Sold > Produced (e.g. Produced = 100, Sold = 110)
    const val = validateWaterBalanceAndCapacity({
      waterProducedM3: 100,
      waterBilledSoldM3: 110,
      loggedDaysCount: 30,
      daysInPeriod: 30,
      practicalCapacityM3Period: 200,
    })

    // Loss = ((100 - 110) / 100) * 100 = -10.0%
    expect(val.rawCalculatedLossIndicator).toBe(-10)
    expect(val.lossValidationStatus).toBe("DATA_INCONSISTENCY")
    expect(val.displayLossIndicator).toContain("(Inconsistent)")
  })

  it("should generate a valid 14-slide Board Pack PowerPoint (.pptx) package and verify OpenXML structure", async () => {
    const dataset = getExcelReferencePerformanceDataset("august")
    const pptxBuffer = await generateBoardPackPptx(dataset)

    // Programmatically inspect OpenXML ZIP package
    const zip = await JSZip.loadAsync(pptxBuffer)
    const files = Object.keys(zip.files)

    // 1. Verify [Content_Types].xml
    expect(files).toContain("[Content_Types].xml")

    // 2. Verify exactly 14 slide XML parts
    const slideFiles = files.filter((f) => f.startsWith("ppt/slides/slide") && f.endsWith(".xml"))
    expect(slideFiles.length).toBe(14)

    // 3. Inspect slide 1 text content
    const slide1Text = await zip.file("ppt/slides/slide1.xml")?.async("string")
    expect(slide1Text).toContain("SWUWS Board Performance Review")
    expect(slide1Text).toContain("August")

    // 4. Inspect slide 2 text content
    const slide2Text = await zip.file("ppt/slides/slide2.xml")?.async("string")
    expect(slide2Text).toContain("Executive Performance Summary")
  })
})
