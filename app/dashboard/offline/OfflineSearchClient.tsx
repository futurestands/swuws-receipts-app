"use client"

import { useEffect, useState } from "react"
import { sqliteService } from "@/lib/offline/sqlite-service"
import { getAgentOfflineData } from "@/app/actions/offline-sync"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"
import { formatUGX } from "@/lib/format"
import { Search, RefreshCw, Wifi, WifiOff, AlertCircle } from "lucide-react"
import { isNative } from "@/lib/mobile-hardware"

export function OfflineSearchClient({ agentId }: { agentId: string }) {
  const [query, setQuery] = useState("")
  const [customers, setCustomers] = useState<any[]>([])
  const [syncMeta, setSyncMeta] = useState<any>(null)
  const [isOnline, setIsOnline] = useState(true)
  const [syncing, setSyncing] = useState(false)

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
    updateOnlineStatus()

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
    const results = await sqliteService.searchCustomers(query)
    setCustomers(results)
    const meta = await sqliteService.getSyncMeta()
    setSyncMeta(meta)
  }

  const handleSync = async () => {
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

  if (!isNative()) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold mb-2">Native Only Feature</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Offline search is only available when running as a native Android application.
          Use the standard customer search for the web portal.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Offline Search</h1>
          <p className="text-muted-foreground">
            Search assigned customers and view balances without an internet connection.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase ${isOnline ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
            {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {isOnline ? 'Online' : 'Offline Mode'}
          </div>
          <Button
            onClick={handleSync}
            disabled={syncing || !isOnline}
            size="sm"
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            Sync Now
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, account, or phone..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9 h-11"
        />
      </div>

      {syncMeta && (
        <p className="text-xs text-muted-foreground italic px-1">
          Showing cached data as of {new Date(syncMeta.lastSuccessfulPullAt).toLocaleString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
          })}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4">
        {customers.map((c) => (
          <Card key={c.id} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h3 className="font-bold">{c.name}</h3>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground uppercase">
                    <span>{c.customerAccount || 'No Account'}</span>
                    <span>{c.phone || 'No Phone'}</span>
                    <span className="bg-muted px-1.5 rounded font-bold">{c.category}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate max-w-[250px]">{c.address || 'No Address'}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-muted-foreground uppercase">Balance</p>
                  <p className={`text-lg font-black ${Number(c.accountBalance) > 0 ? 'text-destructive' : 'text-primary'}`}>
                    {formatUGX(Math.abs(Number(c.accountBalance)))}
                    {Number(c.accountBalance) < 0 && " (CR)"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {customers.length === 0 && (
          <div className="py-12 text-center border-2 border-dashed rounded-xl bg-muted/30">
            <Search className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">
              {query ? 'No matching customers found in cache.' : 'Search assigned customers above.'}
            </p>
            {!syncMeta && (
              <p className="text-xs text-muted-foreground mt-2">
                Note: You may need to perform an initial sync while online.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
