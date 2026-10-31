// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ProductionPanel, type Workspace } from "./production-panel"
const mocks=vi.hoisted(()=>({
  create:vi.fn(),
  transition:vi.fn(),
  history:vi.fn(),
  logInterval:vi.fn(),
  logElectricity:vi.fn(),
  logFuel:vi.fn(),
  upsertAsset:vi.fn(),
  archiveAsset:vi.fn(),
  assignSources:vi.fn(),
  transitionMeasurement:vi.fn(),
  measurementHistory:vi.fn(),
}))
vi.mock("@/app/actions/intelligence",()=>({
  logWaterProduction:mocks.create,
  transitionWaterProduction:mocks.transition,
  getProductionHistory:mocks.history,
  editWaterProduction:vi.fn(),
  reviewLegacyProduction:vi.fn(),
  upsertWaterSchemeSource:vi.fn(),
  archiveWaterSchemeSource:vi.fn(),
  logProductionIntervalAction:mocks.logInterval,
  logProductionElectricityAction:mocks.logElectricity,
  logProductionFuelAction:mocks.logFuel,
  upsertWaterSchemeEnergyAsset:mocks.upsertAsset,
  archiveWaterSchemeEnergyAsset:mocks.archiveAsset,
  assignEnergyAssetSourcesAction:mocks.assignSources,
  transitionProductionMeasurement:mocks.transitionMeasurement,
  getProductionMeasurementHistory:mocks.measurementHistory,
}))
export const fixture = () => ({schemes:[{id:"s",name:"Test scheme"}],scheme:{id:"s",name:"Test scheme"},sources:[{id:"src",schemeId:"s",sourceName:"Test spring",technology:"gravity",capacityMethod:"unknown",active:true,version:1,capacityConfirmedAt:null}],records:[],nextCursor:null,summary:null,month:"2024-02",userId:"operator",capabilities:{create:true,verify:false,sources:false}} as unknown as Workspace)
afterEach(cleanup)
beforeEach(()=>{vi.clearAllMocks()})
function fill(){fireEvent.change(screen.getByLabelText("Production source"),{target:{value:"src"}});fireEvent.change(screen.getByLabelText("Production date"),{target:{value:"2024-02-01"}});fireEvent.change(screen.getByLabelText("Water produced (m³)"),{target:{value:"12.3"}});fireEvent.change(screen.getByLabelText("Water supplied (m³)"),{target:{value:"0"}});fireEvent.change(screen.getByLabelText("Operating hours"),{target:{value:"0"}})}
describe("shared production panel",()=>{
  it("hides verification from the legacy reviewer while retaining history and flag controls",async()=>{
    const f=fixture();f.capabilities={create:false,verify:true,sources:false};f.userId="reviewer"
    f.records=[{id:"log",sourceId:"src",productionDate:"2024-02-01",status:"entered",version:2,workflowVersion:1,recordedById:"operator",legacyReviewerIds:["reviewer"],waterProducedM3:"12",waterSuppliedM3:"0",operatingHours:"0",notes:null,billingPeriodId:null} as Workspace["records"][number]]
    mocks.history.mockResolvedValue({ok:true,data:[{id:"audit",action:"production.log.legacy_review",userId:"reviewer",userName:"Review Officer",createdAt:"2024-02-02",details:{reason:"Confirm historical measurements"}}]})
    render(<ProductionPanel data={f} reload={vi.fn()} nextPage={vi.fn()}/>);
    expect(screen.queryByRole("button",{name:"Verify"})).toBeNull()
    expect(screen.getByRole("button",{name:"Flag"})).toBeTruthy()
    fireEvent.click(screen.getByText("View audit history"))
    expect(await screen.findByText(/Review Officer/)).toBeTruthy()
  })
  it("retains retry identity and explicit zero after a rejected/uncertain submission",async()=>{
    mocks.create.mockResolvedValue({ok:false,code:"CONFLICT",message:"Reload required"})
    render(<ProductionPanel data={fixture()} reload={vi.fn()} nextPage={vi.fn()}/>);fill()
    fireEvent.click(screen.getByText("Save daily production"));await screen.findByText(/Reload required/)
    fireEvent.click(screen.getByText("Save daily production"));await waitFor(()=>expect(mocks.create).toHaveBeenCalledTimes(2))
    const [first,second]=mocks.create.mock.calls.map(c=>c[0]);expect(first.requestKey).toBe(second.requestKey);expect(first).toMatchObject({waterSuppliedM3:"0",operatingHours:"0",sourceId:"src"})
  })
  it("hides mutation controls from a viewer",()=>{
    render(<ProductionPanel data={{...fixture(),capabilities:{create:false,verify:false,sources:false}}} reload={vi.fn()} nextPage={vi.fn()}/>);
    expect(screen.queryByRole("form",{name:"Daily production entry"})).toBeNull();expect(screen.queryByText("Add water source")).toBeNull();expect(screen.queryByText("Add energy asset")).toBeNull()
  })
  it("shows unavailable observations separately from verified zero",()=>{
    const f=fixture();f.summary={available:true,suppliedComplete:true,totalWaterProducedM3:"0.00",totalWaterSuppliedM3:"0.00",provisionalProducedM3:"5",provisionalCount:1,legacyCount:1,loggedDaysCount:1,expectedDays:29,coveragePercent:3,currentCapacityM3Month:null} as Workspace["summary"]
    render(<ProductionPanel data={f} reload={vi.fn()} nextPage={vi.fn()}/>);expect(screen.getAllByText(/0.00 m³ \(verified\)/)).toHaveLength(2);expect(screen.getByText(/This is not all-source completeness/)).toBeTruthy()
  })
  it("requires a review reason before revocation and sends the expected version",async()=>{
    const f=fixture();f.capabilities.verify=true;f.records=[{id:"log",sourceId:"src",productionDate:"2024-02-01",status:"verified",version:2,workflowVersion:1,recordedById:"other",waterProducedM3:"12",waterSuppliedM3:"0",operatingHours:"0",notes:null,billingPeriodId:null} as Workspace["records"][number]]
    mocks.transition.mockResolvedValue({ok:true,data:{}})
    render(<ProductionPanel data={f} reload={vi.fn()} nextPage={vi.fn()}/>);expect(screen.queryByText("Correct entry")).toBeNull();fireEvent.click(screen.getByText("Revoke verification"));fireEvent.change(screen.getByLabelText("Review reason"),{target:{value:"Correct the measurement"}});fireEvent.click(screen.getByText("Confirm revoke"));await waitFor(()=>expect(mocks.transition).toHaveBeenCalledWith({id:"log",expectedVersion:2,operation:"revoke",reason:"Correct the measurement"}))
  })
  it("prevents duplicate submission while the first response is pending",async()=>{
    let resolve!:(v:unknown)=>void;mocks.create.mockReturnValue(new Promise(r=>{resolve=r}))
    render(<ProductionPanel data={fixture()} reload={vi.fn()} nextPage={vi.fn()}/>);fill();const form=screen.getByRole("form",{name:"Daily production entry"});fireEvent.submit(form);fireEvent.submit(form);expect(mocks.create).toHaveBeenCalledTimes(1);resolve({ok:false,message:"Unconfirmed",code:"CONFLICT"});await screen.findByText(/Unconfirmed/)
  })
  it("registers shared energy assets and assigns them to authorised sources",async()=>{
    const f=fixture()
    f.capabilities={create:true,verify:false,sources:true}
    f.sources=[
      {id:"src-1",schemeId:"s",sourceName:"Borehole A",technology:"pumped_grid",capacityMethod:"unknown",active:true,version:1,capacityConfirmedAt:null} as Workspace["sources"][number],
      {id:"src-2",schemeId:"s",sourceName:"Borehole B",technology:"pumped_grid",capacityMethod:"unknown",active:true,version:1,capacityConfirmedAt:null} as Workspace["sources"][number],
    ]
    f.energyAssets=[{id:"meter-1",schemeId:"s",assetType:"electricity_meter",assetRef:"UMEME-99",fuelType:null,active:true} as Workspace["energyAssets"][number]]
    f.assetAssignments=[]
    mocks.upsertAsset.mockResolvedValue({ok:true,data:{}})
    mocks.assignSources.mockResolvedValue({ok:true,data:{}})
    render(<ProductionPanel data={f} reload={vi.fn()} nextPage={vi.fn()}/>)
    fireEvent.click(screen.getByText("Add energy asset"))
    fireEvent.change(screen.getByLabelText("Energy asset type"),{target:{value:"generator"}})
    fireEvent.change(screen.getByLabelText("Asset reference"),{target:{value:"GEN-MAIN"}})
    fireEvent.change(screen.getByLabelText("Generator fuel type"),{target:{value:"diesel"}})
    fireEvent.click(screen.getByText("Save energy asset"))
    await waitFor(()=>expect(mocks.upsertAsset).toHaveBeenCalledWith({schemeId:"s",assetType:"generator",assetRef:"GEN-MAIN",fuelType:"diesel"}))

    fireEvent.click(screen.getByText("Assign sources (UMEME-99)"))
    const checkboxes=screen.getAllByRole("checkbox")
    fireEvent.click(checkboxes[0])
    fireEvent.click(checkboxes[1])
    fireEvent.click(screen.getByText("Save source assignments"))
    await waitFor(()=>expect(mocks.assignSources).toHaveBeenCalledWith({schemeId:"s",assetId:"meter-1",sourceIds:["src-1","src-2"]}))
  })
  it("submits multi-day water interval, electricity kWh and purchase-only fuel entries",async()=>{
    const f=fixture()
    f.energyAssets=[
      {id:"meter-1",schemeId:"s",assetType:"electricity_meter",assetRef:"UMEME-99",fuelType:null,active:true} as Workspace["energyAssets"][number],
      {id:"gen-1",schemeId:"s",assetType:"generator",assetRef:"GEN-1",fuelType:"diesel",active:true} as Workspace["energyAssets"][number],
    ]
    f.assetAssignments=[{id:"as-1",schemeId:"s",assetId:"meter-1",sourceId:"src"} as Workspace["assetAssignments"][number]]
    mocks.logInterval.mockResolvedValue({ok:true,data:{}})
    mocks.logElectricity.mockResolvedValue({ok:true,data:{}})
    mocks.logFuel.mockResolvedValue({ok:true,data:{}})

    render(<ProductionPanel data={f} reload={vi.fn()} nextPage={vi.fn()}/>)

    fireEvent.click(screen.getByText("Multi-day water interval"))
    fireEvent.change(screen.getByLabelText("Interval source"),{target:{value:"src"}})
    fireEvent.change(screen.getByLabelText("Bulk meter reference"),{target:{value:"BM-01"}})
    fireEvent.change(screen.getByLabelText("Opening meter reading"),{target:{value:"100"}})
    fireEvent.change(screen.getByLabelText("Opening timestamp"),{target:{value:"2024-02-01T00:00"}})
    fireEvent.change(screen.getByLabelText("Closing meter reading"),{target:{value:"250.5"}})
    fireEvent.change(screen.getByLabelText("Closing timestamp"),{target:{value:"2024-02-05T00:00"}})
    fireEvent.click(screen.getByText("Save water interval"))
    await waitFor(()=>expect(mocks.logInterval).toHaveBeenCalledWith(expect.objectContaining({
      schemeId:"s",sourceId:"src",meterRef:"BM-01",openingReading:"100",closingReading:"250.5",
      openingTimestamp:"2024-01-31T21:00:00.000Z",closingTimestamp:"2024-02-04T21:00:00.000Z",
    })))

    fireEvent.click(screen.getByText("Grid electricity (kWh)"))
    fireEvent.change(screen.getByLabelText("Electricity meter asset"),{target:{value:"meter-1"}})
    fireEvent.change(screen.getByLabelText("Opening kWh"),{target:{value:"500"}})
    fireEvent.change(screen.getByLabelText("Electricity opening timestamp"),{target:{value:"2024-02-01T00:00"}})
    fireEvent.change(screen.getByLabelText("Closing kWh"),{target:{value:"620"}})
    fireEvent.change(screen.getByLabelText("Electricity closing timestamp"),{target:{value:"2024-02-05T00:00"}})
    fireEvent.change(screen.getByLabelText("Aggregate pump operating hours"),{target:{value:"48"}})
    fireEvent.change(screen.getByLabelText("Electricity cost (UGX)"),{target:{value:"180000"}})
    fireEvent.click(screen.getByText("Save electricity reading"))
    await waitFor(()=>expect(mocks.logElectricity).toHaveBeenCalledWith(expect.objectContaining({
      schemeId:"s",assetId:"meter-1",openingReadingKwh:"500",closingReadingKwh:"620",pumpOperatingHours:"48",electricityCostUgx:"180000",
    })))

    fireEvent.click(screen.getByText("Generator fuel & stock"))
    expect(screen.getByText(/without fabricating fuel consumed/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Generator asset"),{target:{value:"gen-1"}})
    fireEvent.change(screen.getByLabelText("Fuel coverage start date"),{target:{value:"2024-02-01"}})
    fireEvent.change(screen.getByLabelText("Fuel coverage end date"),{target:{value:"2024-02-07"}})
    fireEvent.change(screen.getByLabelText("Fuel purchased (litres)"),{target:{value:"200"}})
    fireEvent.change(screen.getByLabelText("Fuel expenditure (UGX)"),{target:{value:"1040000"}})
    fireEvent.click(screen.getByText("Save fuel record"))
    await waitFor(()=>expect(mocks.logFuel).toHaveBeenCalledWith(expect.objectContaining({
      schemeId:"s",assetId:"gen-1",fuelType:"diesel",openingStockLitres:"",closingStockLitres:"",fuelPurchasedLitres:"200",fuelExpenditureUgx:"1040000",
    })))
  })
  it("enforces independent review controls and renders monthly energy and cross-month allocation summary",async()=>{
    const f=fixture()
    f.userId="verifier"
    f.capabilities={create:false,verify:true,sources:false}
    f.energyAssets=[{id:"gen-1",schemeId:"s",assetType:"generator",assetRef:"GEN-1",fuelType:"diesel",active:true} as Workspace["energyAssets"][number]]
    f.intervals=[
      {id:"int-self",schemeId:"s",sourceId:"src",meterRef:"BM-SELF",meterUnit:"m3",openingReading:"0.00",closingReading:"10.00",openingTimestamp:"2024-02-01T00:00:00Z",closingTimestamp:"2024-02-02T00:00:00Z",coverageStartDate:"2024-02-01",coverageEndDate:"2024-02-02",calculatedVolumeM3:"10.00",status:"entered",version:1,recordedById:"verifier",notes:null} as unknown as Workspace["intervals"][number],
    ]
    f.fuelRecords=[
      {id:"fuel-1",schemeId:"s",assetId:"gen-1",fuelType:"diesel",coverageStartDate:"2024-02-01",coverageEndDate:"2024-02-10",openingStockLitres:null,closingStockLitres:null,fuelPurchasedLitres:"150.00",calculatedConsumedLitres:null,generatorOperatingHours:null,fuelExpenditureUgx:"780000.00",status:"entered",version:1,recordedById:"operator",notes:null} as unknown as Workspace["fuelRecords"][number],
    ]
    f.summary={
      schemeId:"s",month:"2024-02",available:true,suppliedComplete:false,
      totalWaterProducedM3:"400.00",dailyVerifiedProducedM3:"150.00",intervalMeasuredProducedM3:"250.00",intervalMeasuredCount:1,
      totalWaterSuppliedM3:"150.00",provisionalProducedM3:"0.00",provisionalCount:0,provisionalIntervalCount:1,provisionalIntervalTotalM3:"10.00",
      legacyCount:0,logsCount:5,loggedDaysCount:5,expectedDays:29,coveragePercent:35,sourceCount:1,requiredSourceDays:29,verifiedSourceDays:10,missingSourceDays:19,estimatedSourceDays:4,
      dataQualityStatus:"PARTIAL",currentCapacityM3Month:null,intervalConflictCount:0,excludedConflictedIntervalM3:"0.00",
      estimatedAllocation:{
        basis:"ESTIMATED_ALLOCATION",present:true,producedM3:"120.00",electricityKwh:45,fuelLitres:0,electricityCostUgx:30000,fuelExpenditureUgx:0,
        records:[{kind:"water_interval",recordId:"int-x",subjectId:"src",basis:"ESTIMATED_ALLOCATION",unit:"m3",measuredTotal:"300.00",allocatedToMonth:"120.00",method:"TIME_PROPORTIONAL_UNIFORM_RATE",uncertainty:"Uniform rate",maxAbsoluteError:"180.00",fraction:{numerator:2,denominator:5}}],
      },
      energy:{
        totalKwh:320,totalFuelLitres:0,totalEnergyCostUgx:240000,kwhPerM3:null,fuelPerM3:null,
        electricityCoverageComplete:false,fuelCoverageComplete:false,fuelUnavailableCount:1,fuelUnreconciledExpenditureUgx:780000,
        provisionalElectricityCount:0,provisionalElectricityKwh:0,provisionalFuelCount:1,provisionalFuelLitres:0,
      },
    } as unknown as Workspace["summary"]

    mocks.transitionMeasurement.mockResolvedValue({ok:true,data:{}})
    render(<ProductionPanel data={f} reload={vi.fn()} nextPage={vi.fn()}/>)

    expect(screen.getByText(/Source Completeness: PARTIAL/)).toBeTruthy()
    expect(screen.getByText(/Not Merged into Official Measured Totals/)).toBeTruthy()
    expect(screen.getByText(/Purchase-only \(consumption unknown\)/)).toBeTruthy()

    // Only fuel-1 (recorded by operator) gets Verify; int-self (recorded by verifier) does not
    const verifyButtons=screen.getAllByRole("button",{name:"Verify"})
    expect(verifyButtons).toHaveLength(1)
    fireEvent.click(verifyButtons[0])
    fireEvent.click(screen.getByText("Confirm verify"))
    await waitFor(()=>expect(mocks.transitionMeasurement).toHaveBeenCalledWith({
      recordKind:"fuel",id:"fuel-1",expectedVersion:1,operation:"verify",reason:"",
    }))
  })
})
