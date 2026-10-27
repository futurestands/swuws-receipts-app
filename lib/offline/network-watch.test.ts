// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ConnectionStatus } from "@capacitor/network"

const mocks = vi.hoisted(() => {
  const callbacks: { listener: ((status: ConnectionStatus) => void) | null } = { listener: null }
  return {
  native: true,
  callbacks,
  addListener: vi.fn(), status: vi.fn(), remove: vi.fn<() => Promise<void>>(),
  }
})
vi.mock("@/lib/mobile-hardware", () => ({ isNative: () => mocks.native }))
vi.mock("@capacitor/network", () => ({ Network: {
  addListener: (name: string, listener: (status: ConnectionStatus) => void) => {
    mocks.callbacks.listener = listener
    return mocks.addListener(name, listener)
  },
  getStatus: mocks.status,
} }))
import { probeLiveServer, watchNetwork } from "./network-watch"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
const flush = async () => { await vi.advanceTimersByTimeAsync(0) }
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mocks.native = true
  mocks.callbacks.listener = null
  mocks.remove.mockResolvedValue(undefined)
  mocks.addListener.mockReset().mockResolvedValue({ remove: mocks.remove })
  mocks.status.mockReset().mockResolvedValue({ connected: true, connectionType: "wifi" })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe("network subscription ownership", () => {
  it("removes a native listener whose registration completes after unsubscribe", async () => {
    const registration = deferred<{ remove: () => Promise<void> }>()
    mocks.addListener.mockReturnValue(registration.promise)
    const changed = vi.fn()
    const unsubscribe = watchNetwork(changed)
    await flush()
    unsubscribe()
    registration.resolve({ remove: mocks.remove })
    await flush()
    expect(mocks.remove).toHaveBeenCalledTimes(1)
    mocks.callbacks.listener?.({ connected: false, connectionType: "none" })
    window.dispatchEvent(new Event("online"))
    expect(changed).not.toHaveBeenCalled()
  })

  it("does not overwrite a new network event with a slower initial status", async () => {
    const initial = deferred<ConnectionStatus>()
    mocks.status.mockReturnValue(initial.promise)
    const changed = vi.fn()
    const unsubscribe = watchNetwork(changed)
    await flush()
    mocks.callbacks.listener?.({ connected: false, connectionType: "none" })
    initial.resolve({ connected: true, connectionType: "wifi" })
    await flush()
    expect(changed.mock.calls).toEqual([[{ connected: false }]])
    unsubscribe()
  })

  it("cleans browser listeners across repeated subscriptions", () => {
    mocks.native = false
    const changed = vi.fn()
    const first = watchNetwork(changed)
    first()
    const second = watchNetwork(changed)
    changed.mockClear()
    window.dispatchEvent(new Event("offline"))
    expect(changed).toHaveBeenCalledExactlyOnceWith({ connected: false })
    second()
    window.dispatchEvent(new Event("online"))
    expect(changed).toHaveBeenCalledTimes(1)
  })
})

describe("reachability probe cleanup", () => {
  it("clears the timeout after fetch rejection", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")))
    expect(await probeLiveServer()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("aborts an in-flight probe when its owner unmounts", async () => {
    const fetchMock = vi.fn<typeof fetch>((url, options) => {
      expect(url).toBe("/api/health")
      return new Promise<Response>((resolve, reject) => {
        if (!options?.signal) { resolve(new Response()); return }
        options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
      })
    })
    vi.stubGlobal("fetch", fetchMock)
    const controller = new AbortController()
    const pending = probeLiveServer(8000, controller.signal)
    controller.abort()
    expect(await pending).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
