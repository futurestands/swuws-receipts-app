import { getFinancialOpsDashboard } from "@/app/actions/financial-stats"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Activity,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  FileUp,
  TrendingUp,
  Clock,
  Layers,
  ArrowUpRight
} from "lucide-react"
import { Progress } from "@/components/ui/progress"
import Link from "next/link"
import { PageHeader } from "@/components/ui/page-header"

export default async function FinancialOpsPage() {
  const data = await getFinancialOpsDashboard()
  const { summary, exceptions, imports, confidence, activePeriod, approvals } = data

  const pendingApprovals = approvals.find(a => a.stage === 'pending_review')
  const oldestPendingDate = pendingApprovals?.oldestPending

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Financial Operations"
        description="Reconciliation command center and operational oversight."
        actions={
          activePeriod && (
            <Badge variant="outline" className="text-sm px-3 py-1 bg-green-50 text-green-700 border-green-200">
              Active Period: {activePeriod.periodName}
            </Badge>
          )
        }
      />
      {/* Executive Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Reconciliation Rate</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.reconRate.toFixed(1)}%</div>
            <Progress value={summary.reconRate} className="h-1 mt-2" />
            <p className="text-[10px] text-muted-foreground mt-2">
              {summary.matchedReceipts.toLocaleString()} of {summary.totalReceipts.toLocaleString()} receipts matched
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Open Exceptions</CardTitle>
            <ShieldAlert className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{exceptions.open}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Requires manual investigation</p>
            <Link href="/dashboard/reconciliation/exceptions" className="text-[10px] text-primary hover:underline flex items-center gap-1 mt-2">
               Open Exception Queue <ArrowUpRight className="h-2 w-2" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Resolved Today</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{exceptions.resolvedToday}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Exceptions cleared successfully</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Pending Approval</CardTitle>
            <ShieldCheck className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingApprovals?.count || 0}</div>
            <p className="text-[10px] text-muted-foreground mt-1">
               {oldestPendingDate ? `Oldest: ${new Date(oldestPendingDate).toLocaleDateString()}` : "Batches awaiting sign-off"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Import Health</CardTitle>
            <FileUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{imports.total}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Total batches processed</p>
            {imports.failed > 0 && (
              <Badge variant="destructive" className="text-[8px] h-4 mt-2">{imports.failed} FAILED BATCHES</Badge>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Match Confidence Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" /> Matching Performance
            </CardTitle>
            <CardDescription>Breakdown of automated matching results by strategy.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             {confidence.map(c => (
               <div key={c.method} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                     <span className="capitalize">{c.method.replace(/_/g, ' ')}</span>
                     <span className="font-bold">{c.count.toLocaleString()} rows</span>
                  </div>
                  <Progress
                    value={(c.count / summary.matchedReceipts) * 100}
                    className="h-1.5"
                  />
               </div>
             ))}
             {confidence.length === 0 && (
                <div className="py-8 text-center text-muted-foreground text-sm italic">
                   No matched records found.
                </div>
             )}
          </CardContent>
        </Card>

        {/* Case Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
               <Layers className="h-4 w-4 text-muted-foreground" /> Exception Lifecycle
            </CardTitle>
            <CardDescription>Current status of all reconciliation cases.</CardDescription>
          </CardHeader>
          <CardContent>
             <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border bg-muted/20">
                   <p className="text-[10px] font-bold uppercase text-muted-foreground">Under Review</p>
                   <p className="text-xl font-bold">{exceptions.review}</p>
                </div>
                <div className="p-4 rounded-lg border bg-muted/20 text-orange-600">
                   <p className="text-[10px] font-bold uppercase text-muted-foreground">Escalated</p>
                   <p className="text-xl font-bold">{exceptions.escalated}</p>
                </div>
             </div>
             <div className="pt-6">
                <div className="flex items-center gap-2 text-xs text-muted-foreground italic">
                   <Clock className="h-3 w-3" />
                   <span>Avg. Import Processing: <span className="font-medium text-foreground">{imports.avgDuration ? `${(imports.avgDuration / 1000).toFixed(2)}s` : 'N/A'}</span></span>
                </div>
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
