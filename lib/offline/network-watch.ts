import { isNative } from "@/lib/mobile-hardware"

export type NetworkSnapshot = { connected: boolean }

type Unsub = () => void

/**
 * Android WebView often lies about navigator.onLine. Prefer Capacitor
 * Network on the native app; fall back to the browser event on web.
 */
export async function getNetworkSnapshot(): Promise<NetworkSnapshot> {
  if (typeof window === "undefined") return { connected: true }
  if (isNative()) {
    try {
      const { Network } = await import("@capacitor/network")
      const status = await Network.getStatus()
      return { connected: status.connected }
    } catch {
      /* fall through */
    }
  }
  return { connected: navigator.onLine }
}

/** Same-origin probe so "connected" is not just a radio with no route. */
export async function probeLiveServer(timeoutMs = 8000, signal?: AbortSignal): Promise<boolean> {
  if (typeof window === "undefined") return true
  const ctrl = new AbortController()
  const abort = () => ctrl.abort()
  if (signal?.aborted) return false
  signal?.addEventListener("abort", abort, { once: true })
  const timer = setTimeout(abort, timeoutMs)
  try {
    const res = await fetch("/api/health", { cache: "no-store", signal: ctrl.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", abort)
  }
}

export function watchNetwork(onChange: (snap: NetworkSnapshot) => void): Unsub {
  let removed = false
  let capHandle: { remove: () => Promise<void> } | null = null
  let revision = 0
  let initialRevision = revision

  const emit = (connected: boolean) => {
    if (!removed) onChange({ connected })
  }

  const onOnline = () => { revision++; emit(true) }
  const onOffline = () => { revision++; emit(false) }

  window.addEventListener("online", onOnline)
  window.addEventListener("offline", onOffline)

  if (isNative()) {
    import("@capacitor/network")
      .then(async ({ Network }) => {
        if (removed) return
        initialRevision = revision
        const registration = Network.addListener("networkStatusChange", (status) => {
          revision++
          emit(status.connected)
        }).then(async (handle) => {
          if (removed) await handle.remove()
          else capHandle = handle
        })
        const [, status] = await Promise.all([registration, Network.getStatus()])
        if (revision === initialRevision) emit(status.connected)
      })
      .catch(() => {
        if (revision === initialRevision) emit(navigator.onLine)
      })
  } else {
    emit(navigator.onLine)
  }

  return () => {
    if (removed) return
    removed = true
    window.removeEventListener("online", onOnline)
    window.removeEventListener("offline", onOffline)
    void capHandle?.remove().catch(() => {})
  }
}
