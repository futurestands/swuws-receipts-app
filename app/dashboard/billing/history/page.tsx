import { requireUser } from "@/lib/session"
import { canUploadBilling } from "@/lib/permissions"
import { getBillingHistory } from "@/app/actions/billing"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatUGX } from "@/lib/format"
import Link from "next/link"
import { ArrowLeft, History } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { ScrollableTableContainer } from "@/components/ui/responsive-table"
import { EmptyState } from "@/components/ui/empty-state"

/**
 * BILLING HISTORY PAGE
 * Displays a list of all billing runs uploaded to the system.
 */
export default async function BillingHistoryPage() {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")

  let history: Awaited<ReturnType<typeof getBillingHistory>> = []
  try {
    history = await getBillingHistory()
  } catch (e) {
    console.error("BillingHistoryPage: Failed to load history", e)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing History"
        actions={
          <Link
            href="/dashboard/billing"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            <ArrowLeft className="size-4" /> Back to billing
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>All Billing Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <EmptyState
              icon={History}
              title="No billing history found"
              description="Billing runs you upload will appear here."
            />
          ) : (
            <ScrollableTableContainer className="border-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Scheme</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customers</TableHead>
                    <TableHead>Total Amount</TableHead>
                    <TableHead>Uploaded By</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="font-medium">
                        <Link href={`/dashboard/billing/history/${run.id}`} className="hover:underline text-primary">
                          {run.periodName}
                        </Link>
                      </TableCell>
                      <TableCell>{run.schemeName}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {new Date(run.uploadedAt).toLocaleString()}
                      </TableCell>
                      <TableCell>{run.totalCustomers}</TableCell>
                      <TableCell>{formatUGX(run.totalAmount)}</TableCell>
                      <TableCell className="text-sm">{run.uploadedByName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {run.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollableTableContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
