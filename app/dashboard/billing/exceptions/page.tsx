import { getBillingDiscrepancies } from "@/app/actions/billing-engine"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatUGX, formatDateTime } from "@/lib/format"
import { User, AlertCircle, CheckCircle2 } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { ScrollableTableContainer } from "@/components/ui/responsive-table"
import { EmptyState } from "@/components/ui/empty-state"

export default async function BillingExceptionsPage() {
  const discrepancies = await getBillingDiscrepancies()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing Discrepancies"
        description="Review and resolve conflicts between manual field readings and monthly imports."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Active Conflicts
          </CardTitle>
          <CardDescription>
            These records represent instances where field agents and bulk imports disagree on a customer&apos;s billing data.
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
                          {d.sourceType.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {d.sourceType === 'bulk_import' ? `${d.existingValue} (Rdg)` : formatUGX(d.existingValue)}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-amber-600 font-bold">
                        {d.sourceType === 'bulk_import' ? formatUGX(d.attemptedValue) : d.attemptedValue}
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
                        <Button variant="outline" size="sm" className="h-8">
                          Investigate
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
