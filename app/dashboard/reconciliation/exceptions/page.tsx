import { getExceptions } from "@/app/actions/reconciliation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatUGX, formatDate, formatDateTime } from "@/lib/format"
import Link from "next/link"
import { AlertCircle, ArrowRight, ShieldAlert, Clock, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * RECONCILIATION EXCEPTION QUEUE (Phase 3B)
 *
 * Central workspace for Finance staff to track and resolve unmatched transactions.
 */
export default async function ExceptionQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; priority?: string }>
}) {
  const params = await searchParams
  const page = parseInt(params.page || "1")
  const status = params.status || "all"
  const priority = params.priority || "all"

  const { exceptions, total, totalPages } = await getExceptions({
    page,
    limit: 20,
    status,
    priority,
  })

  const PRIORITY_COLORS: Record<string, string> = {
    critical: "bg-red-100 text-red-700 border-red-200",
    high: "bg-orange-100 text-amber-700 border-orange-200",
    medium: "bg-blue-100 text-blue-700 border-blue-200",
    low: "bg-slate-100 text-slate-700 border-slate-200",
  }

  const STATUS_ICONS: Record<string, any> = {
    open: ShieldAlert,
    under_review: Clock,
    resolved: CheckCircle2,
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reconciliation Exceptions</h1>
          <p className="text-muted-foreground">
            Manage and resolve transactions that failed automated matching.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
             <div>
                <CardTitle>Exception Queue</CardTitle>
                <CardDescription>Found {total} transactions requiring manual investigation.</CardDescription>
             </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Reference/Number</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exceptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground italic">
                      All caught up! No exceptions pending review.
                    </TableCell>
                  </TableRow>
                ) : (
                  exceptions.map((ex) => {
                    const StatusIcon = STATUS_ICONS[ex.status]
                    return (
                      <TableRow key={ex.id}>
                        <TableCell>
                          <span className="text-xs font-medium capitalize">
                            {ex.exceptionType.replace(/_/g, ' ')}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 capitalize", PRIORITY_COLORS[ex.priority])}>
                            {ex.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {ex.receiptNumber || "EBS Record"}
                        </TableCell>
                        <TableCell className="text-xs truncate max-w-[150px]">
                          {ex.customerName}
                        </TableCell>
                        <TableCell className="text-right text-xs font-bold">
                          {formatUGX(ex.amount)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatDate(ex.businessDate)}
                        </TableCell>
                        <TableCell>
                           <div className="flex items-center gap-1.5">
                              {StatusIcon && <StatusIcon className="h-3 w-3 text-muted-foreground" />}
                              <span className="text-[10px] capitalize font-medium">{ex.status.replace(/_/g, ' ')}</span>
                           </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/dashboard/reconciliation/exceptions/${ex.id}`}>
                              Investigate <ArrowRight className="ml-1.5 h-3 w-3" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
             <div className="flex items-center justify-end space-x-2 pt-4">
                <Button variant="outline" size="sm" disabled={page === 1} asChild>
                   <Link href={`?page=${page - 1}`}>Previous</Link>
                </Button>
                <span className="text-xs text-muted-foreground px-2">Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page === totalPages} asChild>
                   <Link href={`?page=${page + 1}`}>Next</Link>
                </Button>
             </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
