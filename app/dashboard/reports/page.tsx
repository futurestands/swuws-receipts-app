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
    getTopDebtors(5),
  ])

  const { billing, collections } = stats

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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Billed</CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatUGX(billing.totalBilled)}</div>
            <p className="text-xs text-muted-foreground">{billing.billedCount} bills issued</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Collected</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatUGX(collections.totalCollected)}</div>
            <p className="text-xs text-muted-foreground">{collections.receiptCount} receipts issued</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatUGX(collections.outstanding)}</div>
            <p className="text-xs text-muted-foreground">Pending collection</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Collection Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercent(collections.collectionRate)}</div>
            <Progress value={collections.collectionRate} className="h-2 mt-2" />
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
                <span>Fully Paid</span>
                <span className="font-medium">{billing.paidCount}</span>
              </div>
              <Progress value={(billing.paidCount / billing.billedCount) * 100} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Partially Paid</span>
                <span className="font-medium">{billing.partialCount}</span>
              </div>
              <Progress value={(billing.partialCount / billing.billedCount) * 100} className="h-2 bg-secondary" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Unpaid / Pending</span>
                <span className="font-medium">{billing.unpaidCount}</span>
              </div>
              <Progress value={(billing.unpaidCount / billing.billedCount) * 100} className="h-2 bg-destructive/20" />
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
              {debtors.map((d) => (
                <div key={d.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <Link href={`/dashboard/customers/${d.id}`} className="text-sm font-medium hover:underline truncate block">
                      {d.name}
                    </Link>
                    <p className="text-xs text-muted-foreground truncate">{d.scheme}</p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm font-bold text-destructive">{formatUGX(d.outstanding)}</p>
                    <p className="text-[10px] text-muted-foreground">Billed: {formatUGX(d.totalBilled)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
