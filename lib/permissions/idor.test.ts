import { describe, it, expect, vi } from "vitest"

vi.mock('server-only', () => ({}))
vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    execute: vi.fn(),
  }
}))

import { validateTargetUserScope } from "../scopes"
import { UserPermissionsContext } from "./index"
import { ROLES } from "./roles"

describe("Target-User Geographic Authorization (IDOR Protection)", () => {
  const branchA_Admin: UserPermissionsContext = {
    id: "admin-a",
    role: "admin_local", // Non-system-admin
    branchId: "branch-a",
    permissions: [
      { code: "users.view", scope: "area" },
      { code: "users.edit", scope: "area" },
      { code: "users.disable", scope: "area" }
    ]
  }

  const globalAdmin: UserPermissionsContext = {
    id: "global-admin",
    role: ROLES.SYSTEM_ADMIN,
    permissions: [{ code: "users.view", scope: "global" }]
  }

  const userInBranchA = {
    id: "user-a",
    branchId: "branch-a",
    clusterId: "cluster-1"
  }

  const userInBranchB = {
    id: "user-b",
    branchId: "branch-b",
    clusterId: "cluster-1"
  }

  it("allows Branch A Admin to manage User in Branch A", async () => {
    expect(await validateTargetUserScope(branchA_Admin, userInBranchA)).toBe(true)
  })

  it("denies Branch A Admin from managing User in Branch B", async () => {
    expect(await validateTargetUserScope(branchA_Admin, userInBranchB)).toBe(false)
  })

  it("allows Global Admin to manage anyone", async () => {
    expect(await validateTargetUserScope(globalAdmin, userInBranchA)).toBe(true)
    expect(await validateTargetUserScope(globalAdmin, userInBranchB)).toBe(true)
  })

  it("denies access if target is outside own scope for 'own' scoped users", async () => {
    const regularUser: UserPermissionsContext = {
        id: "user-a",
        role: "agent",
        permissions: [{ code: "users.view", scope: "own" }]
    }
    expect(await validateTargetUserScope(regularUser, userInBranchA)).toBe(true)
    expect(await validateTargetUserScope(regularUser, userInBranchB)).toBe(false)
  })
})

import { validateWriteScope } from "../scopes"

describe("Destination Hierarchy Authorization (P0 Hardening)", () => {
  const branchA_Admin: UserPermissionsContext = {
    id: "admin-a",
    role: "admin_local",
    branchId: "branch-a",
    permissions: [{ code: "users.view", scope: "area" }, { code: "users.edit", scope: "area" }]
  }

  it("allows Branch A Admin to move user to Branch A", async () => {
    expect(await validateWriteScope(branchA_Admin, "users.view", { branchId: "branch-a" })).toBe(true)
  })

  it("denies Branch A Admin from moving user to Branch B", async () => {
    expect(await validateWriteScope(branchA_Admin, "users.view", { branchId: "branch-b" })).toBe(false)
  })

  it("denies Branch A Admin from unassigning branch (moving to global)", async () => {
    expect(await validateWriteScope(branchA_Admin, "users.view", { branchId: null })).toBe(false)
  })

  it("denies inconsistent hierarchy (Scheme S2 is not in Branch B1)", async () => {
    // Mock the DB lookup for waterScheme
    const { db } = await import("../db")
    vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ branchId: "branch-b" }]), // S2 belongs to Branch B
    } as any)

    expect(await validateWriteScope(branchA_Admin, "users.view", { branchId: "branch-a", schemeId: "scheme-s2" })).toBe(false)
  })
})
