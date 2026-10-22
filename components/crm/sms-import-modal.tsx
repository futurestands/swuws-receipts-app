"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SearchableSelect } from "@/components/ui/searchable-select"
import {
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
import { Plus, Loader2 } from "lucide-react"

export function SmsImportModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [category, setCategory] = useState("Bill Reminders")
  const [loading, setLoading] = useState(false)

  const [message, setMessage] = useState("")
  const [useManualMessage, setUseManualMessage] = useState(false)
  const [templateId, setTemplateId] = useState("default")
  const [templates, setTemplates] = useState<{ id: string; name: string; code: string }[]>([])
  const [selectedSchemeId, setSelectedSchemeId] = useState("all")
  const [selectedBranchId, setSelectedBranchId] = useState("all")
  const [schemes, setSchemes] = useState<{ id: string; name: string; branchId: string | null }[]>([])
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [audience, setAudience] = useState<{ key: string; count: number | null; skipped: number; alreadyContacted: number } | null>(null)
  const audienceKey = JSON.stringify([selectedSchemeId, selectedBranchId, category])
  const hasSelection = selectedSchemeId !== "all" || selectedBranchId !== "all"
  const currentAudience = audience?.key === audienceKey ? audience : null
  const audienceCount = currentAudience?.count ?? null
  const audienceSkipped = currentAudience?.skipped ?? 0
  const audienceAlreadyContacted = currentAudience?.alreadyContacted ?? 0
  const counting = open && hasSelection && !currentAudience

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

  useEffect(() => {
    if (!open || !hasSelection) return
    let cancelled = false
    countSmsAudience({
      schemeId: selectedSchemeId,
      branchId: selectedSchemeId === "all" ? selectedBranchId : undefined,
      category,
    }).then(res => {
      if (!cancelled) setAudience({ key: audienceKey, count: res.count, skipped: res.skipped || 0, alreadyContacted: res.alreadyContacted || 0 })
    }).catch(() => {
      if (!cancelled) setAudience({ key: audienceKey, count: null, skipped: 0, alreadyContacted: 0 })
    })
    return () => { cancelled = true }
  }, [open, hasSelection, audienceKey, selectedSchemeId, selectedBranchId, category])

  function resetForm() {
    setName("")
    setCategory("Bill Reminders")
    setUseManualMessage(false)
    setMessage("")
    setTemplateId("default")
    setSelectedSchemeId("all")
    setSelectedBranchId("all")
    setAudience(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (selectedSchemeId === "all" && selectedBranchId === "all") {
      toast.error("Select an area or a water scheme")
      return
    }
    setLoading(true)
    try {
      const res = await createSmsBatchFromCustomers({
        name,
        category,
        schemeId: selectedSchemeId,
        branchId: selectedSchemeId === "all" ? selectedBranchId : undefined,
        templateId: templateId !== "default" ? templateId : undefined,
        manualMessage: useManualMessage ? message : undefined,
      })
      if (res.ok) {
        const notes = [
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
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!loading) { setOpen(next); if (!next) resetForm() } }}>
      <DialogTrigger className={buttonVariants({ variant: "outline", className: "h-11" })}>
        <Plus className="mr-2 h-4 w-4" />From customer directory
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-700">Create SMS list from customer directory</DialogTitle>
          <DialogDescription>Select existing customers by area or water scheme, then save a draft for approval.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-500">SMS list name</Label>
              <Input
                placeholder="Optional — uses the scheme or area name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-500">Message purpose</Label>
              <Select onValueChange={(val) => setCategory(val || "")} value={category}>
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

          {(
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
                          : "No active customers with a phone number in this selection."
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
                  <SelectItem value="default">Default billing reminder</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!useManualMessage && templateId === "default" && (
                <p className="text-[10px] text-muted-foreground">
                  Only Uganda 07 or 03 numbers (10 digits) are queued. 0700000000 is skipped.
                  Bill reminders go once per account per billing period. Live balance below USh 1,500 gets a thank-you.
                  After approval and sending, failed numbers are emailed to you.
                </p>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="manual-mode"
                checked={useManualMessage}
                onCheckedChange={(checked) => setUseManualMessage(!!checked)}
              />
              <Label htmlFor="manual-mode" className="text-xs font-black uppercase text-primary cursor-pointer">
                Write a custom message
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
                  Placeholders: {"{{name}}"}, {"{{account}}"}, {"{{period}}"}, {"{{balance}}"}.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={
                loading ||
                (
                  (selectedSchemeId === "all" && selectedBranchId === "all") ||
                  counting ||
                  audienceCount === 0
                )
              }
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save draft SMS list
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
