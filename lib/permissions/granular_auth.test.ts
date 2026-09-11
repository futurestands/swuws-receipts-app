import { describe, it, expect, vi } from "vitest"
import {
  canViewUsers,
  canCreateUser,
  canEditUser,
  canDisableUser,
  canResetPasswords,
  UserPermissionsContext
} from "./index"
import { ROLES } from "./roles"

vi.mock('server-only', () => ({}))

describe("Granular User Management Authorization", () => {
  const viewerOnly: UserPermissionsContext = {
    id: "v-1",
    role: ROLES.PLUMBER,
    permissions: [{ code: "users.view", scope: "global" }]
  }

  const creatorOnly: UserPermissionsContext = {
    id: "c-1",
    role: ROLES.PLUMBER,
    permissions: [{ code: "users.create", scope: "global" }]
  }

  const editorOnly: UserPermissionsContext = {
    id: "e-1",
    role: ROLES.PLUMBER,
    permissions: [{ code: "users.edit", scope: "global" }]
  }

  const disablerOnly: UserPermissionsContext = {
    id: "d-1",
    role: ROLES.PLUMBER,
    permissions: [{ code: "users.disable", scope: "global" }]
  }

  const resetterOnly: UserPermissionsContext = {
    id: "r-1",
    role: ROLES.PLUMBER,
    permissions: [{ code: "users.reset_password", scope: "global" }]
  }

  const systemAdmin: UserPermissionsContext = {
    id: "admin-1",
    role: ROLES.SYSTEM_ADMIN,
    permissions: []
  }

  describe("users.view", () => {
    it("can view but cannot mutate", () => {
      expect(canViewUsers(viewerOnly)).toBe(true)
      expect(canCreateUser(viewerOnly)).toBe(false)
      expect(canEditUser(viewerOnly)).toBe(false)
      expect(canDisableUser(viewerOnly)).toBe(false)
      expect(canResetPasswords(viewerOnly)).toBe(false)
    })
  })

  describe("users.create", () => {
    it("can create but not edit/disable/reset", () => {
      expect(canCreateUser(creatorOnly)).toBe(true)
      expect(canEditUser(creatorOnly)).toBe(false)
      expect(canDisableUser(creatorOnly)).toBe(false)
      expect(canResetPasswords(creatorOnly)).toBe(false)
    })
  })

  describe("users.edit", () => {
    it("can edit but not create/disable/reset", () => {
      expect(canEditUser(editorOnly)).toBe(true)
      expect(canCreateUser(editorOnly)).toBe(false)
      expect(canDisableUser(editorOnly)).toBe(false)
      expect(canResetPasswords(editorOnly)).toBe(false)
    })
  })

  describe("users.disable", () => {
    it("can disable but not create/edit/reset", () => {
      expect(canDisableUser(disablerOnly)).toBe(true)
      expect(canCreateUser(disablerOnly)).toBe(false)
      expect(canEditUser(disablerOnly)).toBe(false)
      expect(canResetPasswords(disablerOnly)).toBe(false)
    })
  })

  describe("users.reset_password", () => {
    it("can reset password but not create/edit/disable", () => {
      expect(canResetPasswords(resetterOnly)).toBe(true)
      expect(canCreateUser(resetterOnly)).toBe(false)
      expect(canEditUser(resetterOnly)).toBe(false)
      expect(canDisableUser(resetterOnly)).toBe(false)
    })
  })

  describe("System Administrator", () => {
    it("can perform all operations", () => {
      expect(canViewUsers(systemAdmin)).toBe(true)
      expect(canCreateUser(systemAdmin)).toBe(true)
      expect(canEditUser(systemAdmin)).toBe(true)
      expect(canDisableUser(systemAdmin)).toBe(true)
      expect(canResetPasswords(systemAdmin)).toBe(true)
    })
  })
})
