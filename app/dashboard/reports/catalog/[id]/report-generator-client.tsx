"use client"

import { useState, useTransition, useEffect } from "react"
import {
  getMonthlyProductionExecutiveReport,
  getProductionReportScopeOptions,
  getReportData,
  type ProductionReportScopeOptions,
} from "@/app/actions/executive-reports"
import { getCollectionPeriods } from "@/app/actions/billing"
import { MonthlyProductionReportView } from "@/components/production/monthly-production-report-view"
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
import { formatUGX, formatDate } from "@/lib/format"
import type { MonthlyProductionReportOutput } from "@/lib/reports/production-executive-report"
import { buildMonthlyProductionExcelSheets } from "@/lib/reports/production-report-export"
import * as XLSX from "xlsx"

const nativeSelectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"

export function ReportGeneratorClient({ reportId, title }: { reportId: string, title: string }) {
  const isProductionReport = reportId === "monthly-water-production"
  const [pending, startTransition] = useTransition()
  const [data, setData] = useState<Array<Record<string, unknown>> | null>(null)
  const [productionReport, setProductionReport] = useState<MonthlyProductionReportOutput | null>(null)
  const [scopeOptions, setScopeOptions] = useState<ProductionReportScopeOptions | null>(null)
  const [periods, setPeriods] = useState<{ id: string; periodName: string; status: string }[]>([])

  // Standard report filters
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [status, setStatus] = useState("all")
  const [selectedPeriodId, setSelectedPeriodId] = useState("")

  // Production & Energy report filters (Month, Cluster, Area/Branch, Scheme, or SWUWS-wide)
  const [reportingMonth, setReportingMonth] = useState(() =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala", year: "numeric", month: "2-digit" })
      .format(new Date())
      .slice(0, 7),
  )
  const [clusterId, setClusterId] = useState("")
  const [branchId, setBranchId] = useState("")
  const [schemeId, setSchemeId] = useState("")

  useEffect(() => {
    if (isProductionReport) {
      getProductionReportScopeOptions()
        .then((opts) => {
          setScopeOptions(opts)
          if (opts.defaultMonth) setReportingMonth((prev) => prev || opts.defaultMonth)
        })
        .catch(console.error)
    } else {
      getCollectionPeriods().then(setPeriods).catch(console.error)
    }
  }, [isProductionReport])

  const filteredBranches = (scopeOptions?.branches ?? []).filter(
    (b) => !clusterId || b.clusterId === clusterId,
  )
  const filteredSchemes = (scopeOptions?.schemes ?? []).filter(
    (s) => (!clusterId || s.clusterId === clusterId) && (!branchId || s.branchId === branchId),
  )

  async function handleGenerate() {
    startTransition(async () => {
      try {
        if (isProductionReport) {
          const result = await getMonthlyProductionExecutiveReport({
            month: reportingMonth,
            clusterId: clusterId || undefined,
            branchId: branchId || undefined,
            schemeId: schemeId || undefined,
          })
          setProductionReport(result)
          toast.success("Monthly production & energy report generated")
          return
        }

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
    if (isProductionReport) {
      if (!productionReport) return
      const sheets = buildMonthlyProductionExcelSheets(productionReport)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheets.executiveSummary), "Executive Summary")
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          sheets.schemePerformance.length > 0
            ? sheets.schemePerformance
            : [{ Notice: "No authorised schemes matched the selected filter." }],
        ),
        "Scheme Performance",
      )
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          sheets.crossMonthAllocations.length > 0
            ? sheets.crossMonthAllocations
            : [{ Notice: "No cross-month ESTIMATED_ALLOCATION records for this period." }],
        ),
        "Cross-Month Allocations",
      )
      XLSX.writeFile(wb, `SWUWS_monthly-water-production_${productionReport.reportingMonth}.xlsx`)
      toast.success("Excel workbook exported")
      return
    }

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
           <CardDescription>
             {isProductionReport
               ? "Filter by calendar month and organisational boundary (SWUWS-wide, Cluster, Area/Branch, or individual Water Scheme)."
               : "Configure filters to narrow down the report results."}
           </CardDescription>
        </CardHeader>
        {isProductionReport ? (
          <CardContent className="grid gap-4 md:grid-cols-5 items-end">
            <div className="space-y-2">
              <Label htmlFor="prod-report-month" className="text-xs">Reporting Month</Label>
              <Input
                id="prod-report-month"
                aria-label="Reporting Month"
                type="month"
                value={reportingMonth}
                onChange={(e) => setReportingMonth(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prod-report-cluster" className="text-xs">Cluster</Label>
              <select
                id="prod-report-cluster"
                aria-label="Cluster filter"
                className={nativeSelectClass}
                value={clusterId}
                onChange={(e) => {
                  setClusterId(e.target.value)
                  setBranchId("")
                  setSchemeId("")
                }}
              >
                <option value="">SWUWS-Wide (All Authorised Clusters)</option>
                {(scopeOptions?.clusters ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prod-report-branch" className="text-xs">Area (Branch)</Label>
              <select
                id="prod-report-branch"
                aria-label="Area filter"
                className={nativeSelectClass}
                value={branchId}
                onChange={(e) => {
                  setBranchId(e.target.value)
                  setSchemeId("")
                }}
              >
                <option value="">All Authorised Areas</option>
                {filteredBranches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prod-report-scheme" className="text-xs">Water Scheme</Label>
              <select
                id="prod-report-scheme"
                aria-label="Scheme filter"
                className={nativeSelectClass}
                value={schemeId}
                onChange={(e) => setSchemeId(e.target.value)}
              >
                <option value="">All Authorised Schemes</option>
                {filteredSchemes.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <Button className="w-full" onClick={handleGenerate} disabled={pending || !reportingMonth}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TableIcon className="h-4 w-4 mr-2" />}
              Generate Report
            </Button>
          </CardContent>
        ) : (
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
        )}
      </Card>

      {isProductionReport && productionReport && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <h3 className="text-lg font-bold">Preview: {title}</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-2" /> Print / Save PDF
              </Button>
              <Button variant="outline" size="sm" onClick={exportToExcel}>
                <FileDown className="h-4 w-4 mr-2" /> Export Excel (.xlsx)
              </Button>
            </div>
          </div>
          <MonthlyProductionReportView report={productionReport} />
        </div>
      )}

      {!isProductionReport && data && (
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
