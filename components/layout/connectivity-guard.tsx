"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { WifiOff } from "lucide-react"
import { toast } from "sonner"
import { isNative } from "@/lib/mobile-hardware"
import { probeLiveServer, watchNetwork } from "@/lib/offline/network-watch"
import { OfflineSearchClient } from "@/app/dashboard/offline/OfflineSearchClient"

const OFFLINE_DEBOUNCE_MS = 1500
const ONLINE_DEBOUNCE_MS = 2000

/**
 * Field phones: drop into the local customer cache when the radio dies,
 * and return to the live dashboard when the server is reachable again.
 * Intentional visits to /dashboard/offline while already online are left
 * alone (prev === false is required before bouncing back).
 */
export function ConnectivityGuard({
  agentId,
  children,
  onForcedOffline,
}: {
  agentId: string
  children: React.ReactNode
  onForcedOffline?: (offline: boolean) => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [offlineWorkspace, setOfflineWorkspace] = useState(false)
  const pathnameRef = useRef(pathname)
  const lastConnected = useRef<boolean | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const routerRef = useRef(router)

  pathnameRef.current = pathname
  routerRef.current = router

  useEffect(() => {
    onForcedOffline?.(offlineWorkspace)
  }, [offlineWorkspace, onForcedOffline])

  useEffect(() => {
    const unsub = watchNetwork(({ connected }) => {
      if (timer.current) clearTimeout(timer.current)
      const delay = connected ? ONLINE_DEBOUNCE_MS : OFFLINE_DEBOUNCE_MS
      timer.current = setTimeout(async () => {
        const prev = lastConnected.current
        const path = pathnameRef.current
        const onOfflineRoute =
          path.startsWith("/dashboard/offline") || path.startsWith("/offline-shell")

        if (!connected) {
          lastConnected.current = false
          if (isNative() && !onOfflineRoute) {
            setOfflineWorkspace(true)
            if (prev !== false) {
              toast.message("No internet — working from the phone cache")
            }
          }
          return
        }

        const reachable = await probeLiveServer()
        if (!reachable) return

        lastConnected.current = true
        setOfflineWorkspace(false)

        if (prev === false) {
          toast.success("Back online")
          if (onOfflineRoute) {
            routerRef.current.replace("/dashboard")
          }
        }
      }, delay)
    })

    return () => {
      unsub()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  return (
    <>
      {offlineWorkspace && (
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-orange-800">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            Offline — collections stay on this phone until you reconnect
          </div>
          <OfflineSearchClient agentId={agentId} />
        </div>
      )}
      <div className={offlineWorkspace ? "hidden" : "contents"}>{children}</div>
    </>
  )
}
