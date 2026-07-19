import { requireUser } from "@/lib/session"
import { canUploadBilling } from "@/lib/permissions"
import { getBillingHistory } from "@/app/actions/billing"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatUGX } from "@/lib/format"
import Link from "next/link"
import { History } from "lucide-react"

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Billing History</h1>
        </div>
        <Link href="/dashboard/billing" className="text-sm text-muted-foreground hover:underline">
          ← Back to billing
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Billing Runs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
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
                {history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                      No billing history found.
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((run) => (
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
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
