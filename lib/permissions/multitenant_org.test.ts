import { describe, it, expect, vi, beforeEach } from "vitest"
import { createAgent } from "../../app/actions/admin"
import { importBulkUsers } from "../../app/actions/bulk-import"
import { resolveCreatorOrganizationId } from "../../lib/scopes/org-resolver"
import { db } from "../../lib/db"
import { requireUser } from "../../lib/session"
import { organization } from "../../lib/db/schema"
import type { ImportSummary } from "../../lib/import-engine"
import type { UserImportRow } from "../../lib/import-schemas"

vi.mock('server-only', () => ({}))

vi.mock('../../lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn().mockResolvedValue([]),
    })),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: "new-user-id" }]),
    })),
  }
}))

vi.mock('../../lib/session', () => ({
  requireUser: vi.fn(),
}))

vi.mock('../../lib/auth', () => ({
  auth: {
    api: {
      signUpEmail: vi.fn(() => Promise.resolve({ user: { id: "new-user-id" } })),
    }
  }
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('../../lib/audit', () => ({
  writeAudit: vi.fn(),
}))

vi.mock('../../lib/logger', () => ({
  logEvent: vi.fn(),
}))

vi.mock('../permissions', () => ({
  canCreateUser: vi.fn(() => true),
  canViewUsers: vi.fn(() => true),
}))

vi.mock('../permissions/server', () => ({
  canCreateRole: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('../scopes', () => ({
  validateWriteScope: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('../iam', () => ({
  canAssignIamRole: vi.fn(() => Promise.resolve(true)),
}))

describe("Multi-tenant Organization Assignment Audit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(db.select).mockImplementation(() => ({
      from: vi.fn().mockResolvedValue([]),
    }) as unknown as ReturnType<typeof db.select>)
  })

  it("createAgent assigns the creator's organizationId when multiple orgs exist", async () => {
    const currentUser = {
      id: "admin-b",
      organizationId: "org-b-id",
      role: "admin"
    }
    vi.mocked(requireUser).mockResolvedValue(currentUser as Awaited<ReturnType<typeof requireUser>>)

    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: "new-user-id" }])
    }
    vi.mocked(db.update).mockReturnValue(updateChain as unknown as ReturnType<typeof db.update>)

    const result = await createAgent({
      name: "New Agent",
      email: "agent@org-b.com",
      password: "password123",
      role: "agent"
    })

    expect(result.ok).toBe(true)
    const updateArgs = vi.mocked(updateChain.set).mock.calls[0][0] as { organizationId: string }

    expect(updateArgs.organizationId).toBe("org-b-id")
    expect(updateArgs.organizationId).not.toBe("org-a-id")
  })

  it("importBulkUsers assigns the creator's organizationId when multiple orgs exist", async () => {
    const currentUser = {
      id: "admin-b",
      organizationId: "org-b-id",
      role: "admin"
    }
    vi.mocked(requireUser).mockResolvedValue(currentUser as Awaited<ReturnType<typeof requireUser>>)

    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: "new-user-id" }])
    }
    vi.mocked(db.update).mockReturnValue(updateChain as unknown as ReturnType<typeof db.update>)

    const mockSummary: ImportSummary<UserImportRow> = {
      totalRows: 1,
      validRows: 1,
      errorRows: 0,
      warningRows: 0,
      rows: [{
        valid: true as const,
        sourceRow: 1,
        errors: [],
        warnings: [],
        data: {
          name: "Imported User",
          email: "imported@org-b.com",
          role: "agent",
          status: "active"
        }
      }]
    }

    const res = await importBulkUsers(mockSummary)
    expect(res.ok).toBe(true)

    const updateArgs = vi.mocked(updateChain.set).mock.calls[0][0] as { organizationId: string }
    expect(updateArgs.organizationId).toBe("org-b-id")
  })

  it("fails closed if creator has null organizationId and multiple organizations exist", async () => {
    const mockOrgs = [{ id: "org-a-id" }, { id: "org-b-id" }]
    const orgSelectChain = {
      from: vi.fn().mockResolvedValue(mockOrgs)
    }
    vi.mocked(db.select).mockImplementation((fields?: Record<string, unknown>) => {
      if (fields?.id === organization.id) return orgSelectChain as unknown as ReturnType<typeof db.select>
      return { from: vi.fn().mockResolvedValue([]) } as unknown as ReturnType<typeof db.select>
    })

    await expect(resolveCreatorOrganizationId({ id: "sys-admin", organizationId: null })).rejects.toThrow(
      "Organization scope required when multiple organizations exist"
    )
  })

  it("falls back to the single org when creator has null organizationId and exactly 1 org exists", async () => {
    const mockOrgs = [{ id: "org-single-id" }]
    const orgSelectChain = {
      from: vi.fn().mockResolvedValue(mockOrgs)
    }
    vi.mocked(db.select).mockImplementation((fields?: Record<string, unknown>) => {
      if (fields?.id === organization.id) return orgSelectChain as unknown as ReturnType<typeof db.select>
      return { from: vi.fn().mockResolvedValue([]) } as unknown as ReturnType<typeof db.select>
    })

    const orgId = await resolveCreatorOrganizationId({ id: "sys-admin", organizationId: null })
    expect(orgId).toBe("org-single-id")
  })

  it("rejects cross-organisation cluster reference", async () => {
    const creator = { id: "admin-b", organizationId: "org-b-id" }
    const clusterSelectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: "cluster-a-id", organizationId: "org-a-id" }])
    }

    vi.mocked(db.select).mockImplementation(() => clusterSelectChain as unknown as ReturnType<typeof db.select>)

    await expect(
      resolveCreatorOrganizationId(creator, { clusterId: "cluster-a-id" })
    ).rejects.toThrow("Referenced cluster belongs to a different organization")
  })
})
