import { getBillingDiscrepancies } from "@/app/actions/billing-engine"
import { requireUser } from "@/lib/session"
import { canConfigureSystem } from "@/lib/permissions"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatUGX, formatDateTime } from "@/lib/format"
import { User, AlertCircle, CheckCircle2 } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { ScrollableTableContainer } from "@/components/ui/responsive-table"
import { EmptyState } from "@/components/ui/empty-state"
import { DiscrepancyResolutionCell } from "./discrepancy-resolution-cell"

export default async function BillingExceptionsPage() {
  const current = await requireUser()
  const discrepancies = await getBillingDiscrepancies()
  const canResolve = canConfigureSystem(current)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing Discrepancies"
        description="Review field-vs-import conflicts and payments that landed just after a period closed."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Active Conflicts
          </CardTitle>
          <CardDescription>
            Field-vs-import conflicts and payments dated just after a period closed. Late-payment flags are review-only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {discrepancies.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No discrepancies found"
              description="All billing data is currently synchronized."
            />
          ) : (
            <ScrollableTableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Existing Value</TableHead>
                    <TableHead>Conflict Value</TableHead>
                    <TableHead>Reported By</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {discrepancies.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <div className="font-bold">{d.customerName}</div>
                        <div className="text-[10px] text-muted-foreground uppercase">{d.customerAccount}</div>
                      </TableCell>
                      <TableCell className="text-xs">{d.periodName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-[10px]">
                          {d.sourceType.replaceAll('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {d.sourceType === 'bulk_import'
                          ? `${d.existingValue} (Rdg)`
                          : formatUGX(d.existingValue)}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-amber-600 font-bold">
                        {d.sourceType === 'bulk_import'
                          ? formatUGX(d.attemptedValue)
                          : d.sourceType === 'cross_period_payment'
                            ? `${d.attemptedValue}d after close`
                            : d.attemptedValue}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-[10px]">
                          <User className="h-3 w-3" /> {d.reportedByName}
                        </div>
                        <div className="text-[9px] text-muted-foreground">{formatDateTime(d.createdAt)}</div>
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] italic truncate" title={d.reason || ""}>
                        {d.reason}
                      </TableCell>
                      <TableCell className="text-right">
                        {d.status === 'open' && canResolve ? (
                          <DiscrepancyResolutionCell id={d.id} customerName={d.customerName} sourceType={d.sourceType} />
                        ) : (
                          <Badge variant="secondary" className="capitalize">{d.status}</Badge>
                        )}
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
