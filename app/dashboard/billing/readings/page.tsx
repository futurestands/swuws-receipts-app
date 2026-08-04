import { requireUser } from "@/lib/session"
import { canIssueReceipt } from "@/lib/permissions"
import { db } from "@/lib/db"
import { billingPeriod } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { ReadingEntryForm } from "@/components/billing/reading-entry-form"
import { InvoicingPanel } from "@/components/billing/invoicing-panel"
import { PageHeader } from "@/components/ui/page-header"
import { getRecentMeterReadings } from "@/app/actions/billing-engine"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
        title="Field Collections Hub"
        description="Capture meter readings or re-issue invoices to customers."
      />

      <Tabs defaultValue="capture" className="no-print">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="capture">Capture Reading</TabsTrigger>
          <TabsTrigger value="invoice">Re-issue Invoice</TabsTrigger>
        </TabsList>

        <TabsContent value="capture" className="mt-6">
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
        </TabsContent>

        <TabsContent value="invoice" className="mt-6">
           <InvoicingPanel />
        </TabsContent>
      </Tabs>

      {/* Ensuring print only shows the invoice content when on that tab */}
      <div className="hidden print:block">
         <InvoicingPanel />
      </div>
    </div>
  )
}
