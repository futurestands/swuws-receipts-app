import { beforeEach, describe, expect, it, vi } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"
import type { SessionUser } from "@/lib/session"

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn<() => Promise<SessionUser>>(),
  canIssueReceipt: vi.fn(),
  createReceipt: vi.fn(),
  select: vi.fn(),
  limit: vi.fn(),
  where: vi.fn<(condition: SQL) => void>(),
}))

vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }))
vi.mock("@/lib/session", () => ({ requireUser: mocks.requireUser }))
vi.mock("@/lib/permissions", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/permissions")>(),
  canIssueReceipt: mocks.canIssueReceipt,
}))
vi.mock("@/app/actions/receipts", () => ({ createReceipt: mocks.createReceipt }))

import { POST } from "./route"

const current: SessionUser = {
  id: "agent-1", name: "Agent One", email: "one@example.test", active: true,
  role: "agent", organizationId: "org-1", clusterId: null, branchId: "branch-a",
  schemeId: null, iamRoleId: null, roleLevel: 0, grants: [],
  permissions: [{ code: "receipts.create", scope: "area" }],
}

function expectScopedLookup() {
  const condition = mocks.where.mock.calls.at(-1)?.[0]
  expect(condition).toBeDefined()
  if (!condition) throw new Error("Expected scoped lookup")
  const query = new PgDialect().sqlToQuery(condition)
  expect(query.sql).toContain('"receipt"."branchId" =')
  expect(query.params).toContain("branch-a")
}

function request(batch: unknown = [{ tempId: "local-1", data: {} }]) {
  return new Request("http://localhost/api/sync/receipts", {
    method: "POST",
    body: JSON.stringify({ batch }),
    headers: { "Content-Type": "application/json" },
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.requireUser.mockResolvedValue(current)
  mocks.canIssueReceipt.mockReturnValue(true)
  mocks.select.mockReturnValue({
    from: () => ({ where: (condition: SQL) => { mocks.where(condition); return { limit: mocks.limit } } }),
  })
  mocks.limit.mockResolvedValue([{ id: "receipt-1", receiptNumber: "R-001" }])
})

describe("receipt batch sync", () => {
  it("rejects users without receipt permission before writing", async () => {
    mocks.canIssueReceipt.mockReturnValue(false)
    expect((await POST(request())).status).toBe(403)
    expect(mocks.createReceipt).not.toHaveBeenCalled()
  })

  it("returns an existing receipt for an idempotent retry", async () => {
    const response = await POST(request([{ tempId: "local-1", data: { idempotencyKey: "key-1" } }]))
    expect(await response.json()).toEqual([{
      tempId: "local-1", success: true, serverId: "receipt-1", receiptNumber: "R-001", deduplicated: true,
    }])
    expect(mocks.createReceipt).not.toHaveBeenCalled()
    expectScopedLookup()
  })

  it("recovers a duplicate receipt race without creating a second receipt", async () => {
    mocks.createReceipt.mockRejectedValue(Object.assign(new Error("DUPLICATE_RECEIPT"), {
      duplicateReceiptId: "receipt-1",
    }))
    expect(await (await POST(request())).json()).toEqual([{
      tempId: "local-1", success: true, serverId: "receipt-1", receiptNumber: "R-001", deduplicated: true,
    }])
    expect(mocks.createReceipt).toHaveBeenCalledTimes(1)
    expectScopedLookup()
  })

  it("does not acknowledge or disclose a duplicate outside the issuing scope", async () => {
    mocks.limit.mockResolvedValue([])
    mocks.createReceipt.mockRejectedValue(Object.assign(new Error("DUPLICATE_RECEIPT"), { duplicateReceiptId: "foreign-receipt" }))
    expect(await (await POST(request())).json()).toEqual([{
      tempId: "local-1", success: false, error: "Receipt not found or access denied",
    }])
    expectScopedLookup()
  })

  it("does not short-circuit authorization when a foreign idempotency key is retried", async () => {
    mocks.limit.mockResolvedValue([])
    mocks.createReceipt.mockResolvedValue({ ok: false, error: "Receipt not found or access denied" })
    expect(await (await POST(request([{ tempId: "local-1", data: { idempotencyKey: "foreign-key" } }]))).json())
      .toEqual([{ tempId: "local-1", success: false, error: "Receipt not found or access denied" }])
    expectScopedLookup()
    expect(mocks.createReceipt).toHaveBeenCalledTimes(1)
  })

  it("rejects a foreign target branch before the idempotency fast path", async () => {
    const response = await POST(request([{ tempId: "local-1", data: { branchId: "branch-b", idempotencyKey: "key-1" } }]))
    expect(await response.json()).toEqual([{
      tempId: "local-1", success: false, error: "You are not authorized to issue receipts for this branch",
    }])
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.createReceipt).not.toHaveBeenCalled()
  })

  it("does not use a global view grant to bypass the receipt-creation scope", async () => {
    mocks.requireUser.mockResolvedValue({ ...current, permissions: [
      { code: "receipts.create", scope: "area" }, { code: "receipts.view", scope: "global" },
    ] })
    await POST(request([{ tempId: "local-1", data: { idempotencyKey: "key-1" } }]))
    expectScopedLookup()
  })

  it.each([new Error("database unavailable"), { message: "database unavailable" }])(
    "preserves a string error message for a failed item",
    async (error) => {
      mocks.createReceipt.mockRejectedValue(error)
      expect(await (await POST(request())).json()).toEqual([{
        tempId: "local-1", success: false, error: "database unavailable",
      }])
    },
  )

  it.each([null, "network failure", { message: 123, duplicateReceiptId: 456 }])(
    "handles an unexpected thrown value and continues the batch",
    async (error) => {
      mocks.createReceipt.mockRejectedValueOnce(error).mockResolvedValueOnce({
        ok: true, receipt: { id: "receipt-2", receiptNumber: "R-002" },
      })
      const response = await POST(request([
        { tempId: "local-1", data: {} }, { tempId: "local-2", data: {} },
      ]))
      expect(await response.json()).toEqual([
        { tempId: "local-1", success: false, error: "Sync failed" },
        { tempId: "local-2", success: true, serverId: "receipt-2", receiptNumber: "R-002" },
      ])
    },
  )

  it("returns a stable response for unexpected authentication failures", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      mocks.requireUser.mockRejectedValue(null)
      const response = await POST(request())
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ error: "Internal server error" })
    } finally {
      consoleError.mockRestore()
    }
  })
})
