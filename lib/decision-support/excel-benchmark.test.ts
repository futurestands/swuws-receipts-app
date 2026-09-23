import { describe, it, expect } from "vitest"
import { parseExcelReferenceDataset } from "./excel-reference"
import { getExcelReferencePerformanceDataset } from "./excel-fixture"
import { validateWaterBalanceAndCapacity } from "./data-validation"
import { generateBoardPackPptx } from "./board-pack"
import JSZip from "jszip"

describe("SWUWS Excel Reference Benchmark & Decision Support Pipeline", () => {
  it("Test 1: should parse global target.xlsx and distinguish 64 operational schemes from sub-source rows", () => {
    const dataset = parseExcelReferenceDataset()
    expect(dataset.fileFound).toBe(true)
    expect(dataset.totalAreas).toBe(10)
    expect(dataset.operationalSchemeCount).toBe(64)
    expect(dataset.referenceSourceRowCount).toBe(6)
    expect(dataset.totalSchemes).toBe(70)
    expect(dataset.periods.map((p) => p.periodName)).toEqual(["July", "August", "September"])
  })

  it("Test 2: should verify exact September vs Total column index mapping", () => {
    const dataset = parseExcelReferenceDataset()
    const ryakarimira = dataset.schemes.find((s) => s.schemeName.toLowerCase() === "ryakarimira")
    expect(ryakarimira).toBeDefined()
    expect(ryakarimira?.julyProducedM3).toBe(810)
    expect(ryakarimira?.augustProducedM3).toBe(900)
    expect(ryakarimira?.septemberProducedM3).toBe(0)     // row[7] empty in workbook
    expect(ryakarimira?.totalProducedM3).toBe(1710)     // row[8] is Total
    expect(ryakarimira?.julySoldM3).toBe(746)
    expect(ryakarimira?.augustSoldM3).toBe(823)
    expect(ryakarimira?.septemberSoldM3).toBe(0)         // row[13] empty in workbook
    expect(ryakarimira?.totalSoldM3).toBe(1569)        // row[14] is Total
  })

  it("Test 3: should verify sales period deltas between July and August dynamically", () => {
    const dataset = parseExcelReferenceDataset()
    const ryakarimira = dataset.schemes.find((s) => s.schemeName.toLowerCase() === "ryakarimira")
    if (ryakarimira) {
      const expectedSalesDelta = ryakarimira.augustSoldM3 - ryakarimira.julySoldM3
      expect(expectedSalesDelta).toBe(823 - 746) // +77 m3
    }
  })

  it("Test 4: should independently calculate capacity utilization and raw loss indicator without hardcoded answers", () => {
    const prod = 810
    const sold = 746
    const cap = 1694.8561464690495

    const val = validateWaterBalanceAndCapacity({
      waterProducedM3: prod,
      waterBilledSoldM3: sold,
      loggedDaysCount: 31,
      daysInPeriod: 31,
      practicalCapacityM3Period: cap,
    })

    const expectedUtil = (prod / cap) * 100
    const expectedLoss = ((prod - sold) / prod) * 100

    expect(val.capacityUtilizationPercent).toBeCloseTo(expectedUtil, 1)
    expect(val.rawCalculatedLossIndicator).toBeCloseTo(expectedLoss, 1)
  })

  it("Test 5: should preserve raw negative loss when water sold exceeds recorded production", () => {
    const val = validateWaterBalanceAndCapacity({
      waterProducedM3: 100,
      waterBilledSoldM3: 110,
      loggedDaysCount: 30,
      daysInPeriod: 30,
      practicalCapacityM3Period: 200,
    })

    expect(val.rawCalculatedLossIndicator).toBe(-10)
    expect(val.lossValidationStatus).toBe("DATA_INCONSISTENCY")
    expect(val.displayLossIndicator).toContain("(Inconsistent)")
  })

  it("Test 6: should generate a valid 14-slide Board Pack PowerPoint (.pptx) package and verify complete OpenXML structure", async () => {
    const dataset = getExcelReferencePerformanceDataset("august")
    const pptxBuffer = await generateBoardPackPptx(dataset)

    // Programmatically inspect OpenXML ZIP package
    const zip = await JSZip.loadAsync(pptxBuffer)
    const files = Object.keys(zip.files)

    // 1. Verify [Content_Types].xml
    expect(files).toContain("[Content_Types].xml")
    const contentTypesText = await zip.file("[Content_Types].xml")?.async("string")
    expect(contentTypesText).toContain("slide14.xml")

    // 2. Verify presentation.xml and slide ID list
    expect(files).toContain("ppt/presentation.xml")
    const presentationText = await zip.file("ppt/presentation.xml")?.async("string")
    expect(presentationText).toContain('id="269"') // 255 + 14 = 269

    // 3. Verify exactly 14 slide XML parts
    const slideFiles = files.filter((f) => f.startsWith("ppt/slides/slide") && f.endsWith(".xml") && !f.includes("_rels"))
    expect(slideFiles.length).toBe(14)

    // 4. Verify all 14 slide relationship files exist
    const relFiles = files.filter((f) => f.startsWith("ppt/slides/_rels/slide") && f.endsWith(".rels"))
    expect(relFiles.length).toBe(14)

    // 5. Inspect unique text content across slides
    const slide1Text = await zip.file("ppt/slides/slide1.xml")?.async("string")
    expect(slide1Text).toContain("SWUWS Board Performance Review")

    const slide9Text = await zip.file("ppt/slides/slide9.xml")?.async("string")
    expect(slide9Text).toContain("Dynamic Scheme Performance Matrix")

    const slide10Text = await zip.file("ppt/slides/slide10.xml")?.async("string")
    expect(slide10Text).toContain("What Changed? Period-over-Period Deltas")

    const slide11Text = await zip.file("ppt/slides/slide11.xml")?.async("string")
    expect(slide11Text).toContain("Management Attention Items & Anomalies")

    const slide13Text = await zip.file("ppt/slides/slide13.xml")?.async("string")
    expect(slide13Text).toContain("Data Quality & Reporting Limitations")
  })
})
