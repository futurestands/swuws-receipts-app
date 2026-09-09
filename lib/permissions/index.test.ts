import { describe, it, expect, vi } from "vitest"

vi.mock('server-only', () => ({}))

vi.mock('../db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
  },
}))

vi.mock('../iam', () => ({
  getOwnRoleLevel: vi.fn(() => Promise.resolve(0)),
}))

import { UserPermissionsContext } from "./index"
import { canCreateRole } from "./server"
import { ROLES } from "./roles"

describe("canCreateRole (role-ceiling enforcement)", () => {
  const clusterManager: UserPermissionsContext = {
    id: "cm-1",
    role: ROLES.CLUSTER_MANAGER,
    permissions: ["users.create"],
  }

  const agentWithCreatePermission: UserPermissionsContext = {
    id: "agent-1",
    role: ROLES.PLUMBER,
    permissions: ["users.create"],
  }

  const systemAdmin: UserPermissionsContext = {
    id: "admin-1",
    role: ROLES.SYSTEM_ADMIN,
    permissions: ["roles.manage"],
  }

  const noPermissions: UserPermissionsContext = {
    id: "nobody-1",
    role: ROLES.PLUMBER,
    permissions: [],
  }

  it("blocks a mid-level user from assigning System Administrator", async () => {
    expect(await canCreateRole(clusterManager, ROLES.SYSTEM_ADMIN)).toBe(false)
  })

  it("blocks a low-level user (agent) from assigning any role above their own", async () => {
    expect(await canCreateRole(agentWithCreatePermission, ROLES.CLUSTER_MANAGER)).toBe(false)
    expect(await canCreateRole(agentWithCreatePermission, ROLES.SYSTEM_ADMIN)).toBe(false)
  })

  it("allows a user to assign roles at or below their own rank", async () => {
    expect(await canCreateRole(clusterManager, ROLES.COMMERCIAL_OFFICER)).toBe(true)
    expect(await canCreateRole(clusterManager, ROLES.PLUMBER)).toBe(true)
    expect(await canCreateRole(clusterManager, ROLES.CLUSTER_MANAGER)).toBe(true)
  })

  it("allows a System Administrator to assign any role, including admin", async () => {
    expect(await canCreateRole(systemAdmin, ROLES.SYSTEM_ADMIN)).toBe(true)
    expect(await canCreateRole(systemAdmin, ROLES.PLUMBER)).toBe(true)
  })

  it("denies anyone without roles.manage or users.create outright", async () => {
    expect(await canCreateRole(noPermissions, ROLES.PLUMBER)).toBe(false)
  })

  it("rejects an unrecognized role string rather than assuming it's safe", async () => {
    expect(await canCreateRole(systemAdmin, "not_a_real_role")).toBe(false)
  })
})
