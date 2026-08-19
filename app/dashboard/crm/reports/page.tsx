import { requireUser } from "@/lib/session"
import { canViewCrm } from "@/lib/permissions"
import { getComplaintReports, listCrmComplaintCategories } from "@/app/actions/crm"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Search, Download, RotateCcw, Beaker } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

export default async function CrmReportsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  const filters = {
    from: typeof searchParams.from === 'string' ? searchParams.from : undefined,
    till: typeof searchParams.till === 'string' ? searchParams.till : undefined,
    status: typeof searchParams.status === 'string' ? searchParams.status : undefined,
    district: typeof searchParams.district === 'string' ? searchParams.district : undefined,
    category: typeof searchParams.category === 'string' ? searchParams.category : undefined,
    staff: typeof searchParams.staff === 'string' ? searchParams.staff : undefined,
  }

  const [data, categories] = await Promise.all([
    getComplaintReports(filters),
    listCrmComplaintCategories()
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Call Center Reports"
        description="Comprehensive analysis of customer feedback and service delivery."
      />

      {/* Legacy-style Report Parameters */}
      <Card className="shadow-sm border-none bg-white">
        <CardHeader className="border-b py-3 bg-slate-50/50">
          <CardTitle className="text-[10px] font-bold uppercase text-slate-500">Report Parameters</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
           <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6 items-end">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">From</label>
                <Input type="date" className="h-9" defaultValue={filters.from} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Till</label>
                <Input type="date" className="h-9" defaultValue={filters.till} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Status</label>
                <Select defaultValue={filters.status || "all"}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">District/Territory</label>
                <Select defaultValue={filters.district || "all"}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Districts</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Complaint Type</label>
                <Select defaultValue={filters.category || "all"}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Staff</label>
                <Select defaultValue={filters.staff || "all"}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
           </div>

           <div className="grid grid-cols-3 gap-4 mt-6">
              <Button className="bg-[#f87171] hover:bg-[#ef4444] text-white font-bold h-10 shadow-sm">
                <Search className="h-4 w-4 mr-2" /> Get Data
              </Button>
              <Button className="bg-[#0f766e] hover:bg-[#0d9488] text-white font-bold h-10 shadow-sm">
                <Download className="h-4 w-4 mr-2" /> Export to Excel
              </Button>
              <Button variant="outline" className="bg-[#fbbf24] hover:bg-[#f59e0b] border-none text-white font-bold h-10 shadow-sm">
                <RotateCcw className="h-4 w-4 mr-2" /> Reset
              </Button>
           </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm border-none">
        <CardHeader className="border-b py-3 bg-slate-50/50">
          <CardTitle className="text-[10px] font-bold uppercase text-slate-500">Data</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.length === 0 ? (
            <div className="py-24 flex flex-col items-center justify-center text-slate-400 gap-4">
               <Beaker className="h-12 w-12 text-[#f87171] opacity-50" />
               <p className="text-sm font-medium italic">No data found</p>
            </div>
          ) : (
            <Table>
               <TableHeader>
                  <TableRow className="bg-slate-50/30">
                     <TableHead className="text-[10px] font-bold uppercase">Date</TableHead>
                     <TableHead className="text-[10px] font-bold uppercase">Ref #</TableHead>
                     <TableHead className="text-[10px] font-bold uppercase">Customer</TableHead>
                     <TableHead className="text-[10px] font-bold uppercase">Category</TableHead>
                     <TableHead className="text-[10px] font-bold uppercase">Staff</TableHead>
                     <TableHead className="text-[10px] font-bold uppercase">Status</TableHead>
                  </TableRow>
               </TableHeader>
               <TableBody>
                  {data.map(row => (
                    <TableRow key={row.id}>
                       <TableCell className="text-xs">{formatDate(row.createdAt)}</TableCell>
                       <TableCell className="text-xs font-mono font-bold">{row.complaintNumber}</TableCell>
                       <TableCell className="text-xs">{row.complainantName}</TableCell>
                       <TableCell className="text-xs">{row.categoryName}</TableCell>
                       <TableCell className="text-xs">{row.assignedToName || 'Unassigned'}</TableCell>
                       <TableCell>
                          <Badge className={cn(
                            "text-[9px] uppercase font-bold",
                            row.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          )}>
                             {row.status}
                          </Badge>
                       </TableCell>
                    </TableRow>
                  ))}
               </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
