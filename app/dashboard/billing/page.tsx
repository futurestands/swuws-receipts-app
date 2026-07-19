import { requireUser } from "@/lib/session"
import {
  canUploadBilling,
  canManageCollectionPeriods,
  canActivateCollectionPeriod,
  canArchiveCollectionPeriod
} from "@/lib/permissions"
import { getCollectionSummary, getCollectionPeriods } from "@/app/actions/billing"
import { listActiveBranches } from "@/app/actions/receipts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Upload, FileText, History, AlertCircle, CheckCircle2, XCircle, Archive, Calendar } from "lucide-react"
import Link from "next/link"
import { formatUGX, formatDateTime } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CollectionPeriodWizard } from "@/components/collection/collection-period-wizard"
import { CollectionStatusBadge } from "@/components/collection/collection-status-badge"
import { CollectionLifecycleTimeline } from "@/components/collection/collection-lifecycle-timeline"
import { CollectionStatusActions } from "@/components/collection/collection-status-actions"
import { Progress } from "@/components/ui/progress"

export default async function CollectionManagementPage() {
  const current = await requireUser()
  if (!canUploadBilling(current)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h1 className="text-xl font-bold">Access Denied</h1>
        <p className="text-muted-foreground">You do not have permission to access the collection module.</p>
      </div>
    )
  }

  const summary = await getCollectionSummary()
  const allPeriods = await getCollectionPeriods()
  const canManage = canManageCollectionPeriods(current)

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing Period Management</h1>
          <p className="text-muted-foreground">
            Manage the lifecycle of monthly billing imports and collections.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/billing/history">
              <History className="mr-2 h-4 w-4" /> View History
            </Link>
          </Button>
          {canManage && <CollectionPeriodWizard />}
        </div>
      </div>

      {!summary ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
            <Calendar className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <h3 className="font-semibold text-lg">No Billing Period Found</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Create a billing period to start importing monthly billing from the external system.
              </p>
            </div>
            {canManage && <CollectionPeriodWizard />}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-3">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Current Period: {summary.displayPeriod.periodName}</CardTitle>
                  <CardDescription>
                    Overview of the current selected billing period.
                  </CardDescription>
                </div>
                <CollectionStatusBadge status={summary.displayPeriod.status} className="text-base px-3 py-1" />
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase">Billed</p>
                  <p className="text-lg font-bold">{formatUGX(summary.totalBilled)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase">Collected</p>
                  <p className="text-lg font-bold text-primary">{formatUGX(summary.totalCollected)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase">Customers</p>
                  <p className="text-lg font-bold">{summary.customersImported.toLocaleString()}</p>
                </div>
                <div className="space-y-1 text-right">
                  <p className="text-xs text-muted-foreground font-medium uppercase">Progress</p>
                  <p className="text-lg font-bold text-primary">{summary.progress.toFixed(1)}%</p>
                </div>
              </div>

              <Progress value={summary.progress} className="h-2" />

              <div className="flex flex-wrap gap-2 pt-4">
                {(summary.displayPeriod.status === 'active' || summary.displayPeriod.status === 'draft') && (
                  <Button asChild>
                    <Link href="/dashboard/billing/upload">
                      <Upload className="mr-2 h-4 w-4" /> Import Monthly Billing
                    </Link>
                  </Button>
                )}

                <CollectionStatusActions
                  periodId={summary.displayPeriod.id}
                  currentStatus={summary.displayPeriod.status}
                  canActivate={canActivateCollectionPeriod(current)}
                  canArchive={canArchiveCollectionPeriod(current)}
                />

                <Button variant="outline" asChild>
                   <Link href="/dashboard/billing/records">
                     <FileText className="mr-2 h-4 w-4" /> View Records
                   </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>
      )}

      {summary && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Imports</CardTitle>
            <CardDescription>
              Billing data imported from the external system.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scheme</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customers</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.recentUploads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                      No billing imports found for this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  summary.recentUploads.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="font-medium">
                        {run.schemeName}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(run.uploadedAt)}
                      </TableCell>
                      <TableCell>{run.totalCustomers}</TableCell>
                      <TableCell>{formatUGX(run.totalAmount)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {run.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
