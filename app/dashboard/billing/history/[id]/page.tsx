import { notFound } from "next/navigation"
import { getBillingRunDetails } from "@/app/actions/billing"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatUGX } from "@/lib/format"
import Link from "next/link"

export default async function BillingRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const details = await getBillingRunDetails(id)

  if (!details) notFound()

  const { run, records } = details

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Billing Run Details</h1>
        <Link href="/dashboard/billing/history" className="text-sm text-muted-foreground hover:underline">
          ← Back to history
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Scheme</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{run.schemeName}</div>
            <p className="text-xs text-muted-foreground">{run.periodName}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Uploaded</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{formatUGX(run.totalAmount)}</div>
            <p className="text-xs text-muted-foreground">{run.totalCustomers} customers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="capitalize text-sm px-3 py-0.5">
              {run.status}
            </Badge>
            <p className="text-xs text-muted-foreground mt-1">Uploaded by {run.uploadedByName}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customer Bills</CardTitle>
          <CardDescription>Individual bills created in this run.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Amount Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-medium">{record.customerName}</TableCell>
                  <TableCell className="text-sm font-mono">{record.accountNumber}</TableCell>
                  <TableCell>{formatUGX(record.totalDue)}</TableCell>
                  <TableCell>
                    <Badge variant={record.status === "paid" ? "default" : record.status === "partially_paid" ? "secondary" : "outline"}>
                      {record.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/dashboard/billing/records/${record.id}`}>
                        View Payments
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
