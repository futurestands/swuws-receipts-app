"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SearchableSelect } from "@/components/ui/searchable-select"
import {
  importSmsBatch,
  listCrmSmsTemplates,
  countSmsAudience,
  createSmsBatchFromCustomers,
} from "@/app/actions/crm"
import { getAuthorizedSchemes } from "@/app/actions/billing"
import { listActiveBranches } from "@/app/actions/receipts"
import { toast } from "sonner"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { useRouter } from "next/navigation"
import { Plus, Loader2, Upload, Download } from "lucide-react"
import { parseSmsBalanceFilter } from "@/lib/sms-balance-filter"
import { parseSmsDueDate } from "@/lib/sms-due-date"
import { SmsTemplatePreview } from "@/components/crm/sms-template-preview"
import { defaultSmsTemplate } from "@/lib/sms-template-preview"
import { cn } from "@/lib/utils"

import { PEGASUS_SAMPLE_CSV as SAMPLE_CSV } from "@/lib/sms-file-import-sample"

export function SmsImportModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<"directory" | "csv">("directory")
  const [name, setName] = useState("")
  const [category, setCategory] = useState("Bill Reminders")
  const [file, setFile] = useState<File | null>(null)
  const [dueDate, setDueDate] = useState("")
  const [loading, setLoading] = useState(false)

  const [message, setMessage] = useState("")
  const [useManualMessage, setUseManualMessage] = useState(false)
  const [templateId, setTemplateId] = useState("default")
  const [templates, setTemplates] = useState<{ id: string; name: string; code: string }[]>([])
  const [selectedSchemeId, setSelectedSchemeId] = useState("all")
  const [selectedBranchId, setSelectedBranchId] = useState("all")
  const [schemes, setSchemes] = useState<{ id: string; name: string; branchId: string | null }[]>([])
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [audienceResult, setAudienceResult] = useState<{ key: string; count: number | null; skipped: number; alreadyContacted: number } | null>(null)
  const [minBalance, setMinBalance] = useState("")
  const [maxBalance, setMaxBalance] = useState("")
  let balanceError = ""
  try { parseSmsBalanceFilter({ minBalance, maxBalance, category }) } catch (error) { balanceError = error instanceof Error ? error.message : "Invalid balance range" }

  useEffect(() => {
    if (!open) return
    getAuthorizedSchemes().then((data) => setSchemes(data || [])).catch(() => setSchemes([]))
    listActiveBranches().then((data) => setBranches(data || [])).catch(() => setBranches([]))
    listCrmSmsTemplates()
      .then((rows) => setTemplates(rows || []))
      .catch(() => setTemplates([]))
  }, [open])

  const visibleSchemes = selectedBranchId === "all"
    ? schemes
    : schemes.filter((s) => s.branchId === selectedBranchId)

  const audienceKey = JSON.stringify([open, source, selectedSchemeId, selectedBranchId, category, minBalance, maxBalance])
  const canCount = open && source === "directory" && !balanceError && (selectedSchemeId !== "all" || selectedBranchId !== "all")
  const currentAudience = audienceResult?.key === audienceKey ? audienceResult : null
  const audienceCount = currentAudience?.count ?? null
  const audienceSkipped = currentAudience?.skipped ?? 0
  const audienceAlreadyContacted = currentAudience?.alreadyContacted ?? 0
  const counting = canCount && !currentAudience

  useEffect(() => {
    if (!canCount) return
    let cancelled = false
    countSmsAudience({
      schemeId: selectedSchemeId,
      branchId: selectedSchemeId === "all" ? selectedBranchId : undefined,
      category,
      minBalance,
      maxBalance,
    }).then(res => {
      if (!cancelled) setAudienceResult({ key: audienceKey, count: res.count, skipped: res.skipped || 0, alreadyContacted: res.alreadyContacted || 0 })
    }).catch(() => {
      if (!cancelled) setAudienceResult({ key: audienceKey, count: null, skipped: 0, alreadyContacted: 0 })
    })
    return () => { cancelled = true }
  }, [canCount, audienceKey, selectedSchemeId, selectedBranchId, category, minBalance, maxBalance])

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "swuws-pegasus-sms-sample.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  function resetForm() {
    setMinBalance("")
    setMaxBalance("")
    setName("")
    setCategory("Bill Reminders")
    setFile(null)
    setDueDate("")
    setUseManualMessage(false)
    setMessage("")
    setTemplateId("default")
    setSelectedSchemeId("all")
    setSelectedBranchId("all")
    setAudienceResult(null)
    setSource("directory")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (source === "directory") {
      if (balanceError) { toast.error(balanceError); return }
      if (selectedSchemeId === "all" && selectedBranchId === "all") {
        toast.error("Select an area or a water scheme")
        return
      }
      setLoading(true)
      try {
        const res = await createSmsBatchFromCustomers({
          name,
          category,
          minBalance,
          maxBalance,
          schemeId: selectedSchemeId,
          branchId: selectedSchemeId === "all" ? selectedBranchId : undefined,
          templateId: templateId !== "default" ? templateId : undefined,
          manualMessage: useManualMessage ? message : undefined,
        })
        if (res.ok) {
          const notes = [
            res.summary.duplicateRecipients > 0 ? `${res.summary.duplicateRecipients} duplicate recipient(s) skipped` : null,
            res.summary.skippedNumbers > 0 ? `${res.summary.skippedNumbers} unusable number(s) skipped` : null,
            res.summary.alreadyContacted > 0 ? `${res.summary.alreadyContacted} already messaged this period` : null,
            res.summary.thanked > 0 ? `${res.summary.thanked} thank-you(s) for balance below USh 1,500` : null,
          ].filter(Boolean)
          toast.success(
            `Saved ${res.summary.queued} message(s) for ${res.summary.scopeName} as a draft. Submit it for approval before it can be sent.${notes.length ? ` ${notes.join(". ")}.` : ""}`,
          )
          setOpen(false)
          resetForm()
          router.refresh()
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Could not create the list")
      } finally {
        setLoading(false)
      }
      return
    }

    if (!name.trim()) {
      toast.error("List name is required")
      return
    }
    if (!file) {
      toast.error("Please attach a Pegasus Excel or CSV file")
      return
    }

    try { parseSmsDueDate(dueDate) } catch (error) { toast.error(error instanceof Error ? error.message : "Invalid due date"); return }
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("dueDate", dueDate)
      formData.append("name", name)
      formData.append("category", category)
      formData.append("schemeId", selectedSchemeId)
      formData.append("branchId", selectedBranchId)
      if (useManualMessage && message.trim()) {
        formData.append("manualMessage", message)
      } else if (templateId && templateId !== "default") {
        formData.append("templateId", templateId)
      }

      const res = await importSmsBatch(formData)
      if (res.ok) {
        const { queued, skippedNumbers, filteredByScheme, thanked, alreadyContacted } = res.summary
        const notes = [
          res.summary.duplicateRecipients > 0 ? `${res.summary.duplicateRecipients} duplicate recipient(s) skipped` : null,
          skippedNumbers > 0 ? `${skippedNumbers} unusable number(s) skipped` : null,
          filteredByScheme > 0 ? `${filteredByScheme} outside the selected scheme` : null,
          alreadyContacted > 0 ? `${alreadyContacted} already messaged this period` : null,
          thanked > 0 ? `${thanked} thank-you(s) for balance below USh 1,500` : null,
        ].filter(Boolean)

        toast.success(
          `Saved ${queued} message(s) as a draft. Submit it for approval before it can be sent.${notes.length ? ` ${notes.join(", ")}.` : ""}`,
        )
        setOpen(false)
        resetForm()
        router.refresh()
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Import Failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetForm() }}>
      <DialogTrigger asChild>
        <Button className="h-11 bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all hover:shadow-md">
          <Plus className="mr-2 h-4 w-4" /> Create contact list
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-700">Create contact list</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="flex bg-muted p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setSource("directory")}
              className={cn("flex-1 text-[10px] font-bold py-2 rounded-md transition-all", source === "directory" ? "bg-white shadow-sm text-primary" : "text-muted-foreground")}
            >
              From scheme or area
            </button>
            <button
              type="button"
              onClick={() => setSource("csv")}
              className={cn("flex-1 text-[10px] font-bold py-2 rounded-md transition-all", source === "csv" ? "bg-white shadow-sm text-primary" : "text-muted-foreground")}
            >
              Upload Excel / CSV
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-500">List name</Label>
              <Input
                placeholder={source === "directory" ? "Optional — uses the scheme or area name" : "e.g. KARENGAMYAMBI"}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-500">Category</Label>
              <Select onValueChange={(val) => { setCategory(val || "Bill Reminders"); setTemplateId("default") }} value={category}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Bill Reminders">Bill Reminders</SelectItem>
                  <SelectItem value="Seasonal Greetings">Seasonal Greetings</SelectItem>
                  <SelectItem value="Alerts">Alerts</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-500">Area</Label>
              <SearchableSelect
                value={selectedBranchId}
                onValueChange={(val) => {
                  setSelectedBranchId(val || "all")
                  setSelectedSchemeId("all")
                }}
                options={[
                  { value: "all", label: "All areas" },
                  ...branches.map((b) => ({ value: b.id, label: b.name })),
                ]}
                placeholder="All areas"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-500">Water scheme</Label>
              <SearchableSelect
                value={selectedSchemeId}
                onValueChange={(val) => setSelectedSchemeId(val || "all")}
                options={[
                  {
                    value: "all",
                    label: selectedBranchId === "all" ? "Select a scheme" : "All schemes in this area",
                  },
                  ...visibleSchemes.map((s) => ({ value: s.id, label: s.name })),
                ]}
                placeholder="Select a scheme"
              />
            </div>
          </div>

          {source === "directory" && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sms-min-balance">Minimum outstanding balance (UGX)</Label>
                  <Input id="sms-min-balance" type="number" min="0" step="0.01" value={minBalance} onChange={e => setMinBalance(e.target.value)} placeholder="No minimum" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sms-max-balance">Maximum outstanding balance (UGX)</Label>
                  <Input id="sms-max-balance" type="number" min="0" step="0.01" value={maxBalance} onChange={e => setMaxBalance(e.target.value)} placeholder="No maximum" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Both limits are included. Uses the live account balance shown in the SMS. Bill reminders exclude zero and credit balances. Balances are checked again when saving.</p>
              {balanceError && <p role="alert" className="text-xs text-red-600">{balanceError}</p>}
            </div>
          )}

          {source === "directory" && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
              {selectedSchemeId === "all" && selectedBranchId === "all"
                ? "Pick an area, a scheme, or both. A scheme is narrower than an area."
                : counting
                  ? "Counting customers with a usable phone number…"
                  : audienceCount === null
                    ? "Could not count this selection."
                    : audienceCount === 0
                      ? audienceAlreadyContacted > 0
                        ? `${audienceAlreadyContacted.toLocaleString()} already messaged this billing period. No new numbers to queue.`
                        : audienceSkipped > 0
                          ? "Customers in this selection have phone fields, but none can be used for SMS."
                          : "No active customers with a usable phone match this balance range."
                      : `${audienceCount.toLocaleString()} customer(s) with a usable phone number will be queued.${
                          audienceAlreadyContacted > 0
                            ? ` ${audienceAlreadyContacted.toLocaleString()} already messaged this period will be skipped.`
                            : ""
                        }${
                          audienceSkipped > 0
                            ? ` ${audienceSkipped.toLocaleString()} on file could not be used.`
                            : ""
                        }`}
            </p>
          )}

          {source === "csv" && (
            <div className="space-y-2">
              <Label htmlFor="sms-payment-due-date">Payment due date (optional)</Label>
              <Input id="sms-payment-due-date" type="date" min="1900-01-01" max="9999-12-31" value={dueDate} onChange={event => setDueDate(event.target.value)} aria-describedby="sms-due-date-help" />
              <p id="sms-due-date-help" className="text-xs text-muted-foreground">Format: DD/MM/YYYY. Enter the deadline here, not in Excel. It applies to this uploaded list. Leave blank for no deadline. Default bill reminders include it automatically; other templates can use {"{{due_date}}"}.</p>
            </div>
          )}

          <div className="space-y-4 border p-4 rounded-xl bg-slate-50/50">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-500">Message template</Label>
              <Select
                onValueChange={(val) => setTemplateId(val || "default")}
                value={templateId}
                disabled={useManualMessage}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="default">Default: {defaultSmsTemplate(category).label}</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <SmsTemplatePreview dueDate={source === "csv" ? dueDate : undefined} category={category} templateId={templateId} source={source} manualMessage={useManualMessage ? message : undefined} />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="manual-mode"
                checked={useManualMessage}
                onCheckedChange={(checked) => setUseManualMessage(!!checked)}
              />
              <Label htmlFor="manual-mode" className="text-xs font-black uppercase text-primary cursor-pointer">
                Custom Message Mode (Manual)
              </Label>
            </div>

            {useManualMessage && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                <Label className="text-[10px] font-bold uppercase text-slate-400">Your Message</Label>
                <Textarea
                  placeholder="Type your custom notice here..."
                  className="min-h-[80px] text-xs font-bold"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <p className="text-[9px] text-muted-foreground italic">
                  Pegasus placeholders (file uploads): {"{{CustomerName}}"}, {"{{MeterRef}}"}, {"{{Phone}}"}, {"{{BillNumber}}"}, {"{{Period}}"}, {"{{AccountBalance}}"}. Optional deadline: {"{{due_date}}"}. Existing {"{{name}}"}, {"{{account}}"}, {"{{period}}"}, {"{{balance}}"} remain supported.
                </p>
              </div>
            )}
          </div>

          {source === "csv" && (
            <>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-slate-500">Attach Pegasus Excel or CSV File</Label>
                <div
                  className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2 hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => document.getElementById("sms-file-input")?.click()}
                >
                  <Upload className="h-8 w-8 text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">
                    {file ? file.name : "Choose Files"}
                  </p>
                  <p className="text-[10px] text-slate-400">Drag & Drop or Click to browse</p>
                  <input
                    id="sms-file-input"
                    type="file"
                    accept=".csv,.xlsx"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Pegasus export format — keep the header row:</p>
                <ul className="text-[11px] space-y-1 text-slate-600 font-mono">
                  <li>Column A - MeterRef</li>
                  <li>Column B - Phone</li>
                  <li>Column C - BillNumber</li>
                  <li>Column D - CustomerName</li>
                  <li>Column E - Period</li>
                  <li>Column F - AccountBalance</li>
                </ul>
                <p className="text-[9px] text-slate-400 italic mt-2">
                  Upload the original Pegasus .xlsx or .csv export, including its headers. Columns are matched by header name.
                  Period uses YYYYMM (for example 202607 means July 2026). Numeric Uganda phones such as 770000001 are accepted.
                  Existing five-column files without headers are also supported. Invalid rows are reported before a draft is saved.
                </p>
                <Button type="button" variant="ghost" size="sm" className="mt-2 h-7 px-0 text-[10px] font-bold text-sky-700" onClick={downloadSample}>
                  <Download className="h-3 w-3 mr-1" /> Download sample CSV
                </Button>
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={
                (source === "directory" && !!balanceError) ||
                loading ||
                (source === "directory" && (
                  (selectedSchemeId === "all" && selectedBranchId === "all") ||
                  counting ||
                  audienceCount === null ||
                  audienceCount === 0
                ))
              }
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {source === "directory" ? "Create list" : "Create list..."}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
