import { requireUser } from "@/lib/session"
import { canViewCrm } from "@/lib/permissions"
import { listSmsBatches, getCrmStats } from "@/app/actions/crm"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatDateTime } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Send, Smartphone, List, Clock, CheckCircle2, MoreHorizontal } from "lucide-react"
import { SmsImportModal } from "@/components/crm/sms-import-modal"
import { SmsFilterBar } from "@/components/crm/sms-filter-bar"

export default async function SmsHubPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await searchParamsPromise
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  const filters = {
    startDate: typeof searchParams.from === 'string' ? searchParams.from : undefined,
    endDate: typeof searchParams.till === 'string' ? searchParams.till : undefined,
    category: typeof searchParams.category === 'string' ? searchParams.category : undefined,
    status: typeof searchParams.status === 'string' ? searchParams.status : undefined,
    search: typeof searchParams.q === 'string' ? searchParams.q : undefined,
  }

  const [batches, stats] = await Promise.all([
    listSmsBatches(filters),
    getCrmStats()
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader
          title="Customer SMS Communications"
          description="Manage bulk messaging campaigns and delivery history."
          backHref="/dashboard/crm"
        />
        <div className="flex items-center gap-2">
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
                       <Badge className="h-5 px-1.5 text-[9px] bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 uppercase font-black">
                         {b.status === 'completed' ? 'Sent Out' : b.status}
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
        </CardContent>
      </Card>
    </div>
  )
}
