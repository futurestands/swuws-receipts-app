import { beforeEach, describe, expect, it, vi } from "vitest"
import { ProductionError, createLogSchema } from "@/lib/production/schemas"
const mocks=vi.hoisted(()=>({requireUser:vi.fn(),create:vi.fn(),workspace:vi.fn(),history:vi.fn(),revalidate:vi.fn(),error:vi.fn()}))
vi.mock("@/lib/db",()=>({db:{}}))
vi.mock("@/lib/session",()=>({requireUser:mocks.requireUser}))
vi.mock("@/lib/production/service",()=>({productionService:()=>({create:mocks.create,workspace:mocks.workspace,history:mocks.history})}))
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}))
vi.mock("@/lib/system-errors",()=>({recordSystemError:mocks.error}))
import { getProductionWorkspace, logWaterProduction } from "./intelligence"

describe("public production server actions",()=>{
  const user={id:"authenticated-operator",role:"agent"}
  beforeEach(()=>{vi.clearAllMocks();mocks.requireUser.mockResolvedValue(user)})
  it("takes actor identity from the authenticated session and revalidates both existing route families",async()=>{
    mocks.create.mockResolvedValue({id:"record"});const payload={recordedById:"attacker"}
    expect(await logWaterProduction(payload)).toEqual({ok:true,data:{id:"record"}})
    expect(mocks.create).toHaveBeenCalledWith(user,payload)
    expect(mocks.revalidate).toHaveBeenCalledWith("/intelligence","layout")
    expect(mocks.revalidate).toHaveBeenCalledWith("/decision-support","layout")
  })
  it("returns a denied direct invocation without revalidation",async()=>{
    mocks.create.mockRejectedValue(new ProductionError("FORBIDDEN","Outside your scope"))
    expect(await logWaterProduction({})).toMatchObject({ok:false,code:"FORBIDDEN"});expect(mocks.revalidate).not.toHaveBeenCalled()
  })
  it("returns runtime field errors for invalid measured input",async()=>{
    mocks.create.mockImplementation((_user,input)=>createLogSchema.parse(input))
    const result=await logWaterProduction({status:"verified",waterProducedM3:"NaN"})
    expect(result).toMatchObject({ok:false,code:"VALIDATION"});expect(mocks.revalidate).not.toHaveBeenCalled()
  })
  it("maps uniqueness and concurrency failures to retry-safe messages",async()=>{
    mocks.create.mockRejectedValue({cause:{code:"23505"}})
    expect(await logWaterProduction({})).toMatchObject({ok:false,code:"DUPLICATE"})
    mocks.create.mockRejectedValue({cause:{code:"40001"}})
    expect(await logWaterProduction({})).toMatchObject({ok:false,code:"CONFLICT"})
  })
  it("does not return unexpected internal data or connection strings",async()=>{
    mocks.create.mockRejectedValue(new Error("secret-internal-database-details"))
    const result=await logWaterProduction({});expect(JSON.stringify(result)).not.toContain("secret-internal")
    expect(mocks.error).toHaveBeenCalledWith(expect.objectContaining({message:"Production operation failed"}))
  })
  it("does not revalidate or fetch commercial intelligence for a production workspace",async()=>{
    mocks.workspace.mockResolvedValue({schemes:[]})
    expect(await getProductionWorkspace("scheme","2024-02")).toEqual({ok:true,data:{schemes:[]}})
    expect(mocks.workspace).toHaveBeenCalledWith(user,"scheme","2024-02",undefined);expect(mocks.revalidate).not.toHaveBeenCalled()
  })
})
