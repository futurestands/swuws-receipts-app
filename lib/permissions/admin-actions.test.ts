import { describe, it, expect, vi, beforeEach } from "vitest"
import { setAgentRole, setAgentActive, deleteAgent } from "../../app/actions/admin"
import type { SessionUser } from "../../lib/session"

type TargetUser = Pick<SessionUser, "id" | "branchId" | "clusterId" | "schemeId">
interface SelectFixture {
  from(): SelectFixture
  where(): SelectFixture
  limit(): Promise<TargetUser[]>
  orderBy(): SelectFixture
  innerJoin(): SelectFixture
  leftJoin(): SelectFixture
}
interface UpdateFixture {
  set(): UpdateFixture
  where(): UpdateFixture
  returning(): Promise<{ id: string }[]>
}

const mocks = vi.hoisted(() => ({
  select: vi.fn<() => SelectFixture>(),
  update: vi.fn<() => UpdateFixture>(),
  delete: vi.fn<() => { where: () => Promise<object> }>(),
  requireUser: vi.fn<() => Promise<SessionUser>>(),
  canCreateRole: vi.fn(async () => true),
  canAssignIamRole: vi.fn(async () => true),
}))

vi.mock('server-only', () => ({}))

vi.mock('../../lib/db', () => ({
  pool: {
    connect: vi.fn(),
    on: vi.fn(),
    end: vi.fn(),
  },
  db: {
    select: mocks.select,
    update: mocks.update,
    execute: vi.fn(),
    delete: mocks.delete,
    transaction: vi.fn((cb) => cb({
        select: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        execute: vi.fn(),
    })),
  }
}))

vi.mock('../../lib/session', () => ({
  requireUser: mocks.requireUser,
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
  canCreateRole: mocks.canCreateRole,
}))

vi.mock('../iam', () => ({
  canAssignIamRole: mocks.canAssignIamRole,
  getOwnRoleLevel: vi.fn(() => Promise.resolve(0)),
  hasPermission: vi.fn(() => Promise.resolve(true)),
}))

describe("Administrative Actions Authorization (IDOR & Scope Protection)", () => {
  const branchA_Admin: SessionUser = {
    id: "admin-a",
    name: "Branch A Admin", email: "admin-a@example.test", active: true,
    organizationId: "org-1", clusterId: null, schemeId: null,
    iamRoleId: null, roleLevel: 0, grants: [],
    role: "admin_local",
    branchId: "branch-a",
    permissions: [
      { code: "users.view", scope: "area" },
      { code: "users.edit", scope: "area" },
      { code: "users.disable", scope: "area" }
    ]
  }

  const userInBranchA: TargetUser = {
    id: "user-a",
    branchId: "branch-a",
    clusterId: "cluster-1",
    schemeId: null,
  }

  const userInBranchB: TargetUser = {
    id: "user-b",
    branchId: "branch-b",
    clusterId: "cluster-1",
    schemeId: null,
  }

  const mockDbSelect = (returnValue: TargetUser[]) => {
    const chain: SelectFixture = {
      from: () => chain,
      where: () => chain,
      limit: async () => returnValue,
      orderBy: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
    }
    mocks.select.mockReturnValue(chain)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.canCreateRole.mockResolvedValue(true)
    mocks.canAssignIamRole.mockResolvedValue(true)
    const update: UpdateFixture = {
      set: () => update,
      where: () => update,
      returning: async () => [{ id: "updated-id" }],
    }
    mocks.update.mockReturnValue(update)
    mocks.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue({})
    })
  })

  describe("setAgentRole", () => {
    it("preserves the legacy role ceiling before writing", async () => {
      mocks.requireUser.mockResolvedValue(branchA_Admin)
      mockDbSelect([userInBranchA])
      mocks.canCreateRole.mockResolvedValue(false)
      expect(await setAgentRole("user-a", "admin")).toMatchObject({ ok: false, error: "You are not authorized to assign this role" })
      expect(mocks.update).not.toHaveBeenCalled()
    })

    it("preserves the IAM role ceiling before writing", async () => {
      mocks.requireUser.mockResolvedValue(branchA_Admin)
      mockDbSelect([userInBranchA])
      mocks.canAssignIamRole.mockResolvedValue(false)
      expect(await setAgentRole("user-a", "agent", "elevated-role")).toMatchObject({ ok: false, error: "You are not authorized to assign this permission role" })
      expect(mocks.update).not.toHaveBeenCalled()
    })

    it("allows Branch A Admin to change role of User in Branch A", async () => {
      mocks.requireUser.mockResolvedValue(branchA_Admin)
      mockDbSelect([userInBranchA])

      const result = await setAgentRole("user-a", "agent")
      expect(result.ok).toBe(true)
    })

    it("denies Branch A Admin from changing role of User in Branch B (IDOR Protection)", async () => {
      mocks.requireUser.mockResolvedValue(branchA_Admin)
      mockDbSelect([userInBranchB])

      const result = await setAgentRole("user-b", "agent")
      expect(result.ok).toBe(false)
      expect(result.error).toContain("authorized")
      expect(mocks.update).not.toHaveBeenCalled()
    })
  })

  describe("setAgentActive", () => {
    it("allows Branch A Admin to toggle status of User in Branch A", async () => {
      mocks.requireUser.mockResolvedValue(branchA_Admin)
      mockDbSelect([userInBranchA])

      const result = await setAgentActive("user-a", false)
      expect(result.ok).toBe(true)
    })

    it("denies Branch A Admin from toggling status of User in Branch B", async () => {
      mocks.requireUser.mockResolvedValue(branchA_Admin)
      mockDbSelect([userInBranchB])

      const result = await setAgentActive("user-b", false)
      expect(result.ok).toBe(false)
      expect(mocks.update).not.toHaveBeenCalled()
    })
  })

  describe("deleteAgent", () => {
    it("denies Branch A Admin from deleting User in Branch B", async () => {
      mocks.requireUser.mockResolvedValue(branchA_Admin)
      mockDbSelect([userInBranchB])

      const result = await deleteAgent("user-b")
      expect(result.ok).toBe(false)
      expect(mocks.delete).not.toHaveBeenCalled()
    })
  })
})
