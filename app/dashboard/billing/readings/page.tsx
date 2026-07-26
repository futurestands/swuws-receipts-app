import { requireUser } from "@/lib/session"
import { canIssueReceipt } from "@/lib/permissions"
import { db } from "@/lib/db"
import { billingPeriod } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { ReadingEntryForm } from "@/components/billing/reading-entry-form"
import { PageHeader } from "@/components/ui/page-header"
import { getRecentMeterReadings } from "@/app/actions/billing-engine"

export default async function MeterReadingsPage() {
  const user = await requireUser()
  // Reusing canIssueReceipt as it represents field agents/COs
  if (!canIssueReceipt(user)) throw new Error("Forbidden")

  // 1. Get the current active billing period
  const [activePeriod, recentReadings] = await Promise.all([
    db
      .select()
      .from(billingPeriod)
      .where(eq(billingPeriod.status, "active"))
      .limit(1)
      .then(rows => rows[0]),
    getRecentMeterReadings(20)
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        className="no-print"
        title="Field Meter Reading"
        description="Capture monthly consumption and calculate customer bills on-the-spot."
      />

      {activePeriod ? (
        <ReadingEntryForm
          activePeriod={activePeriod}
          initialHistory={recentReadings}
          currentUser={{ id: user.id, role: user.role }}
        />
      ) : (
        <div className="p-8 text-center border-2 border-dashed rounded-xl bg-muted/20">
          <p className="text-muted-foreground">There is no active billing period. Please contact an administrator.</p>
        </div>
      )}
    </div>
  )
}
