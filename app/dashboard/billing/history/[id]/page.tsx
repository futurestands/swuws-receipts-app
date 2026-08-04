import { notFound } from "next/navigation"
import { getBillingRunDetails } from "@/app/actions/billing"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatUGX } from "@/lib/format"
import Link from "next/link"
import { ArrowLeft, Users, Wallet, CircleCheck, FileText } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard, StatCardGrid } from "@/components/ui/stat-card"
import { ScrollableTableContainer } from "@/components/ui/responsive-table"
import { EmptyState } from "@/components/ui/empty-state"

export default async function BillingRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const details = await getBillingRunDetails(id)

  if (!details) notFound()

  const { run, records } = details

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing Run Details"
        actions={
          <Link
            href="/dashboard/billing/history"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            <ArrowLeft className="size-4" /> Back to history
          </Link>
        }
      />

      <StatCardGrid className="sm:grid-cols-3">
        <StatCard icon={Users} label="Scheme" value={run.schemeName} description={run.periodName} />
        <StatCard icon={Wallet} label="Total Uploaded" value={formatUGX(run.totalAmount)} description={`${run.totalCustomers} customers`} />
        <StatCard
          icon={CircleCheck}
          label="Status"
          value={<span className="capitalize">{run.status}</span>}
          description={`Uploaded by ${run.uploadedByName}`}
        />
      </StatCardGrid>

      <Card>
        <CardHeader>
          <CardTitle>Customer Bills</CardTitle>
          <CardDescription>Individual bills created in this run.</CardDescription>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No bills in this run"
              description="Customer bills created by this upload will appear here."
            />
          ) : (
            <ScrollableTableContainer className="border-0">
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
                      <TableCell>{formatUGX(Number(record.totalDue))}</TableCell>
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
            </ScrollableTableContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
