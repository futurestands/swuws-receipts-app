import { requireUser } from "@/lib/session"
import { canViewCrm } from "@/lib/permissions"
import {
  listComplaints,
  listCrmComplaintCategories,
  getCrmStats,
  listCrmAreas,
  listCrmStaff,
  seedCrmReferenceData,
} from "@/app/actions/crm"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatDateTime } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Filter, User, PlayCircle, CheckCircle2, MessageSquare, ClipboardList, Archive } from "lucide-react"
import { cn } from "@/lib/utils"
import { RegisterComplaintModal } from "@/components/crm/register-complaint-modal"
import { ComplaintRowActions } from "@/components/crm/complaint-row-actions"
import { ComplaintsFilterBar } from "@/components/crm/complaints-filter-bar"
import { ScrollableTableContainer } from "@/components/ui/responsive-table"
import { ComplaintsServiceBoard } from "@/components/crm/complaints-service-board"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LayoutGrid, List as ListIcon } from "lucide-react"
import Link from "next/link"
import type { CrmComplaint } from "@/lib/db/schema"

type ComplaintRow = CrmComplaint & {
  categoryName?: string;
  assignedToName?: string;
  customerAccount?: string;
  areaName?: string;
  schemeName?: string;
}

/**
 * COMPLAINTS CENTER PAGE
 * Professional-grade hub for managing customer service tickets.
 */
export default async function ComplaintsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await searchParamsPromise
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  await seedCrmReferenceData()

  const readParam = (key: string) =>
    typeof searchParams[key] === 'string' ? (searchParams[key] as string) : undefined

  const pageNum = Math.max(1, Number(readParam('page')) || 1)

  const filters = {
    page: pageNum,
    limit: 50,
    status: readParam('status'),
    priority: readParam('priority'),
    area: readParam('area'),
    categoryId: readParam('category'),
    staffId: readParam('staff'),
    from: readParam('from'),
    till: readParam('till'),
    complaintNumber: readParam('no'),
    search: readParam('q'),
  }

  const boardFilters = {
    ...filters,
    page: 1,
    limit: 100,
    excludeClosed: !filters.status,
  }

  const [complaintData, boardData, categories, stats, areas, staff] = await Promise.all([
    listComplaints(filters),
    listComplaints(boardFilters),
    listCrmComplaintCategories(),
    getCrmStats(),
    listCrmAreas(),
    listCrmStaff()
  ])

  // Preserved across page links so paging never silently drops the filters.
  const filterQuery = new URLSearchParams(
    Object.entries({
      q: filters.search,
      no: filters.complaintNumber,
      from: filters.from,
      till: filters.till,
      status: filters.status,
      priority: filters.priority,
      area: filters.area,
      category: filters.categoryId,
      staff: filters.staffId,
    }).filter((entry): entry is [string, string] => Boolean(entry[1])),
  )

  const pageHref = (target: number) => {
    const params = new URLSearchParams(filterQuery)
    params.set('page', String(target))
    return `/dashboard/crm/complaints?${params.toString()}`
  }

  const statusHref = (status?: string) => {
    const params = new URLSearchParams(filterQuery)
    params.delete('page')
    if (status) params.set('status', status)
    else params.delete('status')
    const qs = params.toString()
    return qs ? `/dashboard/crm/complaints?${qs}` : '/dashboard/crm/complaints'
  }

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="Complaints Center"
          description="Capture and resolve customer technical and financial issues."
          backHref="/dashboard/crm"
          className="mb-0"
        />
        <RegisterComplaintModal
           categories={categories}
           areas={areas}
           userName={user.name}
        />
      </div>

      {/* Status Cards - Fixed Responsive Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        <Link href={statusHref()} className="block">
          <Card className={cn("border-t-4 border-t-sky-500 shadow-sm bg-white h-full hover:shadow-md transition-shadow", !filters.status && "ring-1 ring-sky-200")}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Tickets</p>
                  <p className="text-2xl font-black text-sky-600 mt-1">{stats.complaints.total}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-sky-50 flex items-center justify-center">
                   <MessageSquare className="h-5 w-5 text-sky-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={statusHref("open")} className="block">
          <Card className={cn("border-t-4 border-t-rose-500 shadow-sm bg-white h-full hover:shadow-md transition-shadow", filters.status === "open" && "ring-1 ring-rose-200")}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Open / New</p>
                  <p className="text-2xl font-black text-rose-600 mt-1">{stats.complaints.open}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-rose-50 flex items-center justify-center">
                   <PlayCircle className="h-5 w-5 text-rose-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={statusHref("working")} className="block">
          <Card className={cn("border-t-4 border-t-amber-500 shadow-sm bg-white h-full hover:shadow-md transition-shadow", filters.status === "working" && "ring-1 ring-amber-200")}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">In Progress</p>
                  <p className="text-2xl font-black text-amber-600 mt-1">
                    {stats.complaints.assigned + stats.complaints.inProgress}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-full bg-amber-50 flex items-center justify-center">
                   <User className="h-5 w-5 text-amber-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={statusHref("resolved")} className="block">
          <Card className={cn("border-t-4 border-t-emerald-500 shadow-sm bg-white h-full hover:shadow-md transition-shadow", filters.status === "resolved" && "ring-1 ring-emerald-200")}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resolved</p>
                  <p className="text-2xl font-black text-emerald-600 mt-1">{stats.complaints.resolved}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center">
                   <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={statusHref("closed")} className="block">
          <Card className={cn("border-t-4 border-t-slate-400 shadow-sm bg-white h-full hover:shadow-md transition-shadow", filters.status === "closed" && "ring-1 ring-slate-300")}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Closed</p>
                  <p className="text-2xl font-black text-slate-700 mt-1">{stats.complaints.closed}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                   <Archive className="h-5 w-5 text-slate-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <ComplaintsFilterBar areas={areas} staff={staff} categories={categories} />

      <Tabs defaultValue="board" className="w-full">
        <div className="flex items-center justify-between mb-4">
           <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">View Orientation</h3>
           <TabsList className="bg-slate-100/50 p-1 border border-slate-200">
             <TabsTrigger value="board" className="text-[9px] font-black uppercase gap-1.5 data-[state=active]:bg-white data-[state=active]:text-primary shadow-none h-7">
               <LayoutGrid className="h-3 w-3" /> Service Board
             </TabsTrigger>
             <TabsTrigger value="list" className="text-[9px] font-black uppercase gap-1.5 data-[state=active]:bg-white data-[state=active]:text-primary shadow-none h-7">
               <ListIcon className="h-3 w-3" /> Data Log
             </TabsTrigger>
           </TabsList>
        </div>

        <TabsContent value="board" className="mt-0">
           <ComplaintsServiceBoard complaints={boardData.complaints} />
        </TabsContent>

        <TabsContent value="list" className="mt-0">
          <Card className="shadow-xl border-none overflow-hidden bg-white">
            <CardHeader className="border-b bg-slate-900 p-6">
              <div className="flex items-center gap-3">
                 <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center border border-white/10">
                    <ClipboardList className="h-4 w-4 text-primary" />
                 </div>
                 <div>
                    <CardTitle className="text-sm font-black uppercase text-white tracking-widest">Service Delivery Log</CardTitle>
                    <p className="text-[10px] text-slate-400 font-medium">Real-time oversight of technical and financial service tickets.</p>
                 </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollableTableContainer className="border-0 rounded-none">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent bg-slate-50">
                      <TableHead className="text-[10px] font-black uppercase tracking-tighter py-5 px-6">Date and Time</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-tighter">Customer Name</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-tighter">Ticket ID</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-tighter text-center">A/C No</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-tighter">Contact</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-tighter">Nature of Issue</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-tighter">Handler</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-tighter">Current Status</TableHead>
                      <TableHead className="text-right text-[10px] font-black uppercase tracking-tighter pr-8">Operations</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {complaintData.complaints.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-24 text-slate-400 italic text-sm font-medium">
                          <div className="flex flex-col items-center gap-4">
                             <Filter className="h-12 w-12 opacity-10" />
                             <p>No complaints found matching your current filter set.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      (complaintData.complaints as ComplaintRow[]).map((c) => (
                        <TableRow key={c.id} className="hover:bg-slate-50/80 transition-colors group">
                          <TableCell className="text-[11px] font-bold text-slate-500 whitespace-nowrap px-6">
                             {formatDateTime(c.createdAt)}
                          </TableCell>
                          <TableCell className="text-[12px] font-black text-slate-800 uppercase tracking-tight">{c.complainantName}</TableCell>
                          <TableCell>
                             <Badge variant="outline" className="text-[10px] font-mono font-black bg-sky-50 text-sky-700 border-sky-100">
                                {c.complaintNumber.slice(-6)}
                             </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                             <span className="text-[11px] font-mono font-bold text-slate-400">{c.customerAccount || 'N/A'}</span>
                          </TableCell>
                          <TableCell className="text-[11px] font-bold text-slate-600">{c.complainantPhone}</TableCell>
                          <TableCell>
                             <span className="text-[11px] font-bold text-slate-700 uppercase tracking-tighter">{c.categoryName}</span>
                          </TableCell>
                          <TableCell>
                             <div className="flex items-center gap-2">
                                <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 border border-slate-200 uppercase">
                                   {(c.assignedToName || 'U')[0]}
                                </div>
                                <span className="text-[11px] font-bold text-slate-500 capitalize">{c.assignedToName || 'Unassigned'}</span>
                             </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={cn(
                                "h-5 px-2 text-[9px] uppercase font-black border shadow-sm",
                                c.status === 'open' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                                c.status === 'assigned' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                c.status === 'in_progress' ? 'bg-sky-50 text-sky-700 border-sky-100' :
                                c.status === 'resolved' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                'bg-slate-50 text-slate-700 border-slate-200'
                              )}
                            >
                              {c.status.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right pr-8">
                            <ComplaintRowActions complaint={c} />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollableTableContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* listComplaints has always returned totalPages, but nothing rendered
          a pager -- so only the newest 50 tickets were ever reachable. */}
      {complaintData.totalPages > 1 && (
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
            Page {pageNum} of {complaintData.totalPages} · {complaintData.total} ticket(s)
          </span>
          <Button
            variant="outline"
            size="sm"
            asChild={pageNum < complaintData.totalPages}
            disabled={pageNum >= complaintData.totalPages}
            className="h-10 text-[10px] font-black uppercase tracking-widest"
          >
            {pageNum < complaintData.totalPages ? <Link href={pageHref(pageNum + 1)}>Next</Link> : <span>Next</span>}
          </Button>
        </div>
      )}
    </div>
  )
}
