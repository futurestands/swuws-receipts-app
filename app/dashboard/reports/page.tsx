import { requireUser } from "@/lib/session"
import Link from "next/link"
import { canViewReports } from "@/lib/permissions"
import { getDashboardStats, getCollectionTrends, getTopDebtors } from "@/app/actions/reports"
import { getCollectionPeriods, getAuthorizedSchemes } from "@/app/actions/billing"
import { listActiveBranches } from "@/app/actions/receipts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { formatUGX, formatPercent } from "@/lib/format"
import { AlertCircle, TrendingUp, Users, FileText, Landmark } from "lucide-react"
import { ReportFilters } from "./report-filters"
import { Progress } from "@/components/ui/progress"

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    periodId?: string
    clusterId?: string
    branchId?: string
    schemeId?: string
  }>
}) {
  const current = await requireUser()
  if (!canViewReports(current)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h1 className="text-xl font-bold">Access Denied</h1>
        <p className="text-muted-foreground">You do not have permission to view reports.</p>
      </div>
    )
  }

  const params = await searchParams
  const [stats, periods, branches, schemes, debtors] = await Promise.all([
    getDashboardStats(params),
    getCollectionPeriods(),
    listActiveBranches(),
    getAuthorizedSchemes(),
    getTopDebtors(10),
  ])

  const { billing, collections, arrears } = stats

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Performance Dashboard</h1>
        <p className="text-muted-foreground">
          Monitor collections and billing performance across the organization.
        </p>
      </div>

      <ReportFilters
        periods={periods}
        branches={branches}
        schemes={schemes}
        initialFilters={params}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="card-accent-red">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total System Arrears</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-destructive">{formatUGX(arrears.totalArrears)}</div>
            <p className="text-xs text-muted-foreground mt-1">Cumulative debt from day one</p>
          </CardContent>
        </Card>

        <Card className="card-accent-green">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Arrears Collected</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-green-600">{formatUGX(collections.verifiedArrears)}</div>
            <p className="text-xs text-muted-foreground mt-1">Bank Confirmed (Against past debts)</p>
          </CardContent>
        </Card>

        <Card className="card-accent-blue">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Upfront / Advance</CardTitle>
            <Landmark className="h-4 w-4 text-brand-blue" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-brand-blue">{formatUGX(arrears.totalUpfront)}</div>
            <p className="text-xs text-muted-foreground mt-1">Surplus money paid in advance</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Billed</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatUGX(billing.totalBilled)}</div>
            <p className="text-xs text-muted-foreground">{billing.billedCount} bills (Selected Period)</p>
          </CardContent>
        </Card>
        <Card className="border-green-100 bg-green-50/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-700">Bank Verified (Total)</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatUGX(collections.verifiedTotal)}</div>
            <p className="text-xs text-green-700/70">Confirmed via EBS Import</p>
          </CardContent>
        </Card>
        <Card className="border-amber-100 bg-amber-50/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-amber-700">Operational Cash (Receipts)</CardTitle>
            <FileText className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{formatUGX(collections.operationalCash)}</div>
            <p className="text-xs text-amber-700/70">{collections.operationalCount} receipts printed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Global Collection Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercent(collections.collectionRate)}</div>
            <Progress value={collections.collectionRate} className="h-2 mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Collection Breakdown Row */}
      <div className="grid gap-4 md:grid-cols-2">
         <Card className="border-green-100">
           <CardHeader className="pb-2">
             <CardTitle className="text-sm font-bold text-green-800">Arrears Recovery Performance</CardTitle>
             <CardDescription>Efficiency in collecting old debt (Historical Arrears).</CardDescription>
           </CardHeader>
           <CardContent className="space-y-4">
             <div className="flex justify-between items-end">
               <div>
                 <p className="text-xs text-muted-foreground uppercase">Arrears Billed</p>
                 <p className="text-xl font-bold">{formatUGX(billing.arrearsBilled)}</p>
               </div>
               <div className="text-right">
                 <p className="text-xs text-muted-foreground uppercase text-green-600">Arrears Collected</p>
                 <p className="text-xl font-black text-green-600">{formatUGX(collections.verifiedArrears)}</p>
               </div>
             </div>
             <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Recovery Rate</span>
                  <span className="font-black text-green-600">{formatPercent(collections.arrearsRate)}</span>
                </div>
                <Progress value={collections.arrearsRate} className="h-3 bg-green-50" />
             </div>
           </CardContent>
         </Card>

         <Card className="border-blue-100">
           <CardHeader className="pb-2">
             <CardTitle className="text-sm font-bold text-blue-800">Current Month Performance</CardTitle>
             <CardDescription>Efficiency in collecting this month's generated revenue.</CardDescription>
           </CardHeader>
           <CardContent className="space-y-4">
             <div className="flex justify-between items-end">
               <div>
                 <p className="text-xs text-muted-foreground uppercase">Current Billed</p>
                 <p className="text-xl font-bold">{formatUGX(billing.currentBilled)}</p>
               </div>
               <div className="text-right">
                 <p className="text-xs text-muted-foreground uppercase text-blue-600">Current Collected</p>
                 <p className="text-xl font-black text-blue-600">{formatUGX(collections.verifiedMonthly)}</p>
               </div>
             </div>
             <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Collection Rate</span>
                  <span className="font-black text-blue-600">{formatPercent(collections.currentRate)}</span>
                </div>
                <Progress value={collections.currentRate} className="h-3 bg-blue-50" />
             </div>
           </CardContent>
         </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Billing Status Breakdown</CardTitle>
            <CardDescription>Distribution of bill payment states for the selected filters.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-green-600">Bank Verified</span>
                <span className="font-medium">{billing.paidCount}</span>
              </div>
              <Progress value={(billing.paidCount / (billing.billedCount || 1)) * 100} className="h-2 bg-green-100" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-amber-600">Pending Bank Confirmation</span>
                <span className="font-medium">{billing.confirmedCount}</span>
              </div>
              <Progress value={(billing.confirmedCount / (billing.billedCount || 1)) * 100} className="h-2 bg-amber-100" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Partially Paid</span>
                <span className="font-medium">{billing.partialCount}</span>
              </div>
              <Progress value={(billing.partialCount / (billing.billedCount || 1)) * 100} className="h-2 bg-secondary" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Unpaid / Pending</span>
                <span className="font-medium">{billing.unpaidCount}</span>
              </div>
              <Progress value={(billing.unpaidCount / (billing.billedCount || 1)) * 100} className="h-2 bg-destructive/10" />
            </div>
          </CardContent>
        </Card>

        {/* Top Debtors Card */}
        <Card>
          <CardHeader>
            <CardTitle>Top Debtors</CardTitle>
            <CardDescription>Customers with highest outstanding balances.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {debtors.length > 0 ? debtors.map((d) => (
                <div key={d.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <Link href={`/dashboard/customers/${d.id}`} className="text-sm font-medium hover:underline truncate block">
                      {d.name}
                    </Link>
                    <p className="text-[10px] text-muted-foreground truncate uppercase">{d.scheme} · {d.account}</p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm font-bold text-destructive">{formatUGX(d.outstanding)}</p>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground text-center py-4">No outstanding debtors found.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
