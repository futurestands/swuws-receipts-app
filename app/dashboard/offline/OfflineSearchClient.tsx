"use client"

import { useEffect, useState } from "react"
import { sqliteService } from "@/lib/offline/sqlite-service"
import { getAgentOfflineData } from "@/app/actions/offline-sync"
import { syncOfflineReceiptBatch, syncOfflineMeterReadingBatch } from "@/app/actions/offline-upload"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { formatUGX } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Search, RefreshCw, Wifi, WifiOff, Banknote, Clock, Calculator, AlertTriangle, Printer } from "lucide-react"
import { OfflineReceiptForm } from "./OfflineReceiptForm"
import { OfflineMeterReadingForm } from "./OfflineMeterReadingForm"
import { printerManager } from "@/lib/offline/printer-manager"
import { searchCustomers } from "@/app/actions/customers"

export function OfflineSearchClient({ agentId }: { agentId: string }) {
  const [query, setQuery] = useState("")
  const [localCustomers, setLocalCustomers] = useState<any[]>([])
  const [serverCustomers, setServerCustomers] = useState<any[]>([])
  const [syncMeta, setSyncMeta] = useState<any>(null)
  const [isOnline, setIsOnline] = useState(true)
  const [searchingServer, setSearchingServer] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [queuedReceipts, setQueuedReceipts] = useState<any[]>([])
  const [queuedReadings, setQueuedReadings] = useState<any[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [selectedCustomerIdForReading, setSelectedCustomerIdForReading] = useState<string | null>(null)
  const [lastSyncAttempt, setLastSyncAttempt] = useState<number>(0)
  const SYNC_COOLDOWN = 30000 // 30 seconds cooldown

  const totalQueued = queuedReceipts.filter(r => r.status !== 'synced').length +
                      queuedReadings.filter(r => r.status !== 'synced').length

  const hasNewItems = queuedReceipts.some(r => r.status === 'queued') ||
                      queuedReadings.some(r => r.status === 'queued')

  const handleSearch = async () => {
    // Always search local SQLite
    const local = await sqliteService.searchCustomers(query)
    setLocalCustomers(local)

    // If online, search server
    if (isOnline && query.trim().length >= 2) {
      setSearchingServer(true)
      try {
        const res = await searchCustomers({ query })
        // Filter out customers already in local results
        const localIds = new Set(local.map(c => c.id))
        const filteredServer = res.customers.filter(c => !localIds.has(c.id))
        setServerCustomers(filteredServer)
      } catch (err) {
        console.warn('Server search failed', err)
      } finally {
        setSearchingServer(false)
      }
    } else {
      setServerCustomers([])
    }
  }

  const refreshData = async () => {
    const [meta, queue, readings] = await Promise.all([
      sqliteService.getSyncMeta(),
      sqliteService.getQueuedReceipts(),
      sqliteService.getQueuedMeterReadings()
    ])
    setSyncMeta(meta)
    setQueuedReceipts(queue)
    setQueuedReadings(readings)
    await handleSearch()
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch()
    }, 300)
    return () => clearTimeout(timer)
  }, [query, isOnline])

  useEffect(() => {
    let active = true
    const init = async () => {
      await sqliteService.initialize()
      if (active) await refreshData()
    }
    init()

    const updateOnlineStatus = () => setIsOnline(navigator.onLine)
    window.addEventListener("online", updateOnlineStatus)
    window.addEventListener("offline", updateOnlineStatus)

    if (typeof navigator !== 'undefined') {
      setIsOnline(navigator.onLine)
    }

    return () => {
      active = false
      window.removeEventListener("online", updateOnlineStatus)
      window.removeEventListener("offline", updateOnlineStatus)
    }
  }, [])

  const handleSyncPush = async () => {
    if (!isOnline) {
      toast.error("You must be online to upload data")
      return
    }

    const pendingReceipts = queuedReceipts.filter(r => r.status === 'queued' || r.status === 'failed')
    const pendingReadings = queuedReadings.filter(r => r.status === 'queued' || r.status === 'failed')

    if (pendingReceipts.length === 0 && pendingReadings.length === 0) return

    setUploading(true)
    setLastSyncAttempt(Date.now())
    try {
      // 1. Sync Receipts
      if (pendingReceipts.length > 0) {
        const batch = pendingReceipts.map(r => ({
          tempId: r.id,
          data: {
            billingRecordId: r.billingRecordId || undefined,
            customerId: r.customerId,
            customerName: r.customerName,
            amount: r.amount,
            paymentMethod: r.paymentMethod,
            paymentReference: r.paymentReference || undefined,
            notes: r.notes || undefined,
            paymentDate: r.paymentDate || undefined,
            idempotencyKey: r.idempotencyKey
          }
        }))

        const results = await syncOfflineReceiptBatch(batch)
        for (const res of results) {
          await sqliteService.updateQueuedReceiptStatus(res.tempId, res.success ? 'synced' : 'failed', res.serverId, res.error)
        }
      }

      // 2. Sync Readings
      if (pendingReadings.length > 0) {
        const batch = pendingReadings.map(r => ({
          tempId: r.id,
          data: {
            customerId: r.customerId,
            billingPeriodId: r.billingPeriodId,
            currentReading: r.currentReading,
            previousReading: r.previousReading,
            notes: r.notes || undefined,
            idempotencyKey: r.idempotencyKey
          }
        }))

        const results = await syncOfflineMeterReadingBatch(batch)
        for (const res of results) {
          await sqliteService.updateQueuedReadingStatus(res.tempId, res.success ? 'synced' : 'failed', res.error)
        }
      }

      await refreshData()
      await sqliteService.removeSyncedReceipts()
      await sqliteService.removeSyncedReadings()
      await refreshData()
      toast.success("Push sync completed")
    } catch (err) {
      console.error(err)
      toast.error("Upload failed")
    } finally {
      setUploading(false)
    }
  }

  useEffect(() => {
    const now = Date.now()
    if (isOnline && hasNewItems && !uploading && (now - lastSyncAttempt > SYNC_COOLDOWN)) {
      handleSyncPush()
    }
  }, [isOnline, hasNewItems, uploading])

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

  const handlePrintOffline = async (r: any) => {
    try {
      await printerManager.print({
        receiptNumber: r.id.slice(0, 8).toUpperCase(), // Provisional #
        customerName: r.customerName,
        amount: r.amount,
        paymentMethod: r.paymentMethod,
        paymentDate: r.paymentDate,
        isProvisional: true
      })
      toast.success("Printing receipt...")
    } catch (err: any) {
      toast.error(err.message || "Printing failed")
    }
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

  if (selectedCustomerIdForReading) {
    return (
      <div className="max-w-lg mx-auto">
        <OfflineMeterReadingForm
          customerId={selectedCustomerIdForReading}
          onSuccess={() => {
            setSelectedCustomerIdForReading(null)
            refreshData()
          }}
          onCancel={() => setSelectedCustomerIdForReading(null)}
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
            Issue receipts and capture readings while disconnected.
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
      {totalQueued > 0 && (
        <Card className="border-orange-200 bg-orange-50/30 overflow-hidden">
          <CardHeader className="py-3 px-4 border-b border-orange-100 bg-orange-100/50 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm font-bold text-orange-800">Pending Sync Queue</CardTitle>
              <CardDescription className="text-orange-700/70 text-xs">
                {totalQueued} items waiting to be uploaded.
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
                      <p className="text-xs text-muted-foreground">Receipt · {formatUGX(r.amount)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-orange-600 hover:bg-orange-100"
                      onClick={() => handlePrintOffline(r)}
                      title="Print Provisional Receipt"
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                    <StatusBadge status={r.status} error={r.error} />
                  </div>
                </div>
              ))}
              {queuedReadings.map(r => (
                <div key={r.id} className="p-3 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-full">
                      <Calculator className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-bold">{r.customerName}</p>
                      <p className="text-xs text-muted-foreground">Reading · {r.currentReading} m³</p>
                    </div>
                  </div>
                  <StatusBadge status={r.status} error={r.error} />
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
        {localCustomers.map((c) => (
          <CustomerCard key={c.id} customer={c} onCollect={() => setSelectedCustomerId(c.id)} onReading={() => setSelectedCustomerIdForReading(c.id)} isLocal={true} />
        ))}

        {searchingServer && (
          <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground animate-pulse">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Searching server...
          </div>
        )}

        {serverCustomers.map((c) => (
          <CustomerCard key={c.id} customer={c} onCollect={() => setSelectedCustomerId(c.id)} onReading={() => setSelectedCustomerIdForReading(c.id)} isLocal={false} />
        ))}

        {localCustomers.length === 0 && serverCustomers.length === 0 && !searchingServer && (
          <div className="py-12 text-center border-2 border-dashed rounded-xl bg-muted/30">
            <Search className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">
              {query ? 'No matching customers found.' : 'Use the search bar to find customers.'}
            </p>
            {!syncMeta && (
              <p className="text-xs text-primary font-bold mt-2 animate-pulse">
                App is warming up. Please stay on this page to sync.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function CustomerCard({ customer, onCollect, onReading, isLocal }: { customer: any, onCollect: () => void, onReading: () => void, isLocal: boolean }) {
  return (
    <Card className={cn(
      "overflow-hidden transition-colors shadow-sm",
      isLocal ? "border-muted-foreground/10 hover:border-primary/30" : "border-dashed border-primary/20 bg-primary/5"
    )}>
      <CardContent className="p-4">
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base leading-none">{customer.name}</h3>
              {!isLocal && <Badge variant="outline" className="text-[8px] h-3.5 px-1 uppercase border-primary/30 text-primary bg-white">Remote</Badge>}
            </div>
            <div className="flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-muted-foreground uppercase font-bold tracking-tight">
              <span className="bg-muted px-1 rounded">{customer.customerAccount || 'No Account'}</span>
              <span>{customer.phone || 'No Phone'}</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <p className="text-xs font-bold text-muted-foreground uppercase">Arrears:</p>
              <p className={`text-sm font-black ${Number(customer.accountBalance) > 0 ? 'text-destructive' : 'text-primary'}`}>
                {formatUGX(Math.abs(Number(customer.accountBalance)))}
                {Number(customer.accountBalance) < 0 && " (CR)"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onReading}
              className="gap-2 h-10 px-3"
              disabled={!isLocal} // Reading requires local cache for previous values
            >
              <Calculator className="h-4 w-4" />
              Reading
            </Button>
            <Button
              size="sm"
              onClick={onCollect}
              className="gap-2 h-10 px-3"
            >
              <Banknote className="h-4 w-4" />
              Collect
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status, error }: { status: string, error?: string }) {
  if (status === 'queued') return <div className="flex items-center gap-1 text-orange-600 font-medium text-xs"><Clock className="h-3 w-3" /> Queued</div>
  if (status === 'syncing') return <div className="flex items-center gap-1 text-blue-600 font-medium text-xs"><RefreshCw className="h-3 w-3 animate-spin" /> Syncing</div>
  if (status === 'failed') return (
    <div className="flex items-center gap-1 text-destructive font-medium text-xs">
      <AlertTriangle className="h-3 w-3" /> Failed
      <span className="text-[10px] bg-destructive/10 px-1 rounded ml-1" title={error}>Info</span>
    </div>
  )
  return null
}
