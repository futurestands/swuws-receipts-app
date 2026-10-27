// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ProductionWorkspace } from "./production-workspace"
const mocks=vi.hoisted(()=>({workspace:vi.fn()}))
vi.mock("@/app/actions/intelligence",()=>({getProductionWorkspace:mocks.workspace}))
vi.mock("./production-panel",()=>({ProductionPanel:()=> <p>Scoped production panel</p>}))
afterEach(cleanup);beforeEach(()=>vi.clearAllMocks())
describe("production workspace",()=>{
  it("loads only the scoped production DTO and month selector",async()=>{
    mocks.workspace.mockResolvedValue({ok:true,data:{schemes:[{id:"s",name:"Allowed scheme"}],scheme:{id:"s"},month:"2024-02"}})
    render(<ProductionWorkspace/>);await screen.findByText("Scoped production panel");expect(screen.getByText("Allowed scheme")).toBeTruthy();expect(screen.queryByText("Commercial performance")).toBeNull();expect(mocks.workspace).toHaveBeenCalledWith(undefined,undefined,undefined)
    fireEvent.change(screen.getByLabelText("Production month"),{target:{value:"2024-03"}});await screen.findByText("Scoped production panel");expect(mocks.workspace).toHaveBeenLastCalledWith(undefined,"2024-03",undefined)
  })
  it("shows denied requests as errors instead of an endless spinner",async()=>{
    mocks.workspace.mockResolvedValue({ok:false,code:"FORBIDDEN",message:"Scheme outside access"})
    render(<ProductionWorkspace schemeId="foreign"/>);expect(await screen.findByRole("alert")).toHaveProperty("textContent","Scheme outside access");expect(screen.queryByText("Loading production…")).toBeNull()
  })
})
