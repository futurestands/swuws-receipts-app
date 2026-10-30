import { describe, expect, it } from "vitest"
import JSZip from "jszip"
import { generateManagementReport } from "./reports"
import { generateBoardPackPptx } from "./board-pack"
import type { TrustedPerformanceDataset } from "./types"

function dataset(): TrustedPerformanceDataset {
  return {
    period:{id:"feb",periodName:"February 2024",year:2024,month:2},scope:{level:"scheme"},
    production:{available:true,suppliedComplete:true,capacityComplete:false,provisionalProducedM3:99,legacyCount:1,label:"Verified daily records only"},
    kpis:{waterProducedM3:0,waterSuppliedM3:0,waterSoldM3:0,unbilledLossM3:0,rawCalculatedLossIndicator:0,displayLossIndicator:"Unavailable",lossValidationStatus:"INCOMPLETE_DATA",practicalCapacityM3Month:0,capacityUtilizationPercent:0,currentBilledUgx:100,totalCashCollectedUgx:50,cashToArrearsUgx:0,cashToCurrentUgx:50,totalArrearsUgx:20,collectionEfficiencyPercent:50,arrearsRecoveryPercent:0},
    schemesMatrix:[{schemeId:"s",schemeName:"Test spring",producedM3:0,practicalCapacityM3:0,utilizationPercent:0,soldM3:0,rawLossPercent:0,displayLoss:"Unavailable",currentBilledUgx:100,cashCollectedUgx:50,collectionEfficiencyPercent:50,totalArrearsUgx:20,statusLabel:"Benchmark unavailable",dataQualityStatus:"INCOMPLETE_DATA",productionAvailable:true,capacityAvailable:false}],
    dataQuality:{completenessPercent:3,flagsCount:1,issues:["Unconfirmed capacity"]},periodDeltas:[],traceability:[],
  }
}

describe("production management report remediation",()=>{
  it.each(["monthly_management","production_capacity","nrw_loss","commercial_performance"] as const)("completes the existing %s report with scoped tables",type=>{
    const report=generateManagementReport(type,dataset())
    expect(report.sections).toHaveLength(2)
    expect(report.sections.every(s=>s.metricsTable!.rows.length>0)).toBe(true)
    expect(JSON.stringify(report)).not.toContain("Unavailable%")
    expect(report.methodologyNotes.join(" ")).toContain("verified")
  })
  it("retains verified zero while suppressing unknown and zero-denominator utilisation",()=>{
    const data=dataset()
    let report=generateManagementReport("monthly_management",data)
    expect(report.sections[1].metricsTable!.rows[0].slice(1,3)).toEqual(["0","Unavailable"])
    data.production!.capacityComplete=true;data.schemesMatrix[0].capacityAvailable=true
    report=generateManagementReport("monthly_management",data)
    expect(report.sections[0].metricsTable!.rows[1].slice(1)).toEqual(["Unavailable","TARGET_UNAVAILABLE"])
    expect(report.sections[1].metricsTable!.rows[0][2]).toBe("Unavailable")
    data.production!.available=false;data.schemesMatrix[0].productionAvailable=false
    report=generateManagementReport("monthly_management",data)
    expect(report.sections[1].metricsTable!.rows[0][1]).toBe("Unavailable")
    expect(report.sections[0].metricsTable!.rows[1][2]).toBe("INCOMPLETE_DATA")
  })
  it("uses availability flags in the board-pack matrix as well as the headline",async()=>{
    const zip=await JSZip.loadAsync(await generateBoardPackPptx(dataset()))
    const slideFiles=Object.keys(zip.files).filter(f=>/^ppt\/slides\/slide\d+\.xml$/.test(f))
    expect(slideFiles).toHaveLength(14)
    const xml=(await Promise.all(slideFiles.map(f=>zip.file(f)!.async("string")))).join("\n")
    expect(xml).toContain("Test spring: Prod 0")
    expect(xml).toContain("Util Unavailable")
    expect(xml).not.toContain("Unavailable%")
  })
})
