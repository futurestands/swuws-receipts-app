import { requireUser } from "@/lib/session"
import { canViewCrm } from "@/lib/permissions"
import { listComplaints, listCrmDepartments, listCrmComplaintCategories, getCrmStats } from "@/app/actions/crm"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatDateTime } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Plus, Search, RotateCcw, Filter, User, PlayCircle, CheckCircle2, MessageSquare, ClipboardList } from "lucide-react"
import { cn } from "@/lib/utils"
import { RegisterComplaintModal } from "@/components/crm/register-complaint-modal"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default async function ComplaintsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  const filters = {
    page: 1,
    limit: 50,
    status: typeof searchParams.status === 'string' ? searchParams.status : undefined,
    priority: typeof searchParams.priority === 'string' ? searchParams.priority : undefined,
    area: typeof searchParams.area === 'string' ? searchParams.area : undefined,
    categoryId: typeof searchParams.category === 'string' ? searchParams.category : undefined,
    staffId: typeof searchParams.staff === 'string' ? searchParams.staff : undefined,
    from: typeof searchParams.from === 'string' ? searchParams.from : undefined,
    till: typeof searchParams.till === 'string' ? searchParams.till : undefined,
    complaintNumber: typeof searchParams.no === 'string' ? searchParams.no : undefined,
  }

  const [complaintData, departments, categories, stats] = await Promise.all([
    listComplaints(filters),
    listCrmDepartments(),
    listCrmComplaintCategories(),
    getCrmStats()
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader
          title="Complaints Center"
          description="Capture and resolve customer technical and financial issues."
        />
        <RegisterComplaintModal categories={categories} userName={user.name} />
      </div>

      {/* Status Cards */}
      <div className="grid gap-6 md:grid-cols-4">
        <Card className="border-t-4 border-t-sky-500 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase">Total Complaints</p>
                <p className="text-2xl font-black text-sky-600">{stats.complaints.total}</p>
              </div>
              <MessageSquare className="h-8 w-8 text-sky-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-rose-500 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase">Open</p>
                <p className="text-2xl font-black text-rose-600">{stats.complaints.open}</p>
              </div>
              <PlayCircle className="h-8 w-8 text-rose-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-amber-500 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase">Assigned</p>
                <p className="text-2xl font-black text-amber-600">{stats.complaints.assigned}</p>
              </div>
              <User className="h-8 w-8 text-amber-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-emerald-500 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase">Closed</p>
                <p className="text-2xl font-black text-emerald-600">{stats.complaints.closed}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-emerald-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Extensive Filter Bar */}
      <Card className="shadow-sm border-none bg-slate-50/50">
        <CardHeader className="border-b py-3 bg-slate-100/50 flex flex-row items-center gap-2">
          <Filter className="h-3 w-3 text-slate-500" />
          <CardTitle className="text-[10px] font-bold uppercase text-slate-500">Filter</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
           <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-5 items-end">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Complaint no</label>
                <Input placeholder="Enter ref #" className="h-9 bg-white" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">From</label>
                <Input type="date" className="h-9 bg-white" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Till</label>
                <Input type="date" className="h-9 bg-white" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Status</label>
                <Select>
                  <SelectTrigger className="h-9 bg-white text-xs">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Area</label>
                <Select>
                  <SelectTrigger className="h-9 bg-white text-xs">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Areas</SelectItem>
                    <SelectItem value="Kabale">Kabale</SelectItem>
                    <SelectItem value="Mbarara">Mbarara</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Type/category</label>
                <Select>
                  <SelectTrigger className="h-9 bg-white text-xs">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Department</label>
                <Select>
                  <SelectTrigger className="h-9 bg-white text-xs">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 lg:col-span-2">
                 <div className="flex gap-2">
                    <Button className="h-9 w-full bg-sky-700 hover:bg-sky-800 text-xs font-bold uppercase">
                      <Search className="h-3.5 w-3.5 mr-2" /> Search
                    </Button>
                    <Button variant="outline" className="h-9 w-full border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 text-xs font-bold uppercase">
                      <RotateCcw className="h-3.5 w-3.5 mr-2" /> Reset search
                    </Button>
                 </div>
              </div>
           </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm border-none">
        <CardHeader className="border-b bg-slate-50/30">
          <CardTitle className="text-xs font-bold uppercase text-slate-600 flex items-center gap-2">
             <ClipboardList className="h-4 w-4" /> Customer Complaints
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent bg-slate-50/50">
                  <TableHead className="text-[10px] font-bold uppercase">Date and Time</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase">Name</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase">Reference</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase">Reg No</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase">Phone No</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase">Type</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase">Staff</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase">Status</TableHead>
                  <TableHead className="text-right text-[10px] font-bold uppercase pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {complaintData.complaints.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground italic text-xs">
                      No complaints found matching your criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  complaintData.complaints.map((c) => (
                    <TableRow key={c.id} className="hover:bg-slate-50/80 transition-colors">
                      <TableCell className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
                         {formatDateTime(c.createdAt)}
                      </TableCell>
                      <TableCell className="text-[11px] font-bold text-slate-700">{c.complainantName}</TableCell>
                      <TableCell className="text-[11px] font-mono font-black text-sky-700">{c.complaintNumber.slice(-4)}</TableCell>
                      <TableCell className="text-[11px] font-mono text-slate-500">{c.customerAccount || '---'}</TableCell>
                      <TableCell className="text-[11px] text-slate-600">{c.complainantPhone}</TableCell>
                      <TableCell className="text-[11px] font-medium text-slate-700">{(c as any).categoryName}</TableCell>
                      <TableCell className="text-[11px] font-medium text-slate-500">{(c as any).assignedToName || 'Unassigned'}</TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            "h-5 px-1.5 text-[9px] uppercase font-black border",
                            c.status === 'open' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                            c.status === 'assigned' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                            'bg-emerald-50 text-emerald-700 border-emerald-100'
                          )}
                        >
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <Button variant="outline" size="sm" className="h-7 text-[10px] font-bold bg-sky-50 text-sky-700 border-sky-100 hover:bg-sky-100 hover:text-sky-800">
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
