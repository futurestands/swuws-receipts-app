import { getExceptions } from "@/app/actions/reconciliation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatUGX, formatDate } from "@/lib/format"
import Link from "next/link"
import { ArrowRight, ShieldAlert, Clock, CheckCircle2, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/ui/page-header"
import { ScrollableTableContainer } from "@/components/ui/responsive-table"
import { EmptyState } from "@/components/ui/empty-state"
import { ResponsiveFilterBar } from "@/components/ui/filter-bar"

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

  const STATUS_ICONS: Record<string, LucideIcon> = {
    open: ShieldAlert,
    under_review: Clock,
    resolved: CheckCircle2,
  }

  function filterHref(next: { status?: string; priority?: string; page?: number }) {
    const p = new URLSearchParams()
    const nextStatus = next.status ?? status
    const nextPriority = next.priority ?? priority
    const nextPage = next.page ?? (next.status !== undefined || next.priority !== undefined ? 1 : page)
    if (nextStatus !== "all") p.set("status", nextStatus)
    if (nextPriority !== "all") p.set("priority", nextPriority)
    if (nextPage > 1) p.set("page", String(nextPage))
    return `?${p.toString()}`
  }

  const STATUS_OPTIONS = ["all", "open", "under_review", "resolved"]
  const PRIORITY_OPTIONS = ["all", "critical", "high", "medium", "low"]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reconciliation Exceptions"
        description="Manage and resolve transactions that failed automated matching."
      />

      <Card>
        <CardHeader>
          <CardTitle>Exception Queue</CardTitle>
          <CardDescription>Found {total} transactions requiring manual investigation.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ResponsiveFilterBar>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground mr-1">Status:</span>
              {STATUS_OPTIONS.map((s) => (
                <Link key={s} href={filterHref({ status: s })}>
                  <Badge
                    variant={status === s ? "default" : "outline"}
                    className="cursor-pointer capitalize"
                  >
                    {s.replace(/_/g, " ")}
                  </Badge>
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground mr-1">Priority:</span>
              {PRIORITY_OPTIONS.map((p) => (
                <Link key={p} href={filterHref({ priority: p })}>
                  <Badge
                    variant={priority === p ? "default" : "outline"}
                    className="cursor-pointer capitalize"
                  >
                    {p}
                  </Badge>
                </Link>
              ))}
            </div>
          </ResponsiveFilterBar>

          {exceptions.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="All caught up!"
              description="No exceptions pending review for the selected filters."
            />
          ) : (
            <ScrollableTableContainer>
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
                  {exceptions.map((ex) => {
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
                  })}
                </TableBody>
              </Table>
            </ScrollableTableContainer>
          )}

          {totalPages > 1 && (
             <div className="flex items-center justify-end space-x-2 pt-2">
                <Button variant="outline" size="sm" disabled={page === 1} asChild>
                   <Link href={filterHref({ page: page - 1 })} scroll={false}>Previous</Link>
                </Button>
                <span className="text-xs text-muted-foreground px-2">Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page === totalPages} asChild>
                   <Link href={filterHref({ page: page + 1 })} scroll={false}>Next</Link>
                </Button>
             </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
