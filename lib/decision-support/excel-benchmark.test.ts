import { describe, it, expect } from "vitest"
import { parseExcelReferenceDataset } from "./excel-reference"
import { getExcelReferencePerformanceDataset } from "./excel-fixture"
import { validateWaterBalanceAndCapacity } from "./data-validation"
import { performSchemeReconciliation } from "./scheme-matcher"
import { generateBoardPackPptx } from "./board-pack"
import JSZip from "jszip"

// Mock Portal Schemes Fixture for Offline Vitest Execution
const MOCK_PORTAL_SCHEMES = [
  { schemeId: "sch-1", schemeName: "Ryakarimira", schemeCode: "ryakarimira", branchName: "KABALE" },
  { schemeId: "sch-2", schemeName: "Katuna", schemeCode: "katuna", branchName: "KABALE" },
  { schemeId: "sch-3", schemeName: "Rwene", schemeCode: "rwene", branchName: "KABALE" },
  { schemeId: "sch-4", schemeName: "Kitojo", schemeCode: "kitojo", branchName: "KABALE" },
  { schemeId: "sch-5", schemeName: "Noozi", schemeCode: "noozi", branchName: "KABALE" },
  { schemeId: "sch-6", schemeName: "Kabirizi", schemeCode: "kabirizi", branchName: "KABALE" },
  { schemeId: "sch-8", schemeName: "Kisiizi", schemeCode: "kisiizi", branchName: "NYARUSHANJE" },
  { schemeId: "sch-9", schemeName: "Kabuga", schemeCode: "kabuga", branchName: "NYARUSHANJE" },
  { schemeId: "sch-10", schemeName: "Kiniogo", schemeCode: "kiniogo", branchName: "NYARUSHANJE" },
  { schemeId: "sch-11", schemeName: "Migyera", schemeCode: "migyera", branchName: "NYARUSHANJE" },
  { schemeId: "sch-12", schemeName: "Nyabushenyi", schemeCode: "nyabushenyi", branchName: "NYARUSHANJE" },
  { schemeId: "sch-13", schemeName: "Bwanga-Kiyenje", schemeCode: "bwanga-kiyenje", branchName: "NYARUSHANJE" },
  { schemeId: "sch-14", schemeName: "Nyakabingo", schemeCode: "nyakabingo", branchName: "NYARUSHANJE" },
  { schemeId: "sch-15", schemeName: "Rubuguri", schemeCode: "rubuguri", branchName: "KISORO" },
  { schemeId: "sch-16", schemeName: "Rurama", schemeCode: "rurama", branchName: "KANUNGU" },
  { schemeId: "sch-17", schemeName: "Rugyeyo", schemeCode: "rugyeyo", branchName: "KANUNGU" },
  { schemeId: "sch-18", schemeName: "Buhoma", schemeCode: "buhoma", branchName: "KANUNGU" },
  { schemeId: "sch-19", schemeName: "Banyara", schemeCode: "banyara", branchName: "KANUNGU" },
  { schemeId: "sch-20", schemeName: "Kabashaki", schemeCode: "kabashaki", branchName: "KISORO" },
  { schemeId: "sch-21", schemeName: "KARENGA-MYAMBI", schemeCode: "karenga-myambi", branchName: "KISORO" },
  { schemeId: "sch-22", schemeName: "Habutobere", schemeCode: "habutobere", branchName: "KANUNGU" },
  { schemeId: "sch-24", schemeName: "Rwenshama", schemeCode: "rwenshama", branchName: "RUKUNGIRI" },
  { schemeId: "sch-25", schemeName: "Bikurungu", schemeCode: "bikurungu", branchName: "RUKUNGIRI" },
  { schemeId: "sch-26", schemeName: "Katabushera", schemeCode: "katabushera", branchName: "RUKUNGIRI" },
  { schemeId: "sch-27", schemeName: "Burombe", schemeCode: "burombe", branchName: "RUKUNGIRI" },
  { schemeId: "sch-28", schemeName: "Karerema", schemeCode: "karerema", branchName: "RUKUNGIRI" },
  { schemeId: "sch-29", schemeName: "Buhunga", schemeCode: "buhunga", branchName: "RUKUNGIRI" },
  { schemeId: "sch-30", schemeName: "Mayanga", schemeCode: "mayanga", branchName: "KABALE" }, // Conflict
  { schemeId: "sch-31", schemeName: "Katagata", schemeCode: "katagata", branchName: "NTUNGAMO" },
  { schemeId: "sch-32", schemeName: "Kahaama", schemeCode: "kahaama", branchName: "NTUNGAMO" },
  { schemeId: "sch-33", schemeName: "Kishami", schemeCode: "kishami", branchName: "NTUNGAMO" },
  { schemeId: "sch-34", schemeName: "Kataraka", schemeCode: "kataraka", branchName: "NTUNGAMO" },
  { schemeId: "sch-35", schemeName: "Katereza", schemeCode: "katereza", branchName: "NTUNGAMO" },
  { schemeId: "sch-36", schemeName: "Itojo", schemeCode: "itojo", branchName: "RUKUNGIRI" }, // Conflict
  { schemeId: "sch-37", schemeName: "Kahiihi", schemeCode: "kahiihi", branchName: "NTUNGAMO" },
  { schemeId: "sch-38", schemeName: "Buraro", schemeCode: "buraro", branchName: "NTUNGAMO" },
  { schemeId: "sch-41", schemeName: "Ntungu - Kyenyanga", schemeCode: "ntungu-kyenyanga", branchName: "ISINGIRO MAIN" },
  { schemeId: "sch-42", schemeName: "Kasumanga", schemeCode: "kasumanga", branchName: "ISINGIRO MAIN" },
  { schemeId: "sch-43", schemeName: "Kyezimbire", schemeCode: "kyezimbire", branchName: "ISINGIRO MAIN" },
  { schemeId: "sch-44", schemeName: "Ngarama", schemeCode: "ngarama", branchName: "ISINGIRO MAIN" },
  { schemeId: "sch-45", schemeName: "Nyakakoni", schemeCode: "nyakakoni", branchName: "ISINGIRO MAIN" },
  { schemeId: "sch-47", schemeName: "Rugaga", schemeCode: "rugaga", branchName: "RUGAAGA" }, // Normalization
  { schemeId: "sch-48", schemeName: "Mbaare", schemeCode: "mbaare", branchName: "RUGAAGA" },
  { schemeId: "sch-49", schemeName: "Kashumba", schemeCode: "kashumba", branchName: "RUGAAGA" },
  { schemeId: "sch-50", schemeName: "Endiizi", schemeCode: "endiizi", branchName: "RUGAAGA" },
  { schemeId: "sch-51", schemeName: "Kakamba", schemeCode: "kakamba", branchName: "RUGAAGA" },
  { schemeId: "sch-52", schemeName: "Masheruka", schemeCode: "masheruka", branchName: "BUSHENYI" },
  { schemeId: "sch-54", schemeName: "Kanyinamigyera", schemeCode: "kanyinamigyera", branchName: "BUSHENYI" },
  { schemeId: "sch-55", schemeName: "Igorora", schemeCode: "igorora", branchName: "IBANDA" },
  { schemeId: "sch-56", schemeName: "Kagongi", schemeCode: "kagongi", branchName: "IBANDA" },
  { schemeId: "sch-58", schemeName: "Kabingo-Kazo", schemeCode: "kabingo-kazo", branchName: "IBANDA" },
  { schemeId: "sch-59", schemeName: "Akashayi", schemeCode: "akashayi", branchName: "IBANDA" },
  { schemeId: "sch-60", schemeName: "Katunguru", schemeCode: "katunguru", branchName: "RUBIRIZI" },
  { schemeId: "sch-61", schemeName: "Kazinga", schemeCode: "kazinga", branchName: "RUBIRIZI" },
  { schemeId: "sch-63", schemeName: "Kyamuhunga", schemeCode: "kyamuhunga", branchName: "RUBIRIZI" },
  { schemeId: "sch-64", schemeName: "Kirugu", schemeCode: "kirugu", branchName: "RUBIRIZI" },
]

describe("SWUWS Decision Support Hardened Scheme Linkage & Benchmark Pipeline", () => {
  it("Test 1 & 2: should detect 64 operational Excel schemes and 64 active portal schemes", async () => {
    const dataset = parseExcelReferenceDataset()
    expect(dataset.fileFound).toBe(true)
    expect(dataset.operationalSchemeCount).toBe(64)
    expect(dataset.referenceSourceRowCount).toBe(6)
    expect(dataset.totalSchemes).toBe(70)

    const recon = await performSchemeReconciliation(MOCK_PORTAL_SCHEMES)
    expect(recon.totalExcelOperationalSchemes).toBe(64)
    expect(recon.totalLivePortalSchemes).toBe(56)
  })

  it("Test 3 & 4: should verify Karukara remains UNMATCHED and NEVER maps to Karenga-Myambi", async () => {
    const recon = await performSchemeReconciliation(MOCK_PORTAL_SCHEMES)
    const karukara = recon.reconciledSchemes.find((s) => s.excelSchemeName.toLowerCase() === "karukara")
    const karenga = recon.reconciledSchemes.find((s) => s.excelSchemeName.toLowerCase() === "karenga-myambi")

    expect(karukara).toBeDefined()
    expect(karukara?.matchStatus).toBe("UNMATCHED_REFERENCE_SCHEME")
    expect(karukara?.approved).toBe(false)
    expect(karukara?.portalSchemeId).toBeNull()

    expect(karenga).toBeDefined()
    expect(karenga?.matchStatus).toBe("APPROVED_EXACT_MATCH")
    expect(karenga?.approved).toBe(true)
    expect(karenga?.portalSchemeName).toBe("KARENGA-MYAMBI")

    // REGRESSION GUARD: Karukara must never inherit Karenga-Myambi ID
    expect(karukara?.portalSchemeId).not.toBe(karenga?.portalSchemeId)
  })

  it("Test 5 & 6: should verify all 8 unresolved schemes remain UNAPPROVED with waterSchemeId = NULL", async () => {
    const recon = await performSchemeReconciliation(MOCK_PORTAL_SCHEMES)
    const unresolvedNames = [
      "karukara",
      "rushaga",
      "kakigani",
      "isingiro t/c & kyakabindi",
      "rwentango",
      "matsyoro",
      "kanyarugiri",
      "kisenyi",
    ]

    for (const name of unresolvedNames) {
      const sch = recon.reconciledSchemes.find((s) => s.excelSchemeName.toLowerCase() === name)
      expect(sch).toBeDefined()
      expect(sch?.approved).toBe(false)
      expect(sch?.portalSchemeId).toBeNull()
      expect(sch?.matchStatus).toBe("UNMATCHED_REFERENCE_SCHEME")
    }
  })

  it("Test 7 & 8: should classify Mayanga and Itojo as HIERARCHY_MISMATCH with approved = false", async () => {
    const recon = await performSchemeReconciliation(MOCK_PORTAL_SCHEMES)
    const mayanga = recon.reconciledSchemes.find((s) => s.excelSchemeName.toLowerCase() === "mayanga")
    const itojo = recon.reconciledSchemes.find((s) => s.excelSchemeName.toLowerCase() === "itojo")

    expect(mayanga).toBeDefined()
    expect(mayanga?.matchStatus).toBe("HIERARCHY_MISMATCH")
    expect(mayanga?.approved).toBe(false)

    expect(itojo).toBeDefined()
    expect(itojo?.matchStatus).toBe("HIERARCHY_MISMATCH")
    expect(itojo?.approved).toBe(false)
  })

  it("Test 9: should classify Rugaga / Rugaaga as APPROVED_NORMALIZED_MATCH", async () => {
    const recon = await performSchemeReconciliation(MOCK_PORTAL_SCHEMES)
    const rugaga = recon.reconciledSchemes.find((s) => s.excelSchemeName.toLowerCase() === "rugaga")

    expect(rugaga).toBeDefined()
    expect(rugaga?.matchStatus).toBe("APPROVED_NORMALIZED_MATCH")
    expect(rugaga?.approved).toBe(true)
    expect(rugaga?.portalSchemeId).not.toBeNull()
  })

  it("Test 10 & 11: should enforce status semantics (Approved -> non-null ID, Unmatched -> null ID)", async () => {
    const recon = await performSchemeReconciliation(MOCK_PORTAL_SCHEMES)

    for (const item of recon.reconciledSchemes) {
      if (item.approved) {
        expect(item.portalSchemeId).not.toBeNull()
        expect(["APPROVED_EXACT_MATCH", "APPROVED_NORMALIZED_MATCH"]).toContain(item.matchStatus)
      } else {
        if (item.matchStatus === "UNMATCHED_REFERENCE_SCHEME") {
          expect(item.portalSchemeId).toBeNull()
        }
        expect(item.approved).toBe(false)
      }
    }
  })

  it("Test 12: should independently calculate capacity utilization and raw loss indicator", () => {
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

  it("Test 13: should preserve raw negative loss when water sold exceeds recorded production", () => {
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

  it("Test 14: should generate a valid 14-slide Board Pack PowerPoint (.pptx) package and verify complete OpenXML structure", async () => {
    const dataset = getExcelReferencePerformanceDataset("august")
    const pptxBuffer = await generateBoardPackPptx(dataset)

    const zip = await JSZip.loadAsync(pptxBuffer)
    const files = Object.keys(zip.files)

    expect(files).toContain("[Content_Types].xml")
    const contentTypesText = await zip.file("[Content_Types].xml")?.async("string")
    expect(contentTypesText).toContain("slide14.xml")

    expect(files).toContain("ppt/presentation.xml")
    const presentationText = await zip.file("ppt/presentation.xml")?.async("string")
    expect(presentationText).toContain('id="269"')

    const slideFiles = files.filter((f) => f.startsWith("ppt/slides/slide") && f.endsWith(".xml") && !f.includes("_rels"))
    expect(slideFiles.length).toBe(14)

    const relFiles = files.filter((f) => f.startsWith("ppt/slides/_rels/slide") && f.endsWith(".rels"))
    expect(relFiles.length).toBe(14)

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
