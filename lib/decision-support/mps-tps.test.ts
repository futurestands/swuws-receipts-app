// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import JSZip from "jszip"
import { calculateMpsTps, classifyUtilisation, inputMetric, sumEngineeringMetrics, type MpsTpsInputs } from "./mps-tps"
import { parseExcelReferenceDataset, workbookMetric } from "./excel-reference"
import { getExcelReferencePerformanceDataset } from "./excel-fixture"
import { generateManagementReport } from "./reports"
import { generateBoardPackPptx } from "./board-pack"
import { evaluateCapacityUtilization } from "@/lib/intelligence/capacity"
import { evaluateNrwLoss } from "@/lib/intelligence/nrw"
import { validateWaterBalanceAndCapacity } from "./data-validation"

const m = (value: number | null, source: string, unit = "fraction") => inputMetric(value, unit, source)
function inputs(): MpsTpsInputs {
  return { monthlyCapacity: m(1694.8561464690495, "TARGETS GOLBAL!F5", "m3/benchmark-month"),
    mpsUtilisation: m(.5044675925925927, "TARGETS GOLBAL!G5"), tpsUtilisation: m(.6044675925925926, "TARGETS GOLBAL!H5"),
    mpsNrw: m(.35,"TARGETS GOLBAL!I5"),tpsNrw:m(.3,"TARGETS GOLBAL!J5"),mpsProduction:m(1500,"TARGETS GOLBAL!K5","m3/month-label"),mpsSales:m(823,"TARGETS GOLBAL!O5","m3/month-label"),
    tariff:m(2118,"TARGETS GOLBAL!U5","UGX/m3"),arrears:m(null,"TARGETS GOLBAL!R5","UGX"),collectionEfficiency:m(null,"TARGETS GOLBAL!T5") }
}
describe("original SWUWS target calculation contract",()=>{
  it("reproduces Ryakarimira without turning historical targets into actual measurements",()=>{
    const v=calculateMpsTps(inputs(),5)
    expect(v.production.value).toBeCloseTo(1024.4856146469049,9)
    expect(v.supplied.value).toBeCloseTo(973.2613339145596,9)
    expect(v.sold.value).toBeCloseTo(729.9460004359197,9)
    expect(v.billing.value).toBeCloseTo(1546025.6289232778,7)
    expect(v.productionToSupplyLoss.value).toBeCloseTo(.05,12)
    expect(v.productionToSalesLoss.value).toBeCloseTo(.2875,12)
    expect(v.production.dependencies).toEqual(["TARGETS GOLBAL!H5","TARGETS GOLBAL!F5"])
    expect(v.demand.value).toBeNull();expect(v.demand.state).toBe("UNRESOLVED_DEPENDENCY")
  })
  it("does not silently connect the declared TPS NRW to target sales",()=>{
    const a=calculateMpsTps(inputs(),5),b=calculateMpsTps({...inputs(),tpsNrw:m(-.1,"J5")},5)
    expect(a.sold.value).toBe(b.sold.value)
    expect(b.diagnostics.some(d=>d.includes("outside"))).toBe(true)
    expect(a.diagnostics.some(d=>d.includes("differs"))).toBe(true)
  })
  it.each(["monthlyCapacity","tpsUtilisation","tariff"] as const)("propagates missing %s without fabricating a target",key=>{
    const v=calculateMpsTps({...inputs(),[key]:m(null,key)},5)
    expect(v.billing.value).toBeNull()
    expect(v.billing.state).toBe("UNRESOLVED_DEPENDENCY")
  })
  it("preserves explicit zero targets, but leaves a zero-denominator ratio unavailable",()=>{
    const v=calculateMpsTps({...inputs(),tpsUtilisation:m(0,"H5"),arrears:m(0,"R5")},5)
    expect(v.production.value).toBe(0);expect(v.billing.value).toBe(0);expect(v.demand.value).toBe(0)
    expect(v.productionToSalesLoss.value).toBeNull()
  })
  it("retains external cache and saved-error evidence without using either in calculations",()=>{
    const sheet: XLSX.WorkSheet={R5:{t:"n",v:6617806,f:"VLOOKUP([1]Arrears!B42,[2]Sheet1!A:G,7,FALSE)"},J27:{t:"e",v:7,w:"#DIV/0!"}}
    const r=workbookMetric(sheet,"R5","UGX"),j=workbookMetric(sheet,"J27","fraction")
    expect(r).toMatchObject({value:null,savedValue:6617806,state:"UNRESOLVED_EXTERNAL"})
    expect(j).toMatchObject({value:null,savedValue:"#DIV/0!",state:"SOURCE_ERROR"})
    expect(calculateMpsTps({...inputs(),arrears:r},5).demand.value).toBeNull()
  })
  it("does not publish incomplete totals or an empty population as zero",()=>{
    expect(sumEngineeringMetrics([m(2,"a"),m(null,"b")],"m3","total").value).toBeNull()
    expect(sumEngineeringMetrics([],"m3","total").value).toBeNull()
    expect(sumEngineeringMetrics([m(0,"a"),m(2,"b")],"m3","total").value).toBe(2)
  })
})
describe("workbook utilisation interpretation shared by management and intelligence",()=>{
  it.each([[null,"unavailable"],[-1,"unavailable"],[49.999,"underused"],[50,"healthy"],[74.999,"healthy"],[75,"boundary"],[75.001,"optimal"],[84.999,"optimal"],[85,"boundary"],[85.001,"stressed"],[95,"stressed"],[95.001,"critical"]] as const)("classifies %s as %s without rounding across a boundary",(v,band)=>expect(classifyUtilisation(v).band).toBe(band))
  it.each([[90,"high"],[96,"critical"]] as const)("emits workbook severity at %s percent",(production,severity)=>{
    const f=evaluateCapacityUtilization({schemeId:"s",schemeName:"S",practicalCapacityM3Month:100,actualProductionM3Month:production,dataCompletenessPercent:100})
    expect(f[0].severity).toBe(severity)
  })
  it("retains signed NRW anomalies and does not diagnose missing sales as 100% loss",()=>{
    const data={schemeId:"s",schemeName:"S",waterProducedM3:100,waterBilledSoldM3:110,dataCompletenessPercent:100}
    expect(evaluateNrwLoss(data)[0]).toMatchObject({category:"data_quality",evidence:{actual:-10}})
    expect(evaluateNrwLoss({...data,waterBilledSoldM3:0,salesAvailable:false})).toEqual([])
    expect(validateWaterBalanceAndCapacity({waterProducedM3:100,waterBilledSoldM3:0,loggedDaysCount:31,daysInPeriod:31,practicalCapacityM3Period:200,salesAvailable:false})).toMatchObject({lossValidationStatus:"INCOMPLETE_DATA",displayLossIndicator:"Unresolved: water sales observations missing"})
  })
})
describe("original workbook read-only reference and existing report adapters",()=>{
  it("separates 64 schemes, 92 source rows and 6 explanatory legend rows",()=>{
    const ref=parseExcelReferenceDataset()
    expect(ref).toMatchObject({fileFound:true,totalSchemes:64,referenceSourceRowCount:92,legendRowCount:6,workbookSha256:"4965cef7c3c02428c8cf6a3af465c68ff2f3ccd56978182af2cbb44eccf6e622"})
    expect(ref.schemes.every(s=>s.isReferenceSample===false)).toBe(true)
  })
  it("replays every fully specified scheme chain against its original saved values",()=>{
    const ref=parseExcelReferenceDataset(),wb=XLSX.readFile(ref.filePath),sheet=wb.Sheets["TARGETS GOLBAL"]
    let checked=0
    for(const s of ref.schemes){const model=s.targetModel!;if(model.production.value===null)continue
      const row=Number(model.production.source.match(/L(\d+)$/)![1])
      for(const [col,result]of [["L",model.production],["M",model.supplied],["P",model.sold],["Q",model.billing]] as const)expect(result.value).toBeCloseTo(sheet[col+row].v,6)
      checked++
    }
    expect(checked).toBe(63)
    const rushaga=ref.schemes.find(s=>s.schemeName==="Rushaga")!
    expect(rushaga.targetModel?.production.value).toBeNull()
    expect(rushaga.targetModel?.production.savedValue).toBe(0)
    expect(rushaga.targetModel?.inputs.tpsNrw.state).toBe("SOURCE_ERROR")
    expect(ref.schemes.find(s=>s.schemeName==="Ryakarimira")?.targetModel?.inputs.mpsProduction.value).toBe(1500)
  })
  it("does not invent September observations, supply, cash, year or full coverage",()=>{
    const d=getExcelReferencePerformanceDataset("september")
    expect(d.period.year).toBeNull();expect(d.production?.available).toBe(false)
    expect(d.production?.suppliedComplete).toBe(false);expect(d.dataQuality.completenessPercent).toBe(0)
    expect(d.availability).toEqual({sales:false,billing:false,collections:false,arrears:false})
    expect(d.kpis.totalCashCollectedUgx).toBe(0)
    const report=generateManagementReport("monthly_management",d)
    expect(report.sections[0].metricsTable?.rows.find(r=>r[0]==="Collection Efficiency")).toEqual(["Collection Efficiency","Unresolved","UNRESOLVED"])
    const target=report.sections[2].metricsTable?.rows.find(r=>r[1]==="Ryakarimira")
    expect(target?.[3]).toBeCloseTo(1024.4856146469049,9)
    expect(String(target?.at(-1))).toContain("Unresolved")
    expect(generateManagementReport("production_capacity", d).summaryNarrative).toContain("Historical workbook production")
    expect(generateManagementReport("production_capacity", d).summaryNarrative).toContain("Original fixed-month capacity benchmark")
  })
  it("exports 14 parseable slides with unresolved cash and qualified TPS examples, preserving the workbook",async()=>{
    const ref=parseExcelReferenceDataset(),before=createHash("sha256").update(readFileSync(ref.filePath)).digest("hex")
    const d=getExcelReferencePerformanceDataset("august");d.period.periodName="Original & unresolved year"
    const zip=await JSZip.loadAsync(await generateBoardPackPptx(d))
    const files=Object.keys(zip.files).filter(k=>/^ppt\/slides\/slide\d+\.xml$/.test(k))
    expect(files).toHaveLength(14)
    const parser=new DOMParser()
    for(const f of files){const xml=await zip.file(f)!.async("string");expect(parser.parseFromString(xml,"application/xml").querySelector("parsererror"),f).toBeNull()}
    expect(await zip.file("ppt/slides/slide4.xml")!.async("string")).toContain("Unresolved external arrears")
    expect(await zip.file("ppt/slides/slide7.xml")!.async("string")).toContain("Unresolved")
    expect(await zip.file("ppt/slides/slide13.xml")!.async("string")).toContain("original fixed-month workbook benchmark")
    expect(createHash("sha256").update(readFileSync(ref.filePath)).digest("hex")).toBe(before)
  })
})
