import { notFound } from "next/navigation"
import { getBillPaymentHistory } from "@/app/actions/reports"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatUGX, formatDate, formatDateTime } from "@/lib/format"
import Link from "next/link"

export default async function BillingRecordDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getBillPaymentHistory(id)

  if (!data) notFound()

  const { bill, payments, totalPaid } = data

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Bill Payment History</h1>
        <Link href={`/dashboard/billing/history/${bill.billingRunId}`} className="text-sm text-muted-foreground hover:underline">
          ← Back to billing run
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Bill Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Account Number</span>
              <span className="font-mono">{bill.accountNumber}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Due Date</span>
              <span>{formatDate(bill.dueDate)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Billed</span>
              <span className="font-semibold">{formatUGX(bill.totalDue)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="outline" className="capitalize">{bill.status}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Paid</span>
              <span className="font-semibold text-primary">{formatUGX(totalPaid)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Remaining Balance</span>
              <span className="font-bold text-destructive">{formatUGX(Math.max(0, bill.totalDue - totalPaid))}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Payment Count</span>
              <span>{payments.length} receipts</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Receipts</CardTitle>
          <CardDescription>All payments applied to this specific bill.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Collector</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                    No payments found for this bill.
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/dashboard/receipts/${p.id}`} className="font-medium text-primary hover:underline">
                        {p.receiptNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{formatDateTime(p.paymentDate)}</TableCell>
                    <TableCell className="text-sm capitalize">{p.paymentMethod}</TableCell>
                    <TableCell className="text-sm">{p.agentName}</TableCell>
                    <TableCell className="text-right font-semibold">{formatUGX(p.amount)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
