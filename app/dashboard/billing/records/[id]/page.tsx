import { notFound } from "next/navigation"
import { getBillPaymentHistory } from "@/app/actions/reports"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatUGX, formatDate, formatDateTime } from "@/lib/format"
import Link from "next/link"
import { ArrowLeft, Receipt } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { ScrollableTableContainer } from "@/components/ui/responsive-table"
import { EmptyState } from "@/components/ui/empty-state"

export default async function BillingRecordDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getBillPaymentHistory(id)

  if (!data) notFound()

  const { bill, payments, totalPaid } = data

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bill Payment History"
        actions={
          <Link
            href={`/dashboard/billing/history/${bill.billingRunId}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            <ArrowLeft className="size-4" /> Back to billing run
          </Link>
        }
      />

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
              <span className="font-semibold">{formatUGX(Number(bill.totalDue))}</span>
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
              <span className="font-bold text-destructive">{formatUGX(Math.max(0, Number(bill.totalDue) - totalPaid))}</span>
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
          {payments.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No payments found"
              description="Receipts applied to this bill will appear here."
            />
          ) : (
            <ScrollableTableContainer className="border-0">
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
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link href={`/dashboard/receipts/${p.id}`} className="font-medium text-primary hover:underline">
                          {p.receiptNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{formatDateTime(p.paymentDate)}</TableCell>
                      <TableCell className="text-sm capitalize">{p.paymentMethod}</TableCell>
                      <TableCell className="text-sm">{p.agentName}</TableCell>
                      <TableCell className="text-right font-semibold">{formatUGX(Number(p.amount))}</TableCell>
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
