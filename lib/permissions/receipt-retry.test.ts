import { beforeEach, describe, expect, it, vi } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"
import type { SessionUser } from "@/lib/session"

const mocks = vi.hoisted(() => {
  const results = vi.fn<() => unknown[]>().mockReturnValue([])
  const where = vi.fn<(condition: SQL) => void>()
  const select = vi.fn(() => {
    const rows = results()
    const chain = {
      from: () => chain,
      where: (condition: SQL) => { where(condition); return chain },
      limit: async () => rows,
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
    }
    return chain
  })
  const tx = { select, execute: vi.fn(), insert: vi.fn(), update: vi.fn() }
  return {
    results, where, tx,
    requireUser: vi.fn<() => Promise<SessionUser>>(),
    transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  }
})

vi.mock("@/lib/db", () => ({ db: { ...mocks.tx, transaction: mocks.transaction } }))
vi.mock("@/lib/session", () => ({ requireUser: mocks.requireUser }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }))
vi.mock("@/lib/billing/close-expired", () => ({ closeExpiredActivePeriods: async () => {} }))
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logFinancial: vi.fn(), logEvent: vi.fn() }))
vi.mock("@/app/actions/settings", () => ({ getSettings: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { createReceipt } from "@/app/actions/receipts"

const current: SessionUser = {
  id: "agent-a", name: "Agent A", email: "agent-a@example.test", active: true,
  role: "agent", organizationId: "org-a", branchId: "branch-a", schemeId: null,
  clusterId: null, iamRoleId: null, roleLevel: 0, grants: [],
  permissions: [{ code: "receipts.create", scope: "area" }],
}
const input = { customerId: "customer-a", customerName: "Customer A", amount: 12.5, paymentMethod: "cash", branchId: "branch-a" }
const existing = { id: "receipt-a", receiptNumber: "R-A", amount: "12.50", customerName: "Customer A", branchId: "branch-a", agentId: "agent-a" }

function expectCreationScopedLookup() {
  const condition = mocks.where.mock.calls.at(-1)?.[0]
  if (!condition) throw new Error("Missing scope predicate")
  const compiled = new PgDialect().sqlToQuery(condition)
  expect(compiled.sql).toContain('"receipt"."branchId" =')
  expect(compiled.params).toEqual(["receipt-a", "branch-a", "branch-a", "branch-a"])
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.results.mockReset().mockReturnValue([])
  mocks.tx.execute.mockReset()
  mocks.requireUser.mockResolvedValue(current)
  mocks.results.mockReturnValueOnce([{ id: "period", status: "active" }])
})

describe("server-action receipt retry authorization", () => {
  it("reuses an existing in-scope receipt with only receipt-creation permission", async () => {
    mocks.results.mockReturnValueOnce([existing]).mockReturnValueOnce([{ id: existing.id }])
    expect(await createReceipt({ ...input, idempotencyKey: "retry-key" })).toMatchObject({ ok: true, receipt: existing })
    expectCreationScopedLookup()
    expect(mocks.tx.insert).not.toHaveBeenCalled()
    expect(mocks.tx.execute).not.toHaveBeenCalled()
  })

  it("rejects an idempotency key that resolves to a receipt outside the current scope", async () => {
    mocks.results.mockReturnValueOnce([{ ...existing, branchId: "branch-b" }]).mockReturnValueOnce([])
    expect(await createReceipt({ ...input, idempotencyKey: "foreign-key" }))
      .toEqual({ ok: false, error: "Receipt not found or access denied" })
    expectCreationScopedLookup()
    expect(mocks.tx.insert).not.toHaveBeenCalled()
    expect(mocks.tx.execute).not.toHaveBeenCalled()
  })

  it("keeps legacy branchless retries scoped through the linked customer", async () => {
    const branchless = { ...existing, branchId: null, schemeId: "scheme-a" }
    mocks.results.mockReturnValueOnce([branchless]).mockReturnValueOnce([{ id: existing.id }])
    expect(await createReceipt({ ...input, branchId: undefined, idempotencyKey: "legacy-key" })).toMatchObject({ ok: true, receipt: branchless })
    expectCreationScopedLookup()
    const condition = mocks.where.mock.calls.at(-1)?.[0]
    if (!condition) throw new Error("Missing predicate")
    const query = new PgDialect().sqlToQuery(condition)
    expect(query.sql).toContain('"receipt"."branchId" is null')
    expect(query.sql).toContain('SELECT id FROM customer WHERE "waterSchemeId" IN')
    expect(query.sql).toContain('"receipt"."schemeId" in (SELECT id FROM water_scheme')
    expect(mocks.tx.insert).not.toHaveBeenCalled()
  })

  it("rejects a forged target branch before looking up the key", async () => {
    expect(await createReceipt({ ...input, branchId: "branch-b", idempotencyKey: "retry-key" }))
      .toMatchObject({ ok: false, error: expect.stringContaining("not authorized") })
    expect(mocks.tx.select).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it.each([true, false])("scopes duplicate-race recovery (accessible=%s)", async (accessible) => {
    mocks.tx.execute.mockRejectedValueOnce(Object.assign(new Error("DUPLICATE_RECEIPT"), { duplicateReceiptId: existing.id }))
    mocks.results.mockReturnValueOnce(accessible ? [existing] : [])
    const result = await createReceipt(input)
    expect(result.ok).toBe(accessible)
    if (accessible) expect(result).toMatchObject({ receipt: existing, duplicate: true })
    else expect(result).not.toHaveProperty("receipt")
    expectCreationScopedLookup()
    expect(mocks.tx.insert).not.toHaveBeenCalled()
  })
})
