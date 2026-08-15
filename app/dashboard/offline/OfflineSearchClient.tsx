"use client"

import { useEffect, useState, useTransition } from "react"
import { sqliteService } from "@/lib/offline/sqlite-service"
import { getAgentOfflineData } from "@/app/actions/offline-sync"
import { syncOfflineReceiptBatch } from "@/app/actions/offline-upload"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"
import { formatUGX } from "@/lib/format"
import { Search, RefreshCw, Wifi, WifiOff, AlertCircle, Banknote, Clock, CheckCircle2, AlertTriangle } from "lucide-react"
import { isNative } from "@/lib/mobile-hardware"
import { OfflineReceiptForm } from "./OfflineReceiptForm"

export function OfflineSearchClient({ agentId }: { agentId: string }) {
  const [query, setQuery] = useState("")
  const [customers, setCustomers] = useState<any[]>([])
  const [syncMeta, setSyncMeta] = useState<any>(null)
  const [isOnline, setIsOnline] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [queuedReceipts, setQueuedReceipts] = useState<any[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)

  useEffect(() => {
    // Initial load
    const init = async () => {
      await sqliteService.initialize()
      await refreshData()
    }
    init()

    // Online/Offline status
    const updateOnlineStatus = () => setIsOnline(navigator.onLine)
    window.addEventListener("online", updateOnlineStatus)
    window.addEventListener("offline", updateOnlineStatus)
    if (typeof navigator !== 'undefined') setIsOnline(navigator.onLine)

    return () => {
      window.removeEventListener("online", updateOnlineStatus)
      window.removeEventListener("offline", updateOnlineStatus)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      refreshData()
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const refreshData = async () => {
    const [custs, meta, queue] = await Promise.all([
      sqliteService.searchCustomers(query),
      sqliteService.getSyncMeta(),
      sqliteService.getQueuedReceipts()
    ])
    setCustomers(custs)
    setSyncMeta(meta)
    setQueuedReceipts(queue)
  }

  const handleSyncPull = async () => {
    if (!isOnline) {
      toast.error("You must be online to sync data")
      return
    }

    setSyncing(true)
    try {
      const data = await getAgentOfflineData()
      await sqliteService.pullSync({
        ...data,
        agentId
      })
      await refreshData()
      toast.success("Offline cache updated successfully")
    } catch (err) {
      console.error(err)
      toast.error("Sync failed. Check your connection.")
    } finally {
      setSyncing(false)
    }
  }

  const handleSyncPush = async () => {
    if (!isOnline) {
      toast.error("You must be online to upload receipts")
      return
    }

    const pending = queuedReceipts.filter(r => r.status === 'queued' || r.status === 'failed')
    if (pending.length === 0) return

    setUploading(true)
    try {
      const batch = pending.map(r => ({
        tempId: r.id,
        data: {
          billingRecordId: r.billingRecordId || undefined,
          customerId: r.customerId,
          customerName: r.customerName,
          amount: r.amount,
          paymentMethod: r.paymentMethod,
          paymentReference: r.paymentReference || undefined,
          notes: r.notes || undefined,
          paymentDate: r.paymentDate || undefined
        }
      }))

      const results = await syncOfflineReceiptBatch(batch)

      for (const res of results) {
        await sqliteService.updateQueuedReceiptStatus(
          res.tempId,
          res.success ? 'synced' : 'failed',
          res.serverId,
          res.error
        )
      }

      await refreshData()
      const successCount = results.filter(r => r.success).length
      if (successCount === batch.length) {
        toast.success(`Successfully uploaded ${successCount} receipts`)
        await sqliteService.removeSyncedReceipts()
        await refreshData()
      } else {
        toast.warning(`Uploaded ${successCount} receipts. ${batch.length - successCount} failed.`)
      }
    } catch (err) {
      console.error(err)
      toast.error("Upload failed")
    } finally {
      setUploading(false)
    }
  }

  if (!isNative()) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold mb-2">Native Only Feature</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Offline search and receipting is only available when running as a native Android application.
          Use the standard portal for web browsing.
        </p>
      </div>
    )
  }

  if (selectedCustomerId) {
    return (
      <div className="max-w-lg mx-auto">
        <OfflineReceiptForm
          customerId={selectedCustomerId}
          onSuccess={() => {
            setSelectedCustomerId(null)
            refreshData()
          }}
          onCancel={() => setSelectedCustomerId(null)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Offline Mode</h1>
          <p className="text-muted-foreground">
            Issue receipts in areas with poor connectivity.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase ${isOnline ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-orange-100 text-orange-700 border border-orange-200'}`}>
            {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {isOnline ? 'Online' : 'Offline Mode'}
          </div>
          <Button
            onClick={handleSyncPull}
            disabled={syncing || !isOnline}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            Sync Cache
          </Button>
        </div>
      </div>

      {/* Sync Queue Card */}
      {queuedReceipts.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/30 overflow-hidden">
          <CardHeader className="py-3 px-4 border-b border-orange-100 bg-orange-100/50 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm font-bold text-orange-800">Pending Sync Queue</CardTitle>
              <CardDescription className="text-orange-700/70 text-xs">
                {queuedReceipts.filter(r => r.status !== 'synced').length} receipts waiting to be uploaded.
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={handleSyncPush}
              disabled={uploading || !isOnline}
              className="bg-orange-600 hover:bg-orange-700 text-white gap-2"
            >
              {uploading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
              Upload All
            </Button>
          </CardHeader>
          <CardContent className="p-0 max-h-60 overflow-y-auto">
            <div className="divide-y divide-orange-100">
              {queuedReceipts.map(r => (
                <div key={r.id} className="p-3 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-full">
                      <Banknote className="h-4 w-4 text-orange-600" />
                    </div>
                    <div>
                      <p className="font-bold">{r.customerName}</p>
                      <p className="text-xs text-muted-foreground">{formatUGX(r.amount)} · {r.paymentMethod}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.status === 'queued' && <div className="flex items-center gap-1 text-orange-600 font-medium text-xs"><Clock className="h-3 w-3" /> Queued</div>}
                    {r.status === 'syncing' && <div className="flex items-center gap-1 text-blue-600 font-medium text-xs"><RefreshCw className="h-3 w-3 animate-spin" /> Syncing</div>}
                    {r.status === 'failed' && (
                      <div className="flex items-center gap-1 text-destructive font-medium text-xs">
                        <AlertTriangle className="h-3 w-3" /> Failed
                        <span className="text-[10px] bg-destructive/10 px-1 rounded ml-1" title={r.error}>Info</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Find customer in cache..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9 h-11 shadow-sm"
        />
      </div>

      {syncMeta && (
        <p className="text-[10px] text-muted-foreground italic px-1 uppercase tracking-wider font-bold">
          Last Pull: {new Date(syncMeta.lastSuccessfulPullAt).toLocaleString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
          })}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3">
        {customers.map((c) => (
          <Card key={c.id} className="overflow-hidden border-muted-foreground/10 hover:border-primary/30 transition-colors shadow-sm">
            <CardContent className="p-4">
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <h3 className="font-bold text-base leading-none mb-1">{c.name}</h3>
                  <div className="flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-muted-foreground uppercase font-bold tracking-tight">
                    <span className="bg-muted px-1 rounded">{c.customerAccount || 'No Account'}</span>
                    <span>{c.phone || 'No Phone'}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase">Arrears:</p>
                    <p className={`text-sm font-black ${Number(c.accountBalance) > 0 ? 'text-destructive' : 'text-primary'}`}>
                      {formatUGX(Math.abs(Number(c.accountBalance)))}
                      {Number(c.accountBalance) < 0 && " (CR)"}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => setSelectedCustomerId(c.id)}
                  className="gap-2 h-10 px-4"
                >
                  <Banknote className="h-4 w-4" />
                  Collect
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {customers.length === 0 && (
          <div className="py-12 text-center border-2 border-dashed rounded-xl bg-muted/30">
            <Search className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">
              {query ? 'No matching customers in local cache.' : 'Use the search bar to find customers.'}
            </p>
            {!syncMeta && (
              <p className="text-xs text-primary font-bold mt-2 animate-pulse">
                Connect to internet and tap "Sync Cache" to begin.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
