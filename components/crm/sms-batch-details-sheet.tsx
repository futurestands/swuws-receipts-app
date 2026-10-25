"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SmsMessagePreview } from "./sms-message-preview"
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
  unknown: "bg-rose-100 text-rose-700 border-rose-200",
  processing: "bg-amber-100 text-amber-700 border-amber-200",
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
  const [result, setResult] = useState<{ batchId: string; status: string; records: SmsRecordRow[]; error: string | null } | null>(null)
  const [status, setStatus] = useState("all")
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null)
  const id = useId()
  const previewRef = useRef<HTMLDivElement>(null)
  const current = result?.batchId === batchId && result.status === status ? result : null
  const records = current?.records ?? []
  const selectedRecord = records.find(record => record.id === selectedRecordId) ?? records[0]
  const error = current?.error
  const loading = open && !current

  function closeDetails() {
    setResult(null)
    setSelectedRecordId(null)
    onOpenChange(false)
  }

  useEffect(() => {
    if (!open) return
    let active = true
    listSmsRecords(batchId, { status })
      .then(rows => { if (active) setResult({ batchId, status, records: rows, error: null }) })
      .catch(err => { if (active) setResult({ batchId, status, records: [], error: err instanceof Error ? err.message : String(err) }) })
    return () => { active = false }
  }, [open, batchId, status])

  const counts = {
    sent: records.filter((r) => r.status === "sent" || r.status === "delivered").length,
    failed: records.filter((r) => r.status === "failed").length,
    queued: records.filter((r) => r.status === "queued").length,
  }

  return (
    <Sheet open={open} onOpenChange={value => value ? onOpenChange(true) : closeDetails()}>
      <SheetContent className="sm:max-w-[720px] p-0 border-none flex flex-col bg-slate-50">
        <div className="bg-[#0f172a] p-6 text-white shrink-0 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/30">
              <Smartphone className="h-4 w-4 text-primary" />
            </div>
            <div>
              <SheetTitle className="text-white text-sm font-black uppercase tracking-widest">SMS list details</SheetTitle>
              <p className="text-[10px] text-slate-400 font-bold uppercase">{batchName}</p>
              <SheetDescription className="mt-1 text-xs text-slate-300">Preview each recipient’s saved message and check its sending status.</SheetDescription>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest">
            <span className="text-emerald-400">{counts.sent} sent</span>
            <span className="text-rose-400">{counts.failed} failed</span>
            <span className="text-amber-400">{counts.queued} queued</span>
          </div>
        </div>

        <div className="p-4 border-b bg-white shrink-0 flex items-center gap-3">
          <label htmlFor={`${id}-status`} className="text-xs font-medium">Sending status</label>
          <select id={`${id}-status`} className="h-9 rounded-md border bg-white px-3 text-xs" value={status} onChange={event => { setResult(null); setSelectedRecordId(null); setStatus(event.target.value) }}>
            <option value="all">All statuses</option>
            <option value="queued">Ready to send</option>
            <option value="sent">Sent</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
            <option value="unknown">Delivery uncertain — review required</option>
            <option value="processing">Sending / interrupted</option>
          </select>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <p className="p-6 text-xs font-bold text-rose-600">{error}</p>
          ) : records.length === 0 && !loading ? (
            <p className="p-6 text-xs italic text-slate-400">No messages match this filter.</p>
          ) : loading ? (
            <p role="status" className="p-6 text-sm text-muted-foreground">Loading recipients and messages…</p>
          ) : (
            <>
            {selectedRecord && <div ref={previewRef} id={`${id}-preview`} className="space-y-3 border-b p-4">
              <h3 className="text-sm font-semibold">SMS message preview</h3>
              <label htmlFor={`${id}-recipient`} className="block text-xs font-medium">Choose a recipient to preview their message</label>
              <select id={`${id}-recipient`} className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={selectedRecord.id} onChange={event => setSelectedRecordId(event.target.value)}>
                {records.map(record => <option key={record.id} value={record.id}>{record.customerName || "Recipient"} — {record.customerAccount || record.phoneNumber}</option>)}
              </select>
              <div aria-live="polite" aria-atomic="true"><SmsMessagePreview recipient={selectedRecord} /></div>
            </div>}
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
                      {record.error || (record.status === "queued" ? "Ready to send" : record.status === "processing" || record.status === "unknown" ? "Delivery requires review; do not resend automatically" : record.status === "failed" ? "Sending failed" : record.status === "delivered" ? "Delivery confirmed" : "Accepted by gateway")}
                      <Button type="button" variant="outline" size="sm" className="mt-2 h-8 text-xs" aria-controls={`${id}-preview`} aria-pressed={selectedRecord?.id === record.id} onClick={() => { setSelectedRecordId(record.id); previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }) }}>Preview SMS</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </>
          )}
        </div>

        <div className="p-4 bg-white border-t shrink-0 flex justify-end">
          <Button variant="outline" onClick={closeDetails} className="h-10 text-[10px] font-black uppercase tracking-widest">
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
