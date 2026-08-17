import { describe, it, expect } from "vitest"
import { UserPermissionsContext } from "./index"
import { canCreateRole } from "./server"
import { ROLES } from "./roles"

/**
 * Regression coverage for the role-ceiling privilege-escalation fix.
 *
 * Previously canCreateRole accepted a targetRoleCode parameter but never
 * checked it, so ANY user holding the low-bar "users.create" permission
 * could create or promote an account to ANY role — including System
 * Administrator — regardless of their own level. That legacy `role` field
 * is read directly (bypassing the dynamic IAM permission system) by
 * billing-engine.ts's meter-reading cancellation check and by
 * approval.ts's approver lookup, so this was a real authorization bypass,
 * not just a cosmetic label mismatch.
 */
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

  it("blocks a mid-level user from assigning System Administrator", () => {
    expect(canCreateRole(clusterManager, ROLES.SYSTEM_ADMIN)).toBe(false)
  })

  it("blocks a low-level user (agent) from assigning any role above their own", () => {
    expect(canCreateRole(agentWithCreatePermission, ROLES.CLUSTER_MANAGER)).toBe(false)
    expect(canCreateRole(agentWithCreatePermission, ROLES.SYSTEM_ADMIN)).toBe(false)
  })

  it("allows a user to assign roles at or below their own rank", () => {
    expect(canCreateRole(clusterManager, ROLES.COMMERCIAL_OFFICER)).toBe(true)
    expect(canCreateRole(clusterManager, ROLES.PLUMBER)).toBe(true)
    expect(canCreateRole(clusterManager, ROLES.CLUSTER_MANAGER)).toBe(true)
  })

  it("allows a System Administrator to assign any role, including admin", () => {
    expect(canCreateRole(systemAdmin, ROLES.SYSTEM_ADMIN)).toBe(true)
    expect(canCreateRole(systemAdmin, ROLES.PLUMBER)).toBe(true)
  })

  it("denies anyone without roles.manage or users.create outright", () => {
    expect(canCreateRole(noPermissions, ROLES.PLUMBER)).toBe(false)
  })

  it("rejects an unrecognized role string rather than assuming it's safe", () => {
    expect(canCreateRole(systemAdmin, "not_a_real_role")).toBe(false)
  })
})
