import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  canIssueReceipt: vi.fn(),
  createReceipt: vi.fn(),
  select: vi.fn(),
  limit: vi.fn(),
}))

vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }))
vi.mock("@/lib/session", () => ({ requireUser: mocks.requireUser }))
vi.mock("@/lib/permissions", () => ({ canIssueReceipt: mocks.canIssueReceipt }))
vi.mock("@/app/actions/receipts", () => ({ createReceipt: mocks.createReceipt }))

import { POST } from "./route"

function request(batch: unknown = [{ tempId: "local-1", data: {} }]) {
  return new Request("http://localhost/api/sync/receipts", {
    method: "POST",
    body: JSON.stringify({ batch }),
    headers: { "Content-Type": "application/json" },
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.requireUser.mockResolvedValue({ id: "agent-1" })
  mocks.canIssueReceipt.mockReturnValue(true)
  mocks.select.mockReturnValue({
    from: () => ({ where: () => ({ limit: mocks.limit }) }),
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
  })

  it("recovers a duplicate receipt race without creating a second receipt", async () => {
    mocks.createReceipt.mockRejectedValue(Object.assign(new Error("DUPLICATE_RECEIPT"), {
      duplicateReceiptId: "receipt-1",
    }))
    expect(await (await POST(request())).json()).toEqual([{
      tempId: "local-1", success: true, serverId: "receipt-1", receiptNumber: "R-001", deduplicated: true,
    }])
    expect(mocks.createReceipt).toHaveBeenCalledTimes(1)
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
