"use client"

import { useEffect, useState } from "react"
import { sqliteService } from "@/lib/offline/sqlite-service"
import { OfflineSearchClient } from "@/app/dashboard/offline/OfflineSearchClient"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RefreshCw, WifiOff } from "lucide-react"

export function OfflineWorkspaceClient() {
  const [agentId, setAgentId] = useState<string | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "no-cache">("loading")

  useEffect(() => {
    let active = true

    const init = async () => {
      await sqliteService.initialize()
      const meta = await sqliteService.getSyncMeta()
      if (!active) return

      // The agent id is whoever last pulled a cache onto this device. The
      // server session is unreachable offline, so sync_meta is the only
      // source for it.
      const cachedAgentId = (meta?.scopedAgentId as string | undefined) || null
      setAgentId(cachedAgentId)
      setState(cachedAgentId ? "ready" : "no-cache")
    }

    init()

    return () => {
      active = false
    }
  }, [])

  if (state === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Opening local database...
      </div>
    )
  }

  if (state === "no-cache" || !agentId) {
    return (
      <Card className="max-w-lg mx-auto">
        <CardContent className="py-10 text-center space-y-4">
          <WifiOff className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <div className="space-y-1">
            <h1 className="text-lg font-bold text-primary">No offline cache on this device</h1>
            <p className="text-sm text-muted-foreground">
              Nothing has been synced here yet, so there are no customers to work with
              offline. Reconnect, open Offline Mode and tap Sync Cache.
            </p>
          </div>
          <Button onClick={() => window.location.reload()} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  return <OfflineSearchClient agentId={agentId} />
}
