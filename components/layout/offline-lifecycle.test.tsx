// @vitest-environment jsdom
import { StrictMode } from "react"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { NetworkSnapshot } from "@/lib/offline/network-watch"

const mocks = vi.hoisted(() => ({
  pathname: "/dashboard", native: true, replace: vi.fn(),
  listeners: new Set<(snapshot: NetworkSnapshot) => void>(),
  initialize: vi.fn<() => Promise<void>>(),
  receipts: vi.fn<() => Promise<unknown[]>>(),
  readings: vi.fn<() => Promise<unknown[]>>(),
  meta: vi.fn(), network: vi.fn(), probe: vi.fn(),
  startSync: vi.fn<(agentId: string) => () => void>(), stopSync: vi.fn(),
  message: vi.fn(), success: vi.fn(),
}))
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname, useRouter: () => ({ replace: mocks.replace }) }))
vi.mock("@/lib/mobile-hardware", () => ({ isNative: () => mocks.native }))
vi.mock("@/lib/offline/sqlite-service", () => ({ sqliteService: {
  initialize: mocks.initialize, getQueuedReceipts: mocks.receipts, getQueuedMeterReadings: mocks.readings, getSyncMeta: mocks.meta,
} }))
vi.mock("@capacitor/network", () => ({ Network: { getStatus: mocks.network } }))
vi.mock("@/lib/offline/sync-manager", () => ({ syncManager: { initialize: mocks.startSync } }))
vi.mock("@/lib/offline/network-watch", () => ({
  watchNetwork: (listener: (snapshot: NetworkSnapshot) => void) => {
    mocks.listeners.add(listener)
    return () => { mocks.listeners.delete(listener) }
  },
  probeLiveServer: mocks.probe,
}))
vi.mock("sonner", () => ({ toast: { message: mocks.message, success: mocks.success } }))
vi.mock("@/app/dashboard/offline/OfflineSearchClient", () => ({ OfflineSearchClient: () => <div>Phone cache</div> }))

import { ConnectivityGuard } from "./connectivity-guard"
import { SyncStatus } from "./SyncStatus"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
async function tick(ms = 0) { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
function network(connected: boolean) { act(() => { for (const listener of mocks.listeners) listener({ connected }) }) }

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mocks.listeners.clear()
  mocks.pathname = "/dashboard"
  mocks.native = true
  mocks.initialize.mockReset().mockResolvedValue(undefined)
  mocks.receipts.mockReset().mockResolvedValue([])
  mocks.readings.mockReset().mockResolvedValue([])
  mocks.meta.mockResolvedValue(null)
  mocks.network.mockResolvedValue({ connected: false })
  mocks.probe.mockReset().mockResolvedValue(true)
  mocks.startSync.mockReturnValue(mocks.stopSync)
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe("connectivity guard lifecycle", () => {
  it("debounces offline mode and returns from an offline route only after a reachable reconnect", async () => {
    const forced = vi.fn()
    const view = render(<ConnectivityGuard agentId="a" onForcedOffline={forced}>Live workspace</ConnectivityGuard>)
    network(false)
    await tick(1499)
    expect(screen.queryByText("Phone cache")).toBeNull()
    await tick(1)
    expect(screen.getByText("Phone cache")).toBeDefined()
    expect(forced).toHaveBeenLastCalledWith(true)
    mocks.pathname = "/dashboard/offline"
    view.rerender(<ConnectivityGuard agentId="a" onForcedOffline={forced}>Live workspace</ConnectivityGuard>)
    mocks.probe.mockResolvedValueOnce(false)
    network(true)
    await tick(2000)
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(screen.getByText("Phone cache")).toBeDefined()
    network(true)
    await tick(2000)
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/dashboard")
    expect(forced).toHaveBeenLastCalledWith(false)
  })

  it("ignores an older online probe after a newer disconnect", async () => {
    const probe = deferred<boolean>()
    mocks.probe.mockReturnValueOnce(probe.promise)
    render(<ConnectivityGuard agentId="a">Live</ConnectivityGuard>)
    network(false)
    await tick(1500)
    network(true)
    await tick(2000)
    network(false)
    await tick(1500)
    await act(async () => { probe.resolve(true) })
    expect(screen.getByText("Phone cache")).toBeDefined()
    expect(mocks.success).not.toHaveBeenCalled()
  })

  it("cleans listeners and probes on unmount and repeated mounting", async () => {
    const probe = deferred<boolean>()
    mocks.probe.mockReturnValueOnce(probe.promise)
    const view = render(<StrictMode><ConnectivityGuard agentId="a">Live</ConnectivityGuard></StrictMode>)
    expect(mocks.listeners.size).toBe(1)
    network(false)
    await tick(1500)
    network(true)
    await tick(2000)
    const signal: unknown = mocks.probe.mock.calls[0][1]
    view.unmount()
    expect(mocks.listeners.size).toBe(0)
    expect(signal).toBeInstanceOf(AbortSignal)
    if (!(signal instanceof AbortSignal)) throw new Error("Expected abort signal")
    expect(signal.aborted).toBe(true)
    await act(async () => { probe.resolve(true) })
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.success).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("keeps intentional online visits to the offline route", async () => {
    mocks.pathname = "/dashboard/offline"
    render(<ConnectivityGuard agentId="a">Live</ConnectivityGuard>)
    network(true)
    await tick(2000)
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})

describe("sync status lifecycle", () => {
  it("initializes on the first native mount and polls the pending queues", async () => {
    mocks.receipts.mockResolvedValue([{}, {}])
    const view = render(<StrictMode><SyncStatus agentId="a" /></StrictMode>)
    await tick()
    expect(mocks.startSync).toHaveBeenCalledExactlyOnceWith("a")
    expect(screen.getByText("2 pending")).toBeDefined()
    await tick(5000)
    expect(mocks.receipts).toHaveBeenCalledTimes(2)
    view.unmount()
    expect(mocks.stopSync).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("does not start background sync after unmount while SQLite opens", async () => {
    const opening = deferred<void>()
    mocks.initialize.mockReturnValue(opening.promise)
    const view = render(<SyncStatus agentId="a" />)
    view.unmount()
    await act(async () => { opening.resolve() })
    expect(mocks.startSync).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("prevents the prior agent's slower poll from replacing current state", async () => {
    const older = deferred<unknown[]>()
    mocks.receipts.mockReturnValueOnce(older.promise).mockResolvedValue([{}])
    const view = render(<SyncStatus agentId="a" />)
    await tick()
    view.rerender(<SyncStatus agentId="b" />)
    await tick()
    expect(screen.getByText("1 pending")).toBeDefined()
    await act(async () => { older.resolve([{}, {}, {}]) })
    expect(screen.queryByText("3 pending")).toBeNull()
    expect(screen.getByText("1 pending")).toBeDefined()
  })

  it("does not initialize native synchronization on web", async () => {
    mocks.native = false
    render(<SyncStatus agentId="a" />)
    await tick()
    expect(mocks.initialize).not.toHaveBeenCalled()
    expect(mocks.startSync).not.toHaveBeenCalled()
  })
})
