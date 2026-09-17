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
export async function probeLiveServer(timeoutMs = 8000): Promise<boolean> {
  if (typeof window === "undefined") return true
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch("/api/health", { cache: "no-store", signal: ctrl.signal })
    clearTimeout(timer)
    return res.ok
  } catch {
    return false
  }
}

export function watchNetwork(onChange: (snap: NetworkSnapshot) => void): Unsub {
  let removed = false
  let capHandle: { remove: () => Promise<void> } | null = null

  const emit = (connected: boolean) => {
    if (!removed) onChange({ connected })
  }

  const onOnline = () => emit(true)
  const onOffline = () => emit(false)

  window.addEventListener("online", onOnline)
  window.addEventListener("offline", onOffline)

  if (isNative()) {
    import("@capacitor/network")
      .then(({ Network }) => {
        if (removed) return
        Network.addListener("networkStatusChange", (status) => {
          emit(status.connected)
        }).then((handle) => {
          capHandle = handle
        })
        return Network.getStatus()
      })
      .then((status) => {
        if (status && "connected" in status) emit(status.connected)
      })
      .catch(() => {
        emit(navigator.onLine)
      })
  } else {
    emit(navigator.onLine)
  }

  return () => {
    removed = true
    window.removeEventListener("online", onOnline)
    window.removeEventListener("offline", onOffline)
    void capHandle?.remove()
  }
}
