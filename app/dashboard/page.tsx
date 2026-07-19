import { getReceipts, getDailyTotals, listActiveBranches, listActivePaymentMethods } from "@/app/actions/receipts"
import { getSettings } from "@/app/actions/settings"
import { getCollectionPeriods, getAuthorizedSchemes, getCollectionSummary } from "@/app/actions/billing"
import { getCurrentUser } from "@/lib/session"
import { ReceiptForm } from "@/app/dashboard/receipt-form"
import { ReceiptsTable } from "@/app/dashboard/receipts-table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatUGX } from "@/lib/format"
import { CollectionSummaryCard } from "@/components/dashboard/collection-summary-card"

import { canViewAllData, canIssueReceipt } from "@/lib/permissions"

export default async function DashboardPage() {
  const current = await getCurrentUser()
  const canViewAll = current ? canViewAllData(current) : false
  const canIssue = current ? canIssueReceipt(current) : false
  const [receipts, totals, settings, branches, methods, periods, schemes, collectionSummary] = await Promise.all([
    getReceipts(50),
    getDailyTotals(),
    getSettings(),
    listActiveBranches(),
    listActivePaymentMethods(),
    getCollectionPeriods(),
    getAuthorizedSchemes(),
    getCollectionSummary(),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            {canViewAll ? "All receipts" : "My receipts"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Welcome back, {current?.name.split(" ")[0]}.
          </p>
        </div>
      </div>

      <CollectionSummaryCard summary={collectionSummary} />

      <div className="grid gap-4 sm:grid-cols-2">
        {/* ... stats ... */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Today&apos;s receipts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Definition: Number of receipts printed today within this application only */}
            <p className="text-2xl font-semibold">{totals.count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Today&apos;s Cash Receipts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/**
             * Definition: Total value of cash receipts printed today by Commercial Officers.
             * This represents operational value within this application only.
             * It is NOT the official collected amount confirmed by the External Billing System.
             */}
            <p className="text-2xl font-semibold">{formatUGX(totals.total)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {canIssue && collectionSummary?.isActive ? (
          <>
            <div className="lg:col-span-2">
              <ReceiptForm
                editableFields={settings.editableFields}
                branches={branches}
                paymentMethods={methods}
                billingPeriods={periods}
                schemes={schemes}
                activePeriodId={collectionSummary.displayPeriod.id}
              />
            </div>
            <div className="lg:col-span-3">
              <ReceiptsTable receipts={receipts} isAdmin={canViewAll} />
            </div>
          </>
        ) : (
          <div className="lg:col-span-5">
            <ReceiptsTable receipts={receipts} isAdmin={canViewAll} />
          </div>
        )}
      </div>
    </div>
  )
}
