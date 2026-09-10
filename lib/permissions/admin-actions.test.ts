import { describe, it, expect, vi, beforeEach } from "vitest"
import { setAgentRole, setAgentActive, setAgentHierarchy, deleteAgent } from "../../app/actions/admin"
import { db } from "../../lib/db"
import { requireUser } from "../../lib/session"
import { ROLES } from "./roles"

vi.mock('server-only', () => ({}))

vi.mock('../../lib/db', () => ({
  pool: {
    connect: vi.fn(),
    on: vi.fn(),
    end: vi.fn(),
  },
  db: {
    select: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn((cb) => cb({
        select: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        execute: vi.fn(),
    })),
  }
}))

vi.mock('../../lib/session', () => ({
  requireUser: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('../../lib/audit', () => ({
  writeAudit: vi.fn(),
}))

vi.mock('../../lib/logger', () => ({
  logEvent: vi.fn(),
  logFinancial: vi.fn(),
}))

vi.mock('./server', () => ({
  canCreateRole: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('../iam', () => ({
  canAssignIamRole: vi.fn(() => Promise.resolve(true)),
  getOwnRoleLevel: vi.fn(() => Promise.resolve(0)),
  hasPermission: vi.fn(() => Promise.resolve(true)),
}))

describe("Administrative Actions Authorization (IDOR & Scope Protection)", () => {
  const branchA_Admin = {
    id: "admin-a",
    role: "admin_local",
    branchId: "branch-a",
    permissions: [{ code: "users.view", scope: "area" }]
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

  const mockDbSelect = (returnValue: any) => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(returnValue),
      orderBy: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
    }
    vi.mocked(db.select).mockReturnValue(chain as any)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'updated-id' }])
    } as any)
    vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue({})
    } as any)
  })

  describe("setAgentRole", () => {
    it("allows Branch A Admin to change role of User in Branch A", async () => {
      vi.mocked(requireUser).mockResolvedValue(branchA_Admin as any)
      mockDbSelect([userInBranchA])

      const result = await setAgentRole("user-a", "agent")
      expect(result.ok).toBe(true)
    })

    it("denies Branch A Admin from changing role of User in Branch B (IDOR Protection)", async () => {
      vi.mocked(requireUser).mockResolvedValue(branchA_Admin as any)
      mockDbSelect([userInBranchB])

      const result = await setAgentRole("user-b", "agent")
      expect(result.ok).toBe(false)
      expect(result.error).toContain("authorized")
    })
  })

  describe("setAgentActive", () => {
    it("allows Branch A Admin to toggle status of User in Branch A", async () => {
      vi.mocked(requireUser).mockResolvedValue(branchA_Admin as any)
      mockDbSelect([userInBranchA])

      const result = await setAgentActive("user-a", false)
      expect(result.ok).toBe(true)
    })

    it("denies Branch A Admin from toggling status of User in Branch B", async () => {
      vi.mocked(requireUser).mockResolvedValue(branchA_Admin as any)
      mockDbSelect([userInBranchB])

      const result = await setAgentActive("user-b", false)
      expect(result.ok).toBe(false)
    })
  })

  describe("deleteAgent", () => {
    it("denies Branch A Admin from deleting User in Branch B", async () => {
      vi.mocked(requireUser).mockResolvedValue(branchA_Admin as any)
      mockDbSelect([userInBranchB])

      const result = await deleteAgent("user-b")
      expect(result.ok).toBe(false)
    })
  })
})
