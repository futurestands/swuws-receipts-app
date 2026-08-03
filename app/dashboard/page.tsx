import { getReceipts, getDailyTotals, listActiveBranches, listActivePaymentMethods } from "@/app/actions/receipts"
import { getSettings } from "@/app/actions/settings"
import { getCollectionPeriods, getAuthorizedSchemes, getCollectionSummary } from "@/app/actions/billing"
import { getCurrentUser } from "@/lib/session"
import { ReceiptForm } from "@/app/dashboard/receipt-form"
import { ReceiptsTable } from "@/app/dashboard/receipts-table"
import { formatUGX } from "@/lib/format"
import { CollectionSummaryCard } from "@/components/dashboard/collection-summary-card"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard, StatCardGrid } from "@/components/ui/stat-card"
import { Receipt, Wallet } from "lucide-react"

import { canViewAllData, canIssueReceipt } from "@/lib/permissions"

export default async function DashboardPage() {
  const current = await getCurrentUser()
  const canViewAll = current ? canViewAllData(current) : false
  const canIssue = current ? canIssueReceipt(current) : false

  // Wrap all fetchers in a promise-safe result pattern or defaults
  const [receipts, totals, settings, branches, methods, periods, schemes, collectionSummary] = await Promise.all([
    getReceipts(50).catch(() => []),
    getDailyTotals(),
    getSettings(),
    listActiveBranches().catch(() => []),
    listActivePaymentMethods().catch(() => []),
    getCollectionPeriods().catch(() => []),
    getAuthorizedSchemes().catch(() => []),
    getCollectionSummary().catch(() => null),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title={canViewAll ? "All receipts" : "My receipts"}
        description={`Welcome back, ${current?.name.split(" ")[0]}.`}
      />

      <CollectionSummaryCard summary={collectionSummary} />

      <StatCardGrid className="sm:grid-cols-2 xl:grid-cols-3">
        {/* Definition: Number of receipts printed today within this application only */}
        <StatCard icon={Receipt} label="Receipts Today" value={totals.count} brandColor="blue" />
        {/**
         * Definition: Total value of cash receipts printed today by Commercial Officers.
         * This represents operational value within this application only.
         * It is NOT the official collected amount confirmed by the External Billing System.
         */}
        <StatCard
          icon={Wallet}
          label="Unverified Cash (In-Hand)"
          value={formatUGX(collectionSummary?.cashInHand || 0)}
          brandColor="yellow"
        />
        {/**
         * Definition: Total value of payments confirmed by the External Billing System (Bank Report).
         * This is the source of truth for financial progress.
         */}
        <StatCard
          icon={Wallet}
          label="Official Bank Collections"
          value={formatUGX(collectionSummary?.totalCollected || 0)}
          brandColor="green"
        />
      </StatCardGrid>

      <div className="grid gap-6 lg:grid-cols-5">
        {canIssue && collectionSummary?.isActive ? (
          <>
            <div className="lg:col-span-2">
              <ReceiptForm
                editableFields={settings.editableFields}
                branches={branches}
                paymentMethods={methods}
                billingPeriods={periods}
                schemes={schemes as any}
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
