"use client"

import { useEffect, useState } from "react"
import { Network } from "@capacitor/network"
import { sqliteService } from "@/lib/offline/sqlite-service"
import { syncManager } from "@/lib/offline/sync-manager"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { isNative } from "@/lib/mobile-hardware"

export function SyncStatus({ agentId }: { agentId: string }) {
  const [status, setStatus] = useState<'synced' | 'syncing' | 'offline'>('synced')
  const [pendingCount, setPendingTotal] = useState(0)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [isOnline, setIsOnline] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || !isNative()) return;

    // 1. Initialize Sync Manager
    syncManager.initialize(agentId)

    // 2. Poll for status updates (every 10 seconds for UI)
    const interval = setInterval(async () => {
      const [receipts, readings, meta, net] = await Promise.all([
        sqliteService.getQueuedReceipts(),
        sqliteService.getQueuedMeterReadings(),
        sqliteService.getSyncMeta(),
        Network.getStatus()
      ])

      setPendingTotal(receipts.length + readings.length)
      if (meta?.lastSuccessfulPullAt) {
        setLastSync(new Date(meta.lastSuccessfulPullAt))
      }
      setIsOnline(net.connected)

      // Logic for indicator color
      if (!net.connected) setStatus('offline')
      else if (receipts.length + readings.length > 0) setStatus('syncing')
      else setStatus('synced')
    }, 5000)

    return () => clearInterval(interval)
  }, [agentId])

  if (!mounted || !isNative()) return null

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
      {status === 'offline' && (
        <span>Offline · {pendingCount} Pending</span>
      )}
    </Link>
  )
}
