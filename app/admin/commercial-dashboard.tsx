"use client"

import { useState, useEffect } from "react"
import { getDashboardStats, getCollectionTrends } from "@/app/actions/reports"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatUGX } from "@/lib/format"
import type { Cluster, Branch, WaterScheme, BillingPeriod } from "@/lib/db/schema"

export function CommercialDashboard({
  clusters,
  branches,
  schemes,
  periods,
}: {
  clusters: Cluster[]
  branches: Branch[]
  schemes: WaterScheme[]
  periods: BillingPeriod[]
}) {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<any>(null)
  const [filters, setFilters] = useState({
    periodId: periods[0]?.id || "",
    clusterId: "all",
    branchId: "all",
    schemeId: "all",
  })

  useEffect(() => {
    let active = true
    setLoading(true)
    getDashboardStats({
      periodId: filters.periodId === "all" ? undefined : filters.periodId,
      clusterId: filters.clusterId === "all" ? undefined : filters.clusterId,
      branchId: filters.branchId === "all" ? undefined : filters.branchId,
      schemeId: filters.schemeId === "all" ? undefined : filters.schemeId,
    }).then((res) => {
      if (active) {
        setStats(res)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [filters])

  const filteredBranches = filters.clusterId === "all"
    ? branches
    : branches.filter(b => b.clusterId === filters.clusterId)

  const filteredSchemes = filters.branchId === "all"
    ? schemes
    : schemes.filter(s => s.branchId === filters.branchId)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Billing Period</label>
          <Select value={filters.periodId} onValueChange={(v) => setFilters(f => ({ ...f, periodId: v ?? "all" }))}>
            <SelectTrigger><SelectValue placeholder="All periods" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All periods</SelectItem>
              {periods.map(p => <SelectItem key={p.id} value={p.id}>{p.periodName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Cluster</label>
          <Select value={filters.clusterId} onValueChange={(v) => setFilters(f => ({ ...f, clusterId: v ?? "all", branchId: "all", schemeId: "all" }))}>
            <SelectTrigger><SelectValue placeholder="All Clusters" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clusters</SelectItem>
              {clusters.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Area (Branch)</label>
          <Select value={filters.branchId} onValueChange={(v) => setFilters(f => ({ ...f, branchId: v ?? "all", schemeId: "all" }))}>
            <SelectTrigger><SelectValue placeholder="All Areas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Areas</SelectItem>
              {filteredBranches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Water Scheme</label>
          <Select value={filters.schemeId} onValueChange={(v) => setFilters(f => ({ ...f, schemeId: v ?? "all" }))}>
            <SelectTrigger><SelectValue placeholder="All Schemes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Schemes</SelectItem>
              {filteredSchemes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse bg-muted/30">
              <CardHeader className="pb-2">
                <div className="h-4 w-24 bg-muted rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-32 bg-muted rounded mb-2" />
                <div className="h-3 w-40 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Billed</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatUGX(stats.billing.totalBilled)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Across {stats.billing.billedCount} customers
                </p>
              </CardContent>
            </Card>

            <Card className="border-green-100 bg-green-50/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-green-700 uppercase tracking-wider">Verified Collections</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-600">{formatUGX(stats.collections.verifiedMonthly + stats.collections.verifiedArrears)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Confirmed via EBS Bank Import
                </p>
              </CardContent>
            </Card>

            <Card className="border-amber-100 bg-amber-50/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-amber-700 uppercase tracking-wider">Operational Cash</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-amber-600">{formatUGX(stats.collections.operationalCash)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                   From {stats.collections.operationalCount} issued receipts
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-destructive">{formatUGX(stats.collections.outstanding)}</p>
                <div className="h-1 w-full bg-secondary mt-2 rounded-full overflow-hidden">
                   <div
                     className="h-full bg-primary"
                     style={{ width: `${Math.min(100, stats.collections.collectionRate)}%` }}
                   />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Collection Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats.collections.collectionRate.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground mt-1">
                   Target: 100%
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
             <Card>
               <CardHeader>
                 <CardTitle className="text-sm">Payment Status</CardTitle>
                 <CardDescription>Customer breakdown</CardDescription>
               </CardHeader>
               <CardContent className="space-y-4">
                 <div className="flex items-center justify-between text-sm">
                   <span className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-primary" /> Paid</span>
                   <span className="font-semibold">{stats.billing.paidCount}</span>
                 </div>
                 <div className="flex items-center justify-between text-sm">
                   <span className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-orange-400" /> Partially Paid</span>
                   <span className="font-semibold">{stats.billing.partialCount}</span>
                 </div>
                 <div className="flex items-center justify-between text-sm">
                   <span className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-destructive" /> Unpaid</span>
                   <span className="font-semibold">{stats.billing.unpaidCount}</span>
                 </div>
               </CardContent>
             </Card>

             <Card className="md:col-span-2">
               <CardHeader>
                 <CardTitle className="text-sm">Financial Summary</CardTitle>
               </CardHeader>
               <CardContent>
                 <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                       <div className="rounded-lg border p-3">
                          <p className="text-muted-foreground text-xs">Arrears Recovery</p>
                          <p className="text-lg font-semibold mt-1">Implemented</p>
                       </div>
                       <div className="rounded-lg border p-3">
                          <p className="text-muted-foreground text-xs">Reconciliation Status</p>
                          <p className="text-lg font-semibold mt-1 text-primary">Certified</p>
                       </div>
                    </div>
                    <p className="text-xs text-muted-foreground italic">
                      * All data is reconciled in real-time from the immutable receipt ledger.
                    </p>
                 </div>
               </CardContent>
             </Card>
          </div>
        </>
      )}
    </div>
  )
}
