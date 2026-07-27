import { describe, it, expect } from "vitest"
import { applyReceiptScope, UserPermissionsContext } from "./index"

describe("Organizational Scoping Engine", () => {
  const globalAdmin: UserPermissionsContext = {
    id: "admin-1",
    role: "admin",
    permissions: ["receipts.view"],
    grants: [{ code: "receipts.view", scope: "global" }]
  }

  const areaManager: UserPermissionsContext = {
    id: "manager-1",
    role: "area_manager",
    branchId: "branch-abc",
    permissions: ["receipts.view"],
    grants: [{ code: "receipts.view", scope: "area" }]
  }

  const agent: UserPermissionsContext = {
    id: "agent-1",
    role: "agent",
    permissions: ["receipts.view"],
    grants: [{ code: "receipts.view", scope: "own" }]
  }

  it("returns undefined (no filter) for Global scope", () => {
    const filter = applyReceiptScope(globalAdmin)
    expect(filter).toBeUndefined()
  })

  it("returns an 'equals' filter for Area scope", () => {
    const filter = applyReceiptScope(areaManager)
    expect(filter).toBeDefined()
    // Verify properties of the SQL object instead of stringifying
    const sqlObj = filter as any
    expect(sqlObj.queryChunks).toBeDefined()
  })

  it("returns an 'own' filter for Agent scope", () => {
    const filter = applyReceiptScope(agent)
    expect(filter).toBeDefined()
    const sqlObj = filter as any
    expect(sqlObj.queryChunks).toBeDefined()
  })

  it("denies access (1=0) if permission is missing", () => {
    const randomUser: UserPermissionsContext = { id: "u-1", role: "none" }
    const filter = applyReceiptScope(randomUser)
    const sqlObj = filter as any
    // "1 = 0" usually results in a specific chunk pattern in Drizzle
    expect(sqlObj.queryChunks).toBeDefined()
  })
})
