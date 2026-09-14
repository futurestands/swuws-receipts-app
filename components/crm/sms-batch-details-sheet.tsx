"use client"

import { useEffect, useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { listSmsRecords } from "@/app/actions/crm"
import { Loader2, Smartphone } from "lucide-react"
import { cn } from "@/lib/utils"

interface SmsRecordRow {
  id: string
  phoneNumber: string
  message: string
  status: string
  error: string | null
  customerName: string | null
  customerAccount: string | null
}

const STATUS_STYLES: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-700 border-emerald-200",
  delivered: "bg-emerald-100 text-emerald-700 border-emerald-200",
  failed: "bg-rose-100 text-rose-700 border-rose-200",
  queued: "bg-amber-100 text-amber-700 border-amber-200",
}

/**
 * Per-recipient view of a batch. Nothing in the app previously read
 * crm_sms_record, so when a batch reported failures there was no way to see
 * which numbers failed or why — the error text was written and never shown.
 */
export function SmsBatchDetailsSheet({
  batchId,
  batchName,
  open,
  onOpenChange,
}: {
  batchId: string
  batchName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [records, setRecords] = useState<SmsRecordRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState("all")

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    listSmsRecords(batchId, { status })
      .then((rows) => setRecords(rows as SmsRecordRow[]))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [open, batchId, status])

  const counts = {
    sent: records.filter((r) => r.status === "sent" || r.status === "delivered").length,
    failed: records.filter((r) => r.status === "failed").length,
    queued: records.filter((r) => r.status === "queued").length,
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[720px] p-0 border-none flex flex-col bg-slate-50">
        <div className="bg-[#0f172a] p-6 text-white shrink-0 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/30">
              <Smartphone className="h-4 w-4 text-primary" />
            </div>
            <div>
              <SheetTitle className="text-white text-sm font-black uppercase tracking-widest">Delivery Log</SheetTitle>
              <p className="text-[10px] text-slate-400 font-bold uppercase">{batchName}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest">
            <span className="text-emerald-400">{counts.sent} sent</span>
            <span className="text-rose-400">{counts.failed} failed</span>
            <span className="text-amber-400">{counts.queued} queued</span>
          </div>
        </div>

        <div className="p-4 border-b bg-white shrink-0 flex items-center gap-3">
          <Select value={status} onValueChange={(v) => setStatus(v ?? "all")}>
            <SelectTrigger className="h-9 w-[180px] text-xs font-bold">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        </div>

        <div className="flex-1 overflow-y-auto">
          {error ? (
            <p className="p-6 text-xs font-bold text-rose-600">{error}</p>
          ) : records.length === 0 && !loading ? (
            <p className="p-6 text-xs italic text-slate-400">No messages match this filter.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-[10px] font-bold uppercase">Recipient</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase">Number</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase text-center">Status</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase">Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="text-[11px] font-bold text-slate-700">
                      {record.customerName || "—"}
                      {record.customerAccount && (
                        <span className="block text-[10px] font-mono font-normal text-slate-400">
                          {record.customerAccount}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-[11px] font-mono text-slate-600">{record.phoneNumber}</TableCell>
                    <TableCell className="text-center">
                      <Badge className={cn("h-5 px-1.5 text-[9px] uppercase font-black", STATUS_STYLES[record.status])}>
                        {record.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[10px] text-slate-500 max-w-[220px]">
                      {record.error || (record.status === "queued" ? "Awaiting send" : "Accepted by gateway")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="p-4 bg-white border-t shrink-0 flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-10 text-[10px] font-black uppercase tracking-widest">
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
