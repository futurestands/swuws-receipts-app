// @vitest-environment jsdom
import { StrictMode } from "react"
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { QueuedReceipt } from "@/lib/offline/records"
import type { OfflineSyncResult } from "@/app/actions/offline-upload"
import type { NetworkSnapshot } from "@/lib/offline/network-watch"

const mocks = vi.hoisted(() => {
  const queue: QueuedReceipt[] = []
  return {
  queue,
  push: vi.fn<(batch: unknown) => Promise<OfflineSyncResult[]>>(),
  update: vi.fn<(id: string, status: string, serverId?: string, error?: string) => Promise<void>>(),
  remove: vi.fn<() => Promise<void>>(), success: vi.fn(), error: vi.fn(),
  listeners: new Set<(snapshot: NetworkSnapshot) => void>(),
  }
})
vi.mock("@/lib/offline/sqlite-service", () => ({ sqliteService: {
  initialize: async () => {},
  getSyncMeta: async () => null,
  getQueuedReceipts: async () => mocks.queue,
  getQueuedMeterReadings: async () => [],
  searchCustomers: async () => ({ customers: [], total: 0, page: 1, pageSize: 50, totalPages: 1 }),
  updateQueuedReceiptStatus: mocks.update,
  removeSyncedReceipts: mocks.remove,
  removeSyncedReadings: async () => {},
} }))
vi.mock("@/lib/offline/network-watch", () => ({ watchNetwork: (listener: (snapshot: NetworkSnapshot) => void) => {
  mocks.listeners.add(listener)
  listener({ connected: true })
  return () => { mocks.listeners.delete(listener) }
} }))
vi.mock("@/app/actions/customers", () => ({ searchCustomers: vi.fn() }))
vi.mock("@/app/actions/offline-upload", () => ({ syncOfflineReceiptBatch: mocks.push, syncOfflineMeterReadingBatch: vi.fn() }))
vi.mock("@/lib/offline/pull-cache", () => ({ pullOfflineCache: vi.fn() }))
vi.mock("@/lib/offline/printer-manager", () => ({ printerManager: { print: vi.fn() } }))
vi.mock("@/lib/mobile-hardware", () => ({ isNative: () => true }))
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }))
vi.mock("./OfflineReceiptForm", () => ({ OfflineReceiptForm: () => null }))
vi.mock("./OfflineMeterReadingForm", () => ({ OfflineMeterReadingForm: () => null }))
import { OfflineSearchClient } from "./OfflineSearchClient"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mocks.listeners.clear()
  mocks.queue = [
    { id: "one", customerId: "c1", customerName: "One", amount: 12.5, paymentMethod: "cash", paymentDate: "2026-10-25", idempotencyKey: "stable-one", status: "queued" },
    { id: "two", customerId: "c2", customerName: "Two", amount: 20, paymentMethod: "cash", paymentDate: "2026-10-25", idempotencyKey: "stable-two", status: "failed" },
  ]
  mocks.update.mockImplementation(async (id, status, serverId, error) => {
    mocks.queue = mocks.queue.map((row) => row.id === id ? { ...row, status, serverId, error } : row)
  })
  mocks.remove.mockImplementation(async () => { mocks.queue = mocks.queue.filter((row) => row.status !== "synced") })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe("foreground offline upload lifecycle", () => {
  it("pushes once under repeated mounting and preserves amounts, keys, and failed transactions", async () => {
    mocks.push.mockResolvedValue([
      { tempId: "one", success: true, serverId: "server-one" }, { tempId: "two", success: false, error: "retry later" },
    ])
    render(<StrictMode><OfflineSearchClient agentId="a" /></StrictMode>)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(mocks.push.mock.calls[0][0]).toEqual([
      expect.objectContaining({ tempId: "one", data: expect.objectContaining({ amount: 12.5, idempotencyKey: "stable-one" }) }),
      expect.objectContaining({ tempId: "two", data: expect.objectContaining({ amount: 20, idempotencyKey: "stable-two" }) }),
    ])
    expect(mocks.queue).toEqual([expect.objectContaining({ id: "two", status: "failed", amount: 20, idempotencyKey: "stable-two" })])
    expect(mocks.listeners.size).toBe(1)
  })

  it("finishes in-flight acknowledgements after unmount without stale UI notifications", async () => {
    const response = deferred<OfflineSyncResult[]>()
    mocks.push.mockReturnValue(response.promise)
    const view = render(<OfflineSearchClient agentId="a" />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mocks.push).toHaveBeenCalledTimes(1)
    view.unmount()
    await act(async () => {
      response.resolve([{ tempId: "one", success: true, serverId: "server-one" }, { tempId: "two", success: false, error: "retry later" }])
    })
    expect(mocks.update).toHaveBeenCalledTimes(2)
    expect(mocks.queue).toEqual([expect.objectContaining({ id: "two", status: "failed" })])
    expect(mocks.listeners.size).toBe(0)
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
  })

  it("shares an in-flight upload across a complete unmount and remount", async () => {
    const response = deferred<OfflineSyncResult[]>()
    mocks.push.mockReturnValue(response.promise)
    const first = render(<OfflineSearchClient agentId="a" />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    first.unmount()
    render(<OfflineSearchClient agentId="a" />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mocks.push).toHaveBeenCalledTimes(1)
    await act(async () => {
      response.resolve([{ tempId: "one", success: true, serverId: "server-one" }, { tempId: "two", success: false, error: "retry later" }])
    })
    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(mocks.update).toHaveBeenCalledTimes(2)
    expect(mocks.queue).toEqual([expect.objectContaining({ id: "two", status: "failed" })])
  })
})
