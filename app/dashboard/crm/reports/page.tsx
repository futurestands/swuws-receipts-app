import { requireUser } from "@/lib/session"
import { canViewCrm } from "@/lib/permissions"
import {
  getComplaintReports,
  listCrmComplaintCategories,
  listCrmAreas,
  listCrmStaff
} from "@/app/actions/crm"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/format"
import { Beaker } from "lucide-react"
import { cn } from "@/lib/utils"
import { ReportsFilterBar } from "@/components/crm/reports-filter-bar"
import { ReportExportButton } from "@/components/crm/report-export-button"
import { ScrollableTableContainer } from "@/components/ui/responsive-table"

function formatHours(hours: number | null) {
  if (hours === null) return "—"
  if (hours < 1) return `${Math.round(hours * 60)} min`
  if (hours < 48) return `${hours.toFixed(1)} hrs`
  return `${(hours / 24).toFixed(1)} days`
}

/** Compact ranked breakdown, e.g. tickets per category. */
function Breakdown({
  title,
  rows,
  total,
}: {
  title: string
  rows: { label: string; count: number }[]
  total: number
}) {
  if (rows.length === 0) return null

  return (
    <Card className="shadow-sm border-none">
      <CardHeader className="border-b py-3 bg-slate-50/50">
        <CardTitle className="text-[10px] font-bold uppercase text-slate-500">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {rows.slice(0, 8).map((row) => (
          <div key={row.label} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-slate-600 truncate">{row.label}</span>
              <span className="text-[11px] font-black text-slate-800 shrink-0">{row.count}</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-500"
                style={{ width: `${total > 0 ? (row.count / total) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default async function CrmReportsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await searchParamsPromise
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  const readParam = (key: string) =>
    typeof searchParams[key] === "string" ? (searchParams[key] as string) : undefined

  const filters = {
    from: readParam("from"),
    till: readParam("till"),
    status: readParam("status"),
    priority: readParam("priority"),
    district: readParam("district"),
    category: readParam("category"),
    staff: readParam("staff"),
  }

  const [{ rows, summary }, categories, areas, staff] = await Promise.all([
    getComplaintReports(filters),
    listCrmComplaintCategories({ includeInactive: true }),
    listCrmAreas(),
    listCrmStaff()
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Call Center Reports"
        description="Comprehensive analysis of customer feedback and service delivery."
        backHref="/dashboard/crm"
      />

      <ReportsFilterBar areas={areas} staff={staff} categories={categories} />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="border-t-4 border-t-sky-500 shadow-sm bg-white">
          <CardContent className="pt-6">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tickets</p>
            <p className="text-2xl font-black text-sky-600 mt-1">{summary.total}</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-rose-500 shadow-sm bg-white">
          <CardContent className="pt-6">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Open</p>
            <p className="text-2xl font-black text-rose-600 mt-1">{summary.open}</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-amber-500 shadow-sm bg-white">
          <CardContent className="pt-6">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">In Progress</p>
            <p className="text-2xl font-black text-amber-600 mt-1">{summary.inProgress}</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-emerald-500 shadow-sm bg-white">
          <CardContent className="pt-6">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resolved / Closed</p>
            <p className="text-2xl font-black text-emerald-600 mt-1">{summary.resolved + summary.closed}</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-slate-400 shadow-sm bg-white">
          <CardContent className="pt-6">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avg Resolution</p>
            <p className="text-2xl font-black text-slate-700 mt-1">{formatHours(summary.avgResolutionHours)}</p>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">
              Median {formatHours(summary.medianResolutionHours)} · {summary.resolutionCount} resolved
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Breakdown title="By Complaint Type" rows={summary.byCategory} total={summary.total} />
        <Breakdown title="By Area" rows={summary.byArea} total={summary.total} />
        <Breakdown title="By Handler" rows={summary.byStaff} total={summary.total} />
        <Breakdown title="By Priority" rows={summary.byPriority} total={summary.total} />
      </div>

      <Card className="shadow-sm border-none">
        <CardHeader className="border-b py-3 bg-slate-50/50 flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-[10px] font-bold uppercase text-slate-500">
            Data{summary.truncated ? " (first 5,000 rows — narrow your filters)" : ""}
          </CardTitle>
          <ReportExportButton rows={rows} />
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="py-24 flex flex-col items-center justify-center text-slate-400 gap-4">
              <Beaker className="h-12 w-12 text-[#f87171] opacity-50" />
              <p className="text-sm font-medium italic">No data found</p>
            </div>
          ) : (
            <ScrollableTableContainer className="border-0 rounded-none">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/30">
                    <TableHead className="text-[10px] font-bold uppercase">Date</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Ref #</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Customer</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Category</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Area</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Staff</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Priority</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(row => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs whitespace-nowrap">{formatDate(row.createdAt)}</TableCell>
                      <TableCell className="text-xs font-mono font-bold">{row.complaintNumber}</TableCell>
                      <TableCell className="text-xs">{row.complainantName}</TableCell>
                      <TableCell className="text-xs">{row.categoryName || "—"}</TableCell>
                      <TableCell className="text-xs">{row.areaName || "—"}</TableCell>
                      <TableCell className="text-xs">{row.assignedToName || "Unassigned"}</TableCell>
                      <TableCell className="text-xs capitalize">{row.priority}</TableCell>
                      <TableCell>
                        <Badge className={cn(
                          "text-[9px] uppercase font-bold",
                          row.status === "resolved" ? "bg-emerald-100 text-emerald-700" :
                          row.status === "closed" ? "bg-slate-100 text-slate-700" :
                          row.status === "open" ? "bg-rose-100 text-rose-700" :
                          "bg-amber-100 text-amber-700"
                        )}>
                          {row.status.replace("_", " ")}
                        </Badge>
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
