// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react"
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { NetworkSnapshot } from "./network-watch"

type SearchResult = { customers: { id: string; name: string }[]; total: number; page: number; pageSize: number; totalPages: number }
const mocks = vi.hoisted(() => ({
  initialize: vi.fn<() => Promise<void>>(),
  local: vi.fn<(query: string, page: number, size: number) => Promise<SearchResult>>(),
  remote: vi.fn<(params: { query: string }) => Promise<{ customers: { id: string; name: string }[] }>>(),
  cachedIds: vi.fn<(ids: string[]) => Promise<Set<string>>>(),
  meta: vi.fn<() => Promise<unknown>>(), receipts: vi.fn<() => Promise<unknown[]>>(), readings: vi.fn<() => Promise<unknown[]>>(),
  removeReceipts: vi.fn(), removeReadings: vi.fn(),
  listeners: new Set<(snapshot: NetworkSnapshot) => void>(),
}))
vi.mock("./sqlite-service", () => ({ sqliteService: {
  initialize: mocks.initialize, searchCustomers: mocks.local, filterCachedIds: mocks.cachedIds,
  getSyncMeta: mocks.meta, getQueuedReceipts: mocks.receipts, getQueuedMeterReadings: mocks.readings,
  removeSyncedReceipts: mocks.removeReceipts, removeSyncedReadings: mocks.removeReadings,
} }))
vi.mock("@/app/actions/customers", () => ({ searchCustomers: mocks.remote }))
vi.mock("./network-watch", () => ({ watchNetwork: (listener: (snapshot: NetworkSnapshot) => void) => {
  mocks.listeners.add(listener)
  return () => { mocks.listeners.delete(listener) }
} }))
import { useOfflineSearch } from "./use-offline-search"
import { cachedCustomersSchema, queuedReceiptsSchema } from "./records"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
function local(id: string, page = 1): SearchResult {
  return { customers: [{ id, name: id }], total: 1, page, pageSize: 50, totalPages: 1 }
}
async function tick(ms = 0) { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
const receipt = { id: "q1", customerId: "c1", customerName: "One", amount: 12.5, paymentMethod: "cash", paymentDate: "2026-10-25", idempotencyKey: "stable-key", status: "queued" }

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mocks.listeners.clear()
  mocks.initialize.mockReset().mockResolvedValue(undefined)
  mocks.local.mockReset().mockResolvedValue({ customers: [], total: 0, page: 1, pageSize: 50, totalPages: 1 })
  mocks.remote.mockReset().mockResolvedValue({ customers: [] })
  mocks.cachedIds.mockReset().mockResolvedValue(new Set())
  mocks.meta.mockReset().mockResolvedValue(null)
  mocks.receipts.mockReset().mockResolvedValue([])
  mocks.readings.mockReset().mockResolvedValue([])
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe("offline customer search lifecycle", () => {
  it("ignores a slow older local search after the query changes", async () => {
    const older = deferred<SearchResult>()
    mocks.local.mockImplementation(async (query) => query === "old" ? older.promise : local("new"))
    const { result } = renderHook(() => useOfflineSearch("a"))
    await tick()
    act(() => result.current.setQuery("old"))
    await tick(300)
    act(() => result.current.setQuery("new"))
    await tick(300)
    expect(result.current.localCustomers[0].id).toBe("new")
    await act(async () => { older.resolve(local("old")) })
    expect(result.current.localCustomers[0].id).toBe("new")
  })

  it("ignores old server results and preserves server/cache deduplication", async () => {
    const older = deferred<{ customers: { id: string; name: string }[] }>()
    mocks.remote.mockImplementation(async ({ query }) => query === "old" ? older.promise : { customers: [{ id: "new", name: "New" }, { id: "cached", name: "Cached" }] })
    mocks.cachedIds.mockResolvedValue(new Set(["cached"]))
    const { result } = renderHook(() => useOfflineSearch("a"))
    await tick()
    act(() => result.current.setQuery("old"))
    await tick(300)
    act(() => result.current.setQuery("new"))
    await tick(300)
    expect(result.current.serverCustomers.map((row) => row.id)).toEqual(["new"])
    await act(async () => { older.resolve({ customers: [{ id: "old", name: "Old" }] }) })
    expect(result.current.serverCustomers.map((row) => row.id)).toEqual(["new"])
    expect(result.current.searchingServer).toBe(false)
  })

  it("ignores cache-ID filtering that finishes after a newer request", async () => {
    const older = deferred<Set<string>>()
    mocks.remote.mockImplementation(async ({ query }) => ({ customers: [{ id: query, name: query }] }))
    mocks.cachedIds.mockReturnValueOnce(older.promise).mockResolvedValue(new Set())
    const { result } = renderHook(() => useOfflineSearch("a"))
    await tick()
    act(() => result.current.setQuery("old"))
    await tick(300)
    act(() => result.current.setQuery("new"))
    await tick(300)
    await act(async () => { older.resolve(new Set()) })
    expect(result.current.serverCustomers[0].id).toBe("new")
  })

  it("clears the loading indicator if the replacement local search fails", async () => {
    const older = deferred<{ customers: { id: string; name: string }[] }>()
    mocks.remote.mockReturnValue(older.promise)
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { result } = renderHook(() => useOfflineSearch("a"))
    await tick()
    act(() => result.current.setQuery("old"))
    await tick(300)
    expect(result.current.searchingServer).toBe(true)
    mocks.local.mockRejectedValueOnce(new Error("SQLite read failed"))
    act(() => result.current.setQuery("new"))
    await tick(300)
    expect(result.current.searchingServer).toBe(false)
    await act(async () => { older.resolve({ customers: [{ id: "old", name: "Old" }] }) })
    expect(result.current.serverCustomers).toEqual([])
    warning.mockRestore()
  })

  it("cancels pending remote results on disconnect and searches again on reconnect", async () => {
    const older = deferred<{ customers: { id: string; name: string }[] }>()
    mocks.remote.mockReturnValueOnce(older.promise).mockResolvedValue({ customers: [{ id: "fresh", name: "Fresh" }] })
    const { result } = renderHook(() => useOfflineSearch("a"))
    await tick()
    act(() => result.current.setQuery("query"))
    await tick(300)
    act(() => { for (const listener of mocks.listeners) listener({ connected: false }) })
    await tick(300)
    await act(async () => { older.resolve({ customers: [{ id: "stale", name: "Stale" }] }) })
    expect(result.current.serverCustomers).toEqual([])
    act(() => { for (const listener of mocks.listeners) listener({ connected: true }) })
    await tick(300)
    expect(result.current.serverCustomers[0].id).toBe("fresh")
  })

  it("owns one network subscription under repeated mounting and stops initialization after unmount", async () => {
    const opening = deferred<void>()
    mocks.initialize.mockReturnValue(opening.promise)
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>
    const { unmount } = renderHook(() => useOfflineSearch("a"), { wrapper })
    expect(mocks.listeners.size).toBe(1)
    unmount()
    await act(async () => { opening.resolve() })
    expect(mocks.listeners.size).toBe(0)
    expect(mocks.local).not.toHaveBeenCalled()
    expect(mocks.receipts).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("prevents a stale queue refresh from replacing a newer snapshot", async () => {
    const older = deferred<unknown[]>()
    const { result } = renderHook(() => useOfflineSearch("a"))
    await tick()
    mocks.receipts.mockReturnValueOnce(older.promise).mockResolvedValue([{ ...receipt, id: "new" }])
    let first: Promise<void> = Promise.resolve()
    act(() => { first = result.current.refreshData() })
    await act(async () => { await result.current.refreshData() })
    await act(async () => { older.resolve([{ ...receipt, id: "old" }]); await first })
    expect(result.current.queuedReceipts[0].id).toBe("new")
  })

  it("emits pending changes from database/network events without changing queue contents", async () => {
    mocks.receipts.mockResolvedValue([receipt])
    const { result } = renderHook(() => useOfflineSearch("a"))
    await tick()
    const pending = vi.fn()
    let unsubscribe = () => {}
    act(() => { unsubscribe = result.current.subscribeToPending(pending) })
    await act(async () => { await result.current.refreshData() })
    expect(pending).toHaveBeenLastCalledWith({ connected: true, hasNewItems: true })
    act(() => { for (const listener of mocks.listeners) listener({ connected: false }) })
    expect(pending).toHaveBeenLastCalledWith({ connected: false, hasNewItems: true })
    expect(result.current.queuedReceipts[0]).toMatchObject(receipt)
    expect(mocks.removeReceipts).not.toHaveBeenCalled()
    expect(mocks.removeReadings).not.toHaveBeenCalled()
    unsubscribe()
  })

  it("rejects malformed plugin rows without deleting or silently dropping pending transactions", async () => {
    const { result } = renderHook(() => useOfflineSearch("a"))
    await tick()
    mocks.receipts.mockResolvedValue([{ ...receipt, amount: "unvalidated" }])
    await act(async () => { await expect(result.current.refreshData()).rejects.toThrow() })
    expect(mocks.removeReceipts).not.toHaveBeenCalled()
    expect(mocks.removeReadings).not.toHaveBeenCalled()
    expect(queuedReceiptsSchema.parse([receipt])[0].amount).toBe(12.5)
    expect(cachedCustomersSchema.parse([{ id: "c", name: "One", accountBalance: "-12.50" }])[0].accountBalance).toBe("-12.50")
  })
})
