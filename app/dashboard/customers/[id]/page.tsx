import { notFound } from "next/navigation"
import Link from "next/link"
import { listActiveWaterSchemesForPicker } from "@/app/actions/customers"
import { getCustomerStatement } from "@/app/actions/reports"
import { EditCustomerForm } from "@/app/dashboard/customers/[id]/edit-customer-form"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatUGX, formatDateTime, formatDate } from "@/lib/format"
import { ArrowUpRight, ArrowDownLeft } from "lucide-react"

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [statement, schemes] = await Promise.all([
    getCustomerStatement(id),
    listActiveWaterSchemesForPicker(),
  ])

  const { customer, bills, receipts, ledger, summary } = statement

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/customers" className="text-sm text-muted-foreground hover:underline">
          ← Back to customers
        </Link>
        <div className="flex gap-4">
          <Card className="px-4 py-2 bg-primary/5 border-primary/20">
            <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none mb-1">Account Balance</p>
            <p className="text-lg font-mono font-bold text-primary leading-none">
              {formatUGX(customer.accountBalance || 0)}
            </p>
          </Card>
          {bills[0] && (
            <Card className="px-4 py-2 bg-destructive/5 border-destructive/20">
               <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none mb-1">
                 {bills[0].periodName} {bills[0].periodStatus === 'active' ? 'Collection' : ''}
               </p>
               <Badge variant={bills[0].status === "paid" ? "default" : bills[0].status === "partially_paid" ? "secondary" : "destructive"} className="h-5">
                 {bills[0].status.replace("_", " ")}
               </Badge>
            </Card>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <EditCustomerForm key={customer.id} customer={customer} schemes={schemes} />
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total billed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold">{formatUGX(summary.totalBilled)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total paid
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold">{formatUGX(summary.totalPaid)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Outstanding
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-xl font-bold ${summary.currentBalance > 0 ? 'text-destructive' : 'text-primary'}`}>
                  {formatUGX(summary.currentBalance)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="ledger">
            <TabsList>
              <TabsTrigger value="ledger">Chronological Ledger</TabsTrigger>
              <TabsTrigger value="history">History Tables</TabsTrigger>
            </TabsList>

            <TabsContent value="ledger" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Customer Ledger</CardTitle>
                  <CardDescription>A chronological record of all bills and payments.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledger.map((entry, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm">{formatDate(entry.date)}</TableCell>
                          <TableCell>
                            {entry.type === "bill" ? (
                              <div className="flex items-center text-destructive">
                                <ArrowUpRight className="mr-1 h-3 w-3" /> Bill
                              </div>
                            ) : (
                              <div className="flex items-center text-primary">
                                <ArrowDownLeft className="mr-1 h-3 w-3" /> Payment
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm font-medium">
                            {entry.type === "payment" ? (
                              <Link href={`/dashboard/receipts/${entry.referenceId}`} className="hover:underline">
                                {entry.description}
                              </Link>
                            ) : (
                              entry.description
                            )}
                          </TableCell>
                          <TableCell className={`text-right ${entry.type === "payment" ? "text-primary font-medium" : ""}`}>
                            {entry.type === "payment" ? "+" : ""}{formatUGX(entry.amount)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold">
                            {formatUGX(entry.balance)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Billing history</CardTitle>
                </CardHeader>
                <CardContent>
                  {bills.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No billing history found.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Period</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bills.map((b) => (
                          <TableRow key={b.id}>
                            <TableCell className="font-medium">{b.periodName}</TableCell>
                            <TableCell>{formatUGX(b.totalDue)}</TableCell>
                            <TableCell className="text-sm">{formatDate(b.dueDate)}</TableCell>
                            <TableCell>
                              <Badge variant={b.status === "paid" ? "default" : b.status === "partially_paid" ? "secondary" : "outline"}>
                                {b.status.replace("_", " ")}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Payment history</CardTitle>
                </CardHeader>
                <CardContent>
                  {receipts.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No payment history found.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Receipt #</TableHead>
                          <TableHead>Period</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Collector</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {receipts.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>
                              <Link
                                href={`/dashboard/receipts/${r.id}`}
                                className="font-medium text-primary hover:underline"
                              >
                                {r.receiptNumber}
                              </Link>
                            </TableCell>
                            <TableCell className="text-xs">{r.billingPeriod || "—"}</TableCell>
                            <TableCell>{formatUGX(r.amount)}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {formatDate(r.paymentDate)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.agentName}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
