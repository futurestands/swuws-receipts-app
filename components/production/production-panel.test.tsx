// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ProductionPanel, type Workspace } from "./production-panel"
const mocks=vi.hoisted(()=>({create:vi.fn(),transition:vi.fn(),history:vi.fn()}))
vi.mock("@/app/actions/intelligence",()=>({logWaterProduction:mocks.create,transitionWaterProduction:mocks.transition,getProductionHistory:mocks.history,editWaterProduction:vi.fn(),reviewLegacyProduction:vi.fn(),upsertWaterSchemeSource:vi.fn(),archiveWaterSchemeSource:vi.fn()}))
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
    expect(screen.queryByRole("form",{name:"Daily production entry"})).toBeNull();expect(screen.queryByText("Add water source")).toBeNull()
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
})
