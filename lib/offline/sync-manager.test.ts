import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { NetworkSnapshot } from "./network-watch"
import type { ConnectionStatus } from "@capacitor/network"

const mocks = vi.hoisted(() => ({
  listeners: new Set<(snapshot: NetworkSnapshot) => void>(), status: vi.fn<() => Promise<ConnectionStatus>>(),
  receipts: vi.fn(), readings: vi.fn(), updateReceipt: vi.fn(), removeReceipts: vi.fn(),
  updateReading: vi.fn(), removeReadings: vi.fn(), log: vi.fn(), notify: vi.fn(), pull: vi.fn(),
}))
vi.mock("../mobile-hardware", () => ({ isNative: () => true }))
vi.mock("./network-watch", () => ({ watchNetwork: (listener: (snapshot: NetworkSnapshot) => void) => {
  mocks.listeners.add(listener)
  return () => { mocks.listeners.delete(listener) }
} }))
vi.mock("@capacitor/network", () => ({ Network: { getStatus: mocks.status } }))
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: { schedule: vi.fn(async () => {}) } }))
vi.mock("./pull-cache", () => ({ pullOfflineCache: mocks.pull }))
vi.mock("./sqlite-service", () => ({ sqliteService: {
  getQueuedReceipts: mocks.receipts, getQueuedMeterReadings: mocks.readings,
  updateQueuedReceiptStatus: mocks.updateReceipt, removeSyncedReceipts: mocks.removeReceipts,
  updateQueuedReadingStatus: mocks.updateReading, removeSyncedReadings: mocks.removeReadings,
  logSync: mocks.log, addNotification: mocks.notify,
} }))
import { SyncManager } from "./sync-manager"

function emit(connected: boolean) { for (const listener of mocks.listeners) listener({ connected }) }
const stops: (() => void)[] = []
async function flushRegistration() {
  await import("@capacitor/network")
  await vi.advanceTimersByTimeAsync(0)
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mocks.listeners.clear()
  mocks.status.mockReset().mockResolvedValue({ connected: true, connectionType: "wifi" })
  mocks.receipts.mockReset().mockResolvedValue([])
  mocks.readings.mockReset().mockResolvedValue([])
  mocks.pull.mockResolvedValue({ loaded: 1, total: 1, truncated: false })
})
afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers()
})

describe("background synchronization lifecycle", () => {
  it("keeps one listener and one WiFi timer on repeated initialization", async () => {
    const manager = new SyncManager()
    const sync = vi.spyOn(manager, "autoSync").mockResolvedValue(undefined)
    const oldStop = manager.initialize("a")
    const stop = manager.initialize("b")
    stops.push(stop)
    oldStop()
    expect(mocks.listeners.size).toBe(1)
    emit(true)
    await flushRegistration()
    expect(sync).toHaveBeenCalledExactlyOnceWith("b")
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000)
    expect(sync).toHaveBeenCalledTimes(2)
    stop()
    expect(mocks.listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("stops periodic work offline and restores the mobile interval on reconnect", async () => {
    const manager = new SyncManager()
    const sync = vi.spyOn(manager, "autoSync").mockResolvedValue(undefined)
    mocks.status.mockResolvedValue({ connected: true, connectionType: "cellular" })
    const stop = manager.initialize("a")
    stops.push(stop)
    emit(false)
    expect(sync).not.toHaveBeenCalled()
    emit(true)
    await flushRegistration()
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000)
    expect(sync).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3.5 * 60 * 60 * 1000)
    expect(sync).toHaveBeenCalledTimes(2)
    emit(false)
    expect(vi.getTimerCount()).toBe(0)
    stop()
  })

  it("does not create a timer after an asynchronous status completes on unmount", async () => {
    let resolve!: (status: ConnectionStatus) => void
    mocks.status.mockReturnValue(new Promise((done) => { resolve = done }))
    const manager = new SyncManager()
    vi.spyOn(manager, "autoSync").mockResolvedValue(undefined)
    const stop = manager.initialize("a")
    stops.push(stop)
    emit(true)
    await flushRegistration()
    stop()
    resolve({ connected: true, connectionType: "wifi" })
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(mocks.listeners.size).toBe(0)
  })

  it("retains failed transactions and acknowledges successful pushes before cache refresh", async () => {
    mocks.receipts.mockResolvedValue([
      { id: "one", customerId: "c1", customerName: "One", amount: 12.5, paymentMethod: "cash", idempotencyKey: "key-one" },
      { id: "two", customerId: "c2", customerName: "Two", amount: 20, paymentMethod: "cash", idempotencyKey: "key-two" },
    ])
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([
      { tempId: "one", success: true, serverId: "server-one" }, { tempId: "two", success: false, error: "retry later" },
    ])))
    vi.stubGlobal("fetch", fetchMock)
    await new SyncManager().autoSync("a")
    expect(mocks.updateReceipt.mock.calls).toEqual([
      ["one", "synced", "server-one", undefined], ["two", "failed", undefined, "retry later"],
    ])
    expect(mocks.removeReceipts).toHaveBeenCalledTimes(1)
    expect(mocks.updateReceipt.mock.invocationCallOrder[1]).toBeLessThan(mocks.removeReceipts.mock.invocationCallOrder[0])
    expect(mocks.removeReceipts.mock.invocationCallOrder[0]).toBeLessThan(mocks.pull.mock.invocationCallOrder[0])
    const body: unknown = fetchMock.mock.calls[0][1]?.body
    if (typeof body !== "string") throw new Error("Expected serialized batch")
    expect(body).toContain('"idempotencyKey":"key-one"')
    expect(body).toContain('"amount":12.5')
  })
})
