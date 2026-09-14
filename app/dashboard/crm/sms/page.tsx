import { requireUser } from "@/lib/session"
import { canViewCrm } from "@/lib/permissions"
import { listSmsBatches, getCrmStats, seedCrmReferenceData } from "@/app/actions/crm"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatDateTime } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Send, List, Clock } from "lucide-react"
import { SmsImportModal } from "@/components/crm/sms-import-modal"
import { SmsFilterBar } from "@/components/crm/sms-filter-bar"
import { SmsBatchActions } from "@/components/crm/sms-batch-actions"
import { RefreshButton } from "@/components/ui/refresh-button"
import { cn } from "@/lib/utils"
import Link from "next/link"

export default async function SmsHubPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await searchParamsPromise
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  await seedCrmReferenceData()

  const readParam = (key: string) =>
    typeof searchParams[key] === "string" ? (searchParams[key] as string) : undefined

  const pageNum = Math.max(1, Number(readParam("page")) || 1)

  const filters = {
    page: pageNum,
    startDate: readParam("from"),
    endDate: readParam("till"),
    category: readParam("category"),
    status: readParam("status"),
    search: readParam("q"),
  }

  const [{ batches, total, totalPages }, stats] = await Promise.all([
    listSmsBatches(filters),
    getCrmStats()
  ])

  const filterQuery = new URLSearchParams(
    Object.entries({
      from: filters.startDate,
      till: filters.endDate,
      category: filters.category,
      status: filters.status,
      q: filters.search,
    }).filter((entry): entry is [string, string] => Boolean(entry[1])),
  )

  const pageHref = (target: number) => {
    const params = new URLSearchParams(filterQuery)
    params.set("page", String(target))
    return `/dashboard/crm/sms?${params.toString()}`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader
          title="Customer SMS Communications"
          description="Manage bulk messaging campaigns and delivery history."
          backHref="/dashboard/crm"
        />
        <div className="flex items-center gap-3">
           <RefreshButton />
           <SmsImportModal />
        </div>
      </div>

      {/* Legacy-style Stats Row */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="border-t-4 border-t-sky-500 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase">Total Lists</p>
                <p className="text-2xl font-black text-sky-600">{stats.sms.totalLists}</p>
              </div>
              <List className="h-8 w-8 text-sky-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-amber-500 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase">Pending Messages</p>
                <p className="text-2xl font-black text-amber-600">{stats.sms.pendingMessages}</p>
              </div>
              <Clock className="h-8 w-8 text-amber-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-emerald-500 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase">Sent Messages</p>
                <p className="text-2xl font-black text-emerald-600">{stats.sms.sentMessages.toLocaleString()}</p>
              </div>
              <Send className="h-8 w-8 text-emerald-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      <SmsFilterBar />

      <Card className="shadow-sm border-none">
        <CardHeader className="border-b bg-slate-50/30">
          <CardTitle className="text-xs font-bold uppercase text-slate-600">SMS Messages</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent bg-slate-50/50">
                <TableHead className="w-[180px] text-[10px] font-bold uppercase">Date and time</TableHead>
                <TableHead className="text-[10px] font-bold uppercase">Category</TableHead>
                <TableHead className="text-[10px] font-bold uppercase">List name</TableHead>
                <TableHead className="text-[10px] font-bold uppercase">Created by</TableHead>
                <TableHead className="text-[10px] font-bold uppercase text-center">Numbers</TableHead>
                <TableHead className="text-[10px] font-bold uppercase text-center">Status</TableHead>
                <TableHead className="text-right text-[10px] font-bold uppercase pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground italic text-xs">
                    No SMS messages found matching your criteria.
                  </TableCell>
                </TableRow>
              ) : (
                batches.map((b) => (
                  <TableRow key={b.id} className="hover:bg-slate-50/80 transition-colors">
                    <TableCell className="text-[11px] font-medium text-slate-500">{formatDateTime(b.createdAt)}</TableCell>
                    <TableCell>
                      <span className="text-[11px] font-bold text-slate-700">{b.category}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-[11px] font-bold text-sky-700 uppercase">{b.name}</span>
                    </TableCell>
                    <TableCell className="text-[11px] uppercase text-slate-500">{b.createdByName || 'System'}</TableCell>
                    <TableCell className="text-center">
                       <span className="text-[11px] font-black">{b.totalMessages}</span>
                    </TableCell>
                    <TableCell className="text-center">
                       <Badge
                        className={cn(
                          "h-5 px-1.5 text-[9px] uppercase font-black",
                          b.status === 'completed' ? 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100' :
                          b.status === 'processing' ? 'bg-blue-100 text-blue-700 border-blue-200 animate-pulse' :
                          b.status === 'failed' ? 'bg-rose-100 text-rose-700 border-rose-200' :
                          'bg-amber-100 text-amber-700 border-amber-200'
                        )}
                       >
                         {b.status === 'completed' ? 'Sent Out' : b.status}
                       </Badge>
                       {b.status !== 'pending' && (
                         <p className="text-[9px] font-bold text-slate-400 mt-1">
                           {b.sentMessages} sent · {b.failedMessages} failed
                         </p>
                       )}
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <SmsBatchActions batchId={b.id} batchName={b.name} status={b.status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <Button
            variant="outline"
            size="sm"
            asChild={pageNum > 1}
            disabled={pageNum <= 1}
            className="h-10 text-[10px] font-black uppercase tracking-widest"
          >
            {pageNum > 1 ? <Link href={pageHref(pageNum - 1)}>Previous</Link> : <span>Previous</span>}
          </Button>
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
            Page {pageNum} of {totalPages} · {total} list(s)
          </span>
          <Button
            variant="outline"
            size="sm"
            asChild={pageNum < totalPages}
            disabled={pageNum >= totalPages}
            className="h-10 text-[10px] font-black uppercase tracking-widest"
          >
            {pageNum < totalPages ? <Link href={pageHref(pageNum + 1)}>Next</Link> : <span>Next</span>}
          </Button>
        </div>
      )}
    </div>
  )
}
