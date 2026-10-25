"use client"

import { useEffect, useState } from "react"
import { Network } from "@capacitor/network"
import { sqliteService } from "@/lib/offline/sqlite-service"
import { syncManager } from "@/lib/offline/sync-manager"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { isNative } from "@/lib/mobile-hardware"

type SyncSnapshot = {
  agentId: string
  status: 'synced' | 'syncing' | 'offline'
  pendingCount: number
  lastSync: Date | null
}

export function SyncStatus({ agentId }: { agentId: string }) {
  const [snapshot, setSnapshot] = useState<SyncSnapshot | null>(null)

  useEffect(() => {
    if (!isNative()) return
    let active = true
    let polling = false
    let interval: ReturnType<typeof setInterval> | null = null
    let stopSync = () => {}
    const poll = async () => {
      if (!active || polling) return
      polling = true
      try {
        const [receipts, readings, meta, net] = await Promise.all([
          sqliteService.getQueuedReceipts(), sqliteService.getQueuedMeterReadings(),
          sqliteService.getSyncMeta(), Network.getStatus(),
        ])
        if (!active) return
        const pendingCount = receipts.length + readings.length
        const lastPull: unknown = meta?.lastSuccessfulPullAt
        setSnapshot({
          agentId, pendingCount,
          lastSync: typeof lastPull === "string" ? new Date(lastPull) : null,
          status: !net.connected ? 'offline' : pendingCount > 0 ? 'syncing' : 'synced',
        })
      } catch (err) {
        if (active) console.warn("Sync status refresh failed", err)
      } finally {
        polling = false
      }
    }
    const start = async () => {
      try {
        await sqliteService.initialize()
        if (!active) return
        stopSync = syncManager.initialize(agentId)
        await poll()
        if (active) interval = setInterval(() => { void poll() }, 5000)
      } catch (err) {
        if (active) console.error("SQLite init failed", err)
      }
    }
    void start()

    return () => {
      active = false
      if (interval) clearInterval(interval)
      stopSync()
    }
  }, [agentId])

  if (!snapshot || snapshot.agentId !== agentId) return null
  const { status, pendingCount, lastSync } = snapshot

  return (
    <Link
      href="/dashboard/offline/logs"
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-black uppercase transition-all",
        status === 'synced' && "text-green-600 bg-green-50",
        status === 'syncing' && "text-blue-600 bg-blue-50 animate-pulse",
        status === 'offline' && "text-orange-600 bg-orange-50"
      )}
    >
      <div className={cn(
        "h-1.5 w-1.5 rounded-full",
        status === 'synced' && "bg-green-600",
        status === 'syncing' && "bg-blue-600",
        status === 'offline' && "bg-orange-600"
      )} />

      {status === 'synced' && lastSync && (
        <span>Synced {formatDistanceToNow(lastSync)} ago</span>
      )}
      {status === 'syncing' && (
        <span>Syncing...</span>
      )}
      {status === 'offline' && pendingCount > 0 && (
        <span>{pendingCount} pending</span>
      )}
    </Link>
  )
}
