import { describe, it, expect, vi, beforeEach } from "vitest"
import { createAgent } from "../../app/actions/admin"
import { db } from "../../lib/db"
import { requireUser } from "../../lib/session"
import { organization, user } from "../../lib/db/schema"

vi.mock('server-only', () => ({}))

vi.mock('../../lib/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
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
  })

  it("VULNERABILITY PROOF: createAgent assigns the WRONG organization in a multi-tenant environment", async () => {
    // Current user belongs to "Org B"
    const currentUser = {
      id: "admin-b",
      organizationId: "org-b-id",
      role: "admin"
    }
    vi.mocked(requireUser).mockResolvedValue(currentUser as any)

    // Database has multiple organizations. "Org A" is the first one returned by limit(1).
    const mockOrganizations = [
      { id: "org-a-id" },
      { id: "org-b-id" }
    ]

    // Mock organization lookup (the vulnerable call)
    const orgSelectChain = {
      from: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockOrganizations[0]]),
    }
    vi.mocked(db.select).mockImplementation((fields: any) => {
        if (fields.id === organization.id) return orgSelectChain as any
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]) } as any
    })

    // Mock update user
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: "new-user-id" }])
    }
    vi.mocked(db.update).mockReturnValue(updateChain as any)

    await createAgent({
      name: "New Agent",
      email: "agent@org-b.com",
      password: "password123",
      role: "agent"
    })

    // VERIFICATION: Check what organizationId was passed to update()
    const updateArgs = vi.mocked(updateChain.set).mock.calls[0][0] as any

    // THIS IS THE BUG: It assigned org-a-id even though the creator is in org-b-id
    expect(updateArgs.organizationId).toBe("org-a-id")
    expect(updateArgs.organizationId).not.toBe(currentUser.organizationId)
  })
})
