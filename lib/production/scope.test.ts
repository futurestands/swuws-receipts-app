import { describe, expect, it } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"
import { productionGrantScope, productionSchemeFilter, intelligenceHierarchyFilter } from "./scope"
import { canCreateProduction, canManageProductionSources, canVerifyProduction } from "@/lib/permissions"

const user = { id:"u", role:"agent", organizationId:"org-a", schemeId:"scheme-a", permissions:[{code:"production.view",scope:"scheme"},{code:"production.create",scope:"scheme"}] }
const query=(filter: ReturnType<typeof productionSchemeFilter>)=>new PgDialect().sqlToQuery(filter)
describe("production authorisation",()=>{
  it("read/report/investigation authority never grants mutation authority",()=>{
    const reader={...user,role:"head_commercial",roleLevel:100,permissions:[{code:"intelligence.view",scope:"global"},{code:"reports.view",scope:"global"}]}
    expect(canCreateProduction(reader)).toBe(false);expect(canVerifyProduction(reader)).toBe(false);expect(canManageProductionSources(reader)).toBe(false)
  })
  it("intersects requested scheme with both organisation and assigned scheme",()=>{
    const q=query(productionSchemeFilter(user,"production.create","foreign"))
    expect(q.params).toContain("org-a");expect(q.params).toContain("scheme-a");expect(q.params).toContain("foreign")
  })
  it("denies missing ancestry, missing grants and own-only review",()=>{
    expect(query(productionSchemeFilter({...user,organizationId:null})).sql).toContain("false")
    expect(query(productionSchemeFilter(user,"production.verify")).sql).toBe("false")
    const own={...user,permissions:[{code:"production.view",scope:"own"},{code:"production.verify",scope:"own"}]}
    expect(query(productionSchemeFilter(own,"production.verify")).sql).toBe("false")
  })
  it("intersects all assignments even with a global grant",()=>{
    const q=query(productionSchemeFilter({...user,branchId:"b",clusterId:"c",permissions:[{code:"production.view",scope:"global"}]}))
    for(const value of ["org-a","scheme-a","b","c"])expect(q.params).toContain(value)
  })
  it("keeps intelligence compatibility read inside organisation and requested scheme",()=>{
    const q=query(intelligenceHierarchyFilter({...user,role:"commercial_officer"},"foreign"))
    expect(q.params).toContain("foreign");expect(q.params).toContain("scheme-a");expect(q.params).toContain("org-a")
  })
  it("uses resolved inherited grant scopes without a seniority write bypass",()=>expect(productionGrantScope({...user,roleLevel:100},"production.verify")).toBeNull())
})
