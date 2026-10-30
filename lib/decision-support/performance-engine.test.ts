import { beforeEach, describe, expect, it, vi } from "vitest"
const mock=vi.hoisted(()=>({select:vi.fn(),summary:vi.fn()}))
vi.mock("@/lib/db",()=>({db:{select:mock.select}}))
vi.mock("@/lib/production/reporting",async importOriginal=>({...await importOriginal<typeof import("@/lib/production/reporting")>(),loadProductionSummary:mock.summary}))
import { getTrustedPerformanceDataset } from "./performance-engine"
import { generateManagementReport } from "./reports"
import type { UserPermissionsContext } from "@/lib/permissions"

const user={id:"reader",role:"admin",organizationId:"org",permissions:[],grants:[]} as UserPermissionsContext
function rows(sales=true,targets=true){
 const queries:unknown[][]=[
  [{id:"scheme",name:"Test scheme",branchId:"branch"}],
  [{id:"period",periodName:"July 2024",year:2024,month:7}],
  sales?[{schemeId:"scheme",totalConsumptionM3:"110",totalBilledAmount:"100",readingsCount:1}]:[],
  [{schemeId:"scheme",totalCurrentBilled:"100",totalArrearsBilled:"0",cashToArrears:"0",cashToCurrent:"20",totalDue:"80"}],
  targets?[{schemeId:"scheme",targetProductionM3:"200",targetCollectionEfficiencyPercent:null}]:[],
 ]
 mock.select.mockImplementation(()=>{
  const result=queries.shift()??[]
  const builder={from:()=>builder,where:()=>builder,orderBy:()=>builder,limit:()=>builder,innerJoin:()=>builder,groupBy:()=>builder,then:(resolve:(v:unknown[])=>unknown)=>Promise.resolve(result).then(resolve)}
  return builder
 })
}
beforeEach(()=>{
 vi.clearAllMocks()
 mock.summary.mockResolvedValue([{schemeId:"scheme",totalWaterProducedM3:"100",totalWaterSuppliedM3:"0",currentCapacityM3Month:105,loggedDaysCount:31,available:true,suppliedComplete:false,provisionalProducedM3:"0",legacyCount:0}])
})
describe("existing live performance engine keeps targets, estimates and missing data separate",()=>{
 it("consumes persisted period targets without importing or approving workbook history",async()=>{
  rows();const d=await getTrustedPerformanceDataset(user,"period")
  expect(d.kpis.targetProductionM3).toBe(200)
  expect(d.referenceTargets).toBeUndefined()
  expect(d.schemesMatrix[0].statusLabel).toBe("Critical (>95%)")
  expect(d.kpis.rawCalculatedLossIndicator).toBe(-10)
  expect(d.kpis.lossValidationStatus).toBe("DATA_INCONSISTENCY")
 })
 it("does not publish missing sales as a measured zero or a 100% loss",async()=>{
  rows(false,false);const d=await getTrustedPerformanceDataset(user,"period")
  expect(d.availability?.sales).toBe(false)
  expect(d.kpis.displayLossIndicator).toContain("Unresolved")
  expect(d.kpis.targetProductionM3).toBeNull()
  const salesRow=generateManagementReport("monthly_management",d).sections[0].metricsTable?.rows.find(r=>r[0]==="Water Sold (Billed)")
  expect(salesRow).toEqual(["Water Sold (Billed)","Unresolved m³","INCOMPLETE_DATA"])
 })
 it("retains balance-derived estimates separately from verified collection performance",async()=>{
  rows();const d=await getTrustedPerformanceDataset(user,"period")
  expect(d.collectionBasis).toBe("balance_inference")
  expect(d.kpis.totalCashCollectedUgx).toBe(20)
  expect(d.availability?.collections).toBe(false)
  const r=generateManagementReport("monthly_management",d)
  expect(r.sections[0].metricsTable?.rows.find(r=>r[0]==="Cash Collected")).toEqual(["Cash Collected","Unresolved","UNRESOLVED"])
  expect(r.summaryNarrative).toContain("Outstanding demand including unpaid current bills")
 })
})
