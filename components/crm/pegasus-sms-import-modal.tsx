"use client"

import { useEffect, useId, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Upload, Download, Loader2, ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { importSmsBatch, previewSmsImport, listCrmSmsTemplates } from "@/app/actions/crm"
import { getAuthorizedSchemes } from "@/app/actions/billing"
import type { SmsImportPreview } from "@/lib/crm/sms-import-server"
import { SMS_IMPORT_MAX_BYTES, SMS_PURPOSES, SMS_SAMPLE_CSV } from "@/lib/crm/sms-import-constants"

const selectClass = "flex h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"
const money = (value: number) => value.toLocaleString("en-UG", { maximumFractionDigits: 2 })

export function PegasusSmsImportModal() {
  const router = useRouter()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [category, setCategory] = useState<string>("Bill Reminders")
  const [schemeId, setSchemeId] = useState("all")
  const [file, setFile] = useState<File | null>(null)
  const [templateId, setTemplateId] = useState("default")
  const [manual, setManual] = useState(false)
  const [message, setMessage] = useState("")
  const [onlyWithBalance, setOnlyWithBalance] = useState(false)
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([])
  const [schemes, setSchemes] = useState<{ id: string; name: string }[]>([])
  const [preview, setPreview] = useState<SmsImportPreview | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [sampleIndex, setSampleIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    Promise.all([getAuthorizedSchemes(), listCrmSmsTemplates()])
      .then(([availableSchemes, availableTemplates]) => { if (active) { setSchemes(availableSchemes); setTemplates(availableTemplates) } })
      .catch(() => { if (active) setError("Could not load schemes or message templates. Close this window and try again") })
    return () => { active = false }
  }, [open])

  function resetPreview() { setPreview(null); setAccepted(false); setSampleIndex(0); setError(null) }
  function chooseFile(next: File | null) {
    resetPreview()
    if (next && (!/\.(csv|xlsx)$/i.test(next.name) || next.size > SMS_IMPORT_MAX_BYTES)) {
      setFile(null); setError("Choose one CSV or Excel (.xlsx) file, up to 10 MB"); return
    }
    setFile(next)
    if (next && !name.trim()) setName(next.name.replace(/\.[^.]+$/, "").slice(0, 120))
  }
  function formData() {
    const data = new FormData()
    if (file) data.set("file", file)
    data.set("name", name); data.set("category", category); data.set("schemeId", schemeId)
    data.set("messageMode", manual ? "custom" : "template"); data.set("onlyWithBalance", String(onlyWithBalance))
    if (manual) data.set("manualMessage", message)
    else if (templateId !== "default") data.set("templateId", templateId)
    return data
  }
  async function review(event: React.FormEvent) {
    event.preventDefault()
    if (!file) { setError("Choose a Pegasus CSV or Excel file"); return }
    if (!name.trim()) { setError("Enter an SMS list name"); return }
    setLoading(true); setError(null)
    try { setPreview(await previewSmsImport(formData())); setAccepted(false); setSampleIndex(0) }
    catch (err) { setError(err instanceof Error ? err.message : "Could not review this file") }
    finally { setLoading(false) }
  }
  async function createList() {
    if (!preview) return
    setLoading(true); setError(null)
    try {
      const data = formData()
      data.set("previewKey", preview.previewKey); data.set("acceptExcluded", String(accepted))
      const result = await importSmsBatch(data)
      toast.success(`Draft SMS list created with ${result.summary.ready} recipients. Submit it for approval before sending`)
      setOpen(false); setName(""); setFile(null); resetPreview(); router.refresh()
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create the SMS list. Review the import again") }
    finally { setLoading(false) }
  }
  function downloadSample() {
    const url = URL.createObjectURL(new Blob(["\uFEFF" + SMS_SAMPLE_CSV], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url; link.download = "swuws-sms-list-sample.csv"; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const excluded = preview ? preview.counts.total - preview.counts.ready : 0
  return (
    <Dialog open={open} onOpenChange={value => { if (!loading) { setOpen(value); if (!value) resetPreview() } }}>
      <DialogTrigger className={buttonVariants({ className: "h-11 bg-emerald-700 hover:bg-emerald-800" })}><Plus className="mr-2 h-4 w-4" />Import Pegasus file</DialogTrigger>
      <DialogContent className="sm:max-w-[920px] max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{preview ? "Review SMS list" : "Create SMS list"}</DialogTitle><DialogDescription>{preview ? "Check the recipients and sample message before saving" : "Upload your Pegasus export directly. Keep its header row and column names"}</DialogDescription></DialogHeader>
        {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {!preview ? (
          <form onSubmit={review} className="space-y-5">
            <fieldset disabled={loading} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor={`${id}-name`}>SMS list name</Label><Input id={`${id}-name`} value={name} maxLength={120} required placeholder="e.g. Katagata — July 2026" onChange={e => { resetPreview(); setName(e.target.value) }} /></div>
                <div className="space-y-2"><Label htmlFor={`${id}-purpose`}>Message purpose</Label><select id={`${id}-purpose`} className={selectClass} value={category} onChange={e => { resetPreview(); setCategory(e.target.value); setOnlyWithBalance(false) }}>{SMS_PURPOSES.map(p => <option key={p}>{p}</option>)}</select></div>
                <div className="space-y-2"><Label htmlFor={`${id}-scheme`}>Water scheme</Label><select id={`${id}-scheme`} className={selectClass} value={schemeId} onChange={e => { resetPreview(); setSchemeId(e.target.value) }}><option value="all">All permitted schemes</option>{schemes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                <div className="space-y-2"><Label htmlFor={`${id}-template`}>Message template</Label><select id={`${id}-template`} className={selectClass} value={templateId} disabled={manual} onChange={e => { resetPreview(); setTemplateId(e.target.value) }}><option value="default">{category === "Bill Reminders" ? "Default billing reminder" : category === "Seasonal Greetings" ? "Default seasonal greeting" : "Default account alert"}</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={manual} onChange={e => { resetPreview(); setManual(e.target.checked) }} />Write a custom message</label>
              {manual && <div className="space-y-2"><Label htmlFor={`${id}-message`}>SMS message</Label><Textarea id={`${id}-message`} required value={message} maxLength={1600} placeholder="Dear {{name}}, your amount due for {{period}} is UGX {{balance}}." onChange={e => { resetPreview(); setMessage(e.target.value) }} /><p className="text-xs text-muted-foreground">Available fields: {"{{name}}, {{account}}, {{bill_number}}, {{period}}, {{balance}}"}. The review shows the completed message.</p></div>}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyWithBalance} onChange={e => { resetPreview(); setOnlyWithBalance(e.target.checked) }} />Only include customers with an amount due above zero</label>
              <div className="space-y-2"><Label htmlFor={`${id}-file`}>Pegasus CSV or Excel file</Label>
                <div className="rounded-lg border-2 border-dashed p-5 text-center" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (loading) return; if (e.dataTransfer.files.length !== 1) { setError("Choose one file at a time"); return } chooseFile(e.dataTransfer.files[0]) }}>
                  <Upload className="mx-auto mb-2 h-6 w-6 text-slate-400" /><p className="break-all text-sm font-medium">{file?.name || "Drop one file here or choose a file"}</p>
                  <input id={`${id}-file`} type="file" accept=".csv,.xlsx" className="mt-3 max-w-full text-sm" onChange={e => chooseFile(e.target.files?.[0] || null)} />
                  <p className="mt-2 text-xs text-muted-foreground">CSV or .xlsx, up to 10 MB and 50,000 rows. The source file is not changed.</p>
                </div>
              </div>
              <div className="rounded-lg border bg-slate-50 p-4 text-sm"><p className="font-medium">Supported Pegasus columns</p><p className="mt-1 break-words font-mono text-xs">MeterRef · Phone · BillNumber · CustomerName · Period · AccountBalance</p><p className="mt-2 text-xs text-muted-foreground">Columns can be in any order. BillNumber is optional. Period 202607 displays as July 2026, and a full nine-digit Uganda phone number is converted to +256 format. Older five-column lists without headers are also supported. Default billing reminders use a thank-you below UGX 1,500; customers already queued or messaged this active billing period are excluded.</p><Button type="button" variant="ghost" size="sm" className="mt-2 px-0 text-sky-700" onClick={downloadSample}><Download className="mr-2 h-4 w-4" />Download sample CSV</Button></div>
            </fieldset>
            <div className="flex justify-end gap-3 border-t pt-4"><Button type="button" variant="outline" disabled={loading} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Review import</Button></div>
          </form>
        ) : (
          <div className="space-y-5">
            <p className="text-sm"><strong>{name}</strong> · {preview.format} · {preview.sheetName}</p>
            <div className="grid grid-cols-3 gap-3 text-center">{[["Rows in file", preview.counts.total], ["Ready to include", preview.counts.ready], ["Excluded rows", excluded]].map(([label, count]) => <div key={label} className="rounded-lg border p-3"><p className="text-2xl font-semibold">{count}</p><p className="text-xs text-muted-foreground">{label}</p></div>)}</div>
            <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">Matched file columns</summary><dl className="mt-2 grid gap-1 sm:grid-cols-2">{preview.columns.map(c => <div key={c.label}><dt className="inline font-mono text-xs">{c.source}</dt><dd className="inline text-xs text-muted-foreground"> → {c.label}</dd></div>)}</dl></details>
            {preview.counts.unlinked > 0 && <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">{preview.counts.unlinked} recipients are not linked to customer profiles. Their imported names and references will be retained in this SMS list.</p>}
            <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[760px] text-left text-xs"><caption className="p-3 text-left text-sm font-medium">Recipient preview — first {preview.recipients.length} of {preview.counts.ready}</caption><thead className="bg-slate-50"><tr>{["Customer reference", "Phone number", "Customer name", "Bill number", "Billing period", "Amount due (UGX)"].map(label => <th key={label} className="p-2 font-medium">{label}</th>)}</tr></thead><tbody>{preview.recipients.map(r => <tr key={r.rowNumber} className="border-t"><td className="p-2 font-mono">{r.reference}</td><td className="whitespace-nowrap p-2 font-mono">{r.phoneNumber}</td><td className="p-2">{r.customerName}</td><td className="p-2 font-mono">{r.billNumber || "—"}</td><td className="whitespace-nowrap p-2">{r.billingPeriod}</td><td className="p-2 text-right tabular-nums">{money(r.balance)}</td></tr>)}</tbody></table></div>
            {preview.recipients.length > 0 && <div className="space-y-2 rounded-lg border bg-slate-50 p-4"><Label htmlFor={`${id}-sample`}>Sample SMS</Label><select id={`${id}-sample`} className={selectClass} value={sampleIndex} onChange={e => setSampleIndex(Number(e.target.value))}>{preview.recipients.map((r, index) => <option key={r.rowNumber} value={index}>{r.customerName} — {r.phoneNumber}</option>)}</select><p className="whitespace-pre-wrap break-words rounded-md bg-white p-3 text-sm">{preview.recipients[sampleIndex]?.message}</p></div>}
            {excluded > 0 && <div className="space-y-3 rounded-lg border border-amber-200 p-4 text-sm"><p className="font-medium">Review excluded rows</p><p className="text-xs text-muted-foreground">{preview.counts.invalid} invalid · {preview.counts.duplicates} duplicates · {preview.counts.outsideScope} unavailable or outside the selected schemes · {preview.counts.withoutDebt} zero/credit balances · {preview.counts.alreadyContacted} already contacted</p><div className="max-h-48 space-y-2 overflow-y-auto">{preview.issues.map(issue => <p key={issue.rowNumber} className="text-xs"><strong>Row {issue.rowNumber} — {issue.reference || "No reference"}:</strong> {issue.reason}</p>)}</div>{preview.issueCount > preview.issueLimit && <p className="text-xs">Showing the first {preview.issueLimit} excluded rows. Correct the source file and review again to check the remaining rows.</p>}<label className="flex items-center gap-2"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} />I have reviewed the exclusions and want to include only ready recipients</label></div>}
            <p className="text-xs text-muted-foreground">{preview.counts.thanked} recipients will receive a thank-you because their balance is below UGX 1,500.</p>
            <p className="text-xs text-muted-foreground">This creates a draft for submission and approval. It does not send SMS or update customer balances. Approving and sending later uses your SMS provider and its charges.</p>
            <div className="flex justify-between gap-3 border-t pt-4"><Button type="button" variant="outline" disabled={loading} onClick={resetPreview}><ArrowLeft className="mr-2 h-4 w-4" />Back to import</Button><Button type="button" disabled={loading || !preview.counts.ready || (excluded > 0 && !accepted)} onClick={createList}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save draft SMS list ({preview.counts.ready})</Button></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
