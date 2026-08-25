"use client"

import { useState, useTransition, useEffect } from "react"
import { getReportData } from "@/app/actions/executive-reports"
import { getCollectionPeriods } from "@/app/actions/billing"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { toast } from "sonner"
import {
  Loader2,
  FileDown,
  Printer,
  Table as TableIcon
} from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatUGX, formatDate, formatDateTime } from "@/lib/format"
import * as XLSX from "xlsx"

export function ReportGeneratorClient({ reportId, title }: { reportId: string, title: string }) {
  const [pending, startTransition] = useTransition()
  const [data, setData] = useState<Array<Record<string, unknown>> | null>(null)
  const [periods, setPeriods] = useState<{ id: string; periodName: string }[]>([])

  // Filters
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [status, setStatus] = useState("all")
  const [selectedPeriodId, setSelectedPeriodId] = useState("")

  useEffect(() => {
    getCollectionPeriods().then(setPeriods).catch(console.error)
  }, [])

  async function handleGenerate() {
    startTransition(async () => {
      try {
        const result = await getReportData(reportId, {
          startDate,
          endDate,
          status,
          periodId: selectedPeriodId
        })
        setData(result as Array<Record<string, unknown>>)
        toast.success("Report data retrieved")
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to generate report"
        toast.error(message)
      }
    })
  }

  function exportToExcel() {
    if (!data) return
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Report")
    XLSX.writeFile(wb, `SWUWS_${reportId}_${new Date().toISOString().split('T')[0]}.xlsx`)
    toast.success("Excel export successful")
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
           <CardTitle>Report Parameters</CardTitle>
           <CardDescription>Configure filters to narrow down the report results.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-4 items-end">
           {reportId === 'unbilled-accounts' ? (
             <div className="space-y-2">
                <Label className="text-xs">Billing Period</Label>
                <Select value={selectedPeriodId} onValueChange={(v) => setSelectedPeriodId(v || "")}>
                   <SelectTrigger>
                      <SelectValue placeholder="Select period..." />
                   </SelectTrigger>
                   <SelectContent>
                      {periods.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.periodName}</SelectItem>
                      ))}
                   </SelectContent>
                </Select>
             </div>
           ) : (
             <>
               <div className="space-y-2">
                  <Label className="text-xs">Start Date</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
               </div>
               <div className="space-y-2">
                  <Label className="text-xs">End Date</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
               </div>
             </>
           )}

           {reportId !== 'meter-reading' && reportId !== 'audit-activity' && reportId !== 'unbilled-accounts' ? (
             <div className="space-y-2">
                <Label className="text-xs">Reconciliation Status</Label>
                <Select value={status} onValueChange={(v) => v && setStatus(v)}>
                   <SelectTrigger>
                      <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="matched">Matched</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                   </SelectContent>
                </Select>
             </div>
           ) : (
             <div className="hidden md:block" /> // Layout spacer
           )}

           <Button className="w-full" onClick={handleGenerate} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TableIcon className="h-4 w-4 mr-2" />}
              Fetch Data
           </Button>
        </CardContent>
      </Card>

      {data && (
        <div className="space-y-4">
           <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Preview: {title}</h3>
              <div className="flex gap-2">
                 <Button variant="outline" size="sm" onClick={() => window.print()}>
                    <Printer className="h-4 w-4 mr-2" /> Print PDF
                 </Button>
                 <Button variant="outline" size="sm" onClick={exportToExcel}>
                    <FileDown className="h-4 w-4 mr-2" /> Export Excel
                 </Button>
              </div>
           </div>

           <div className="rounded-md border bg-white overflow-hidden">
              <Table>
                 <TableHeader>
                    <TableRow className="bg-muted/50">
                       {data.length > 0 && Object.keys(data[0]).map(key => (
                         <TableHead key={key} className="capitalize text-[10px] font-bold">
                            {key.replace(/([A-Z])/g, ' $1')}
                         </TableHead>
                       ))}
                    </TableRow>
                 </TableHeader>
                 <TableBody>
                    {data.slice(0, 100).map((row, i) => (
                      <TableRow key={i}>
                         {Object.values(row).map((val, j) => (
                           <TableCell key={j} className="text-[10px]">
                              {val instanceof Date ? formatDate(val) : typeof val === 'number' && val > 1000 ? formatUGX(val) : String(val ?? '')}
                           </TableCell>
                         ))}
                      </TableRow>
                    ))}
                    {data.length > 100 && (
                      <TableRow>
                         <TableCell colSpan={Object.keys(data[0]).length} className="text-center text-xs text-muted-foreground py-4 italic">
                            Showing first 100 of {data.length} records. Download Excel for full dataset.
                         </TableCell>
                      </TableRow>
                    )}
                    {data.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                           No data found matching your criteria.
                        </TableCell>
                      </TableRow>
                    )}
                 </TableBody>
              </Table>
           </div>
        </div>
      )}
    </div>
  )
}
