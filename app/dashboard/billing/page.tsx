import { requireUser } from "@/lib/session"
import {
  canUploadBilling,
  canManageCollectionPeriods,
  canActivateCollectionPeriod,
  canArchiveCollectionPeriod
} from "@/lib/permissions"
import { getCollectionSummary } from "@/app/actions/billing"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Upload, FileText, Activity, AlertCircle, Calendar, Wallet, Users, TrendingUp, HandCoins } from "lucide-react"
import Link from "next/link"
import { formatUGX, formatDateTime } from "@/lib/format"
import { CollectionPeriodWizard } from "@/components/collection/collection-period-wizard"
import { CollectionStatusBadge } from "@/components/collection/collection-status-badge"
import { CollectionStatusActions } from "@/components/collection/collection-status-actions"
import { RecentImportsTable } from "@/components/collection/recent-imports-table"
import { Progress } from "@/components/ui/progress"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard, StatCardGrid } from "@/components/ui/stat-card"
import { EmptyState } from "@/components/ui/empty-state"
import { DynamicIcon } from "@/components/layout/icons"

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
  const canManage = canManageCollectionPeriods(current)

  return (
    <div className="space-y-8">
      <PageHeader
        title="Billing Period Management"
        description="Manage the lifecycle of monthly billing imports and collections."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/dashboard/billing/history">
                <DynamicIcon name="History" className="mr-2 h-4 w-4" /> View History
              </Link>
            </Button>
            {canManage && <CollectionPeriodWizard />}
          </>
        }
      />

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
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-medium">Collection Progress</span>
                <span className="font-bold">{summary.progress.toFixed(1)}%</span>
              </div>
              <Progress value={summary.progress} className="h-2" />

              <StatCardGrid className="sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  icon={FileText}
                  label="BILLED (CURRENT)"
                  value={formatUGX(summary.totalBilled)}
                  description="New charges for this period"
                />
                <StatCard
                  icon={HandCoins}
                  label="COLLECTED"
                  value={formatUGX(summary.totalCollected)}
                  brandColor="blue"
                  description="Payments applied to current bill"
                />
                <StatCard
                  icon={AlertCircle}
                  label="OUTSTANDING"
                  value={formatUGX(summary.outstanding)}
                  brandColor="red"
                  description="Unpaid current charges"
                />
                <StatCard
                  icon={Activity}
                  label="RECEIPTS PRINTED"
                  value={summary.receiptsToday.toLocaleString()}
                />
              </StatCardGrid>

              <div className="pt-4">
                <h4 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Financial Snapshot</h4>
                <StatCardGrid className="sm:grid-cols-3">
                  <StatCard
                    icon={Wallet}
                    label="TOTAL SYSTEM ARREARS"
                    value={formatUGX(summary.totalSystemArrears)}
                    brandColor="yellow"
                    description="Total debt excluding current bills"
                  />
                  <StatCard
                    icon={TrendingUp}
                    label="UPFRONT CREDITS"
                    value={formatUGX(summary.totalUpfront)}
                    brandColor="green"
                    description="Total customer overpayments"
                  />
                  <StatCard
                    icon={HandCoins}
                    label="CASH IN HAND"
                    value={formatUGX(summary.cashInHand)}
                    description="Receipts not yet banked"
                  />
                </StatCardGrid>
              </div>

              <div className="flex flex-wrap gap-2 pt-6">
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
            {summary.recentUploads.length === 0 ? (
              <EmptyState
                icon={Upload}
                title="No billing imports found"
                description="Billing data imported for this period will appear here."
              />
            ) : (
              <RecentImportsTable uploads={summary.recentUploads} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
