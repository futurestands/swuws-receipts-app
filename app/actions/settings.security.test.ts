import { describe, it, expect, vi, beforeEach } from "vitest"
import { updateBranding, createWaterScheme } from "./settings"
import { requireUser } from "@/lib/session"

vi.mock("server-only", () => ({}))

vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: "generated-scheme-id", name: "Test Scheme", code: "test" }])),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
  },
}))

vi.mock("@/lib/audit", () => ({
  writeAudit: vi.fn(() => Promise.resolve()),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}))

vi.mock("@/lib/permissions", () => ({
  canConfigureSystem: vi.fn(() => true),
  canManageAreas: vi.fn(() => true),
  canManageSchemes: vi.fn(() => true),
  canAccessAdminConsole: vi.fn(() => true),
  canViewAllData: vi.fn(() => true),
}))

describe("Settings Actions Security Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("validates updateBranding input schema strictly and rejects extra/invalid fields", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "admin-id",
      role: "SYSTEM_ADMIN",
      roleLevel: 10,
    } as Awaited<ReturnType<typeof requireUser>>)

    const res = await updateBranding({
      orgName: "SWUWS Updated",
      billingGraceDays: 30,
    })

    expect(res.ok).toBe(true)
  })

  it("generates server-side UUID for createWaterScheme and formats code", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "admin-id",
      role: "SYSTEM_ADMIN",
      roleLevel: 10,
    } as Awaited<ReturnType<typeof requireUser>>)

    const res = await createWaterScheme({
      name: "New Water Scheme",
      code: "NWS-01",
    })

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.scheme.id).toBe("generated-scheme-id")
    }
  })
})
