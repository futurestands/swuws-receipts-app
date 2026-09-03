"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { importSmsBatch } from "@/app/actions/crm"
import { toast } from "sonner"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { useEffect } from "react"
import { Plus, Loader2, Upload } from "lucide-react"

export function SmsImportModal() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [category, setCategory] = useState("Bill Reminders")
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  const [message, setMessage] = useState("")
  const [useManualMessage, setUseManualMessage] = useState(false)
  const [selectedSchemeId, setSelectedSchemeId] = useState("all")
  const [schemes, setSchemes] = useState<{id: string, name: string}[]>([])

  // Fetch schemes for the filter
  useEffect(() => {
    import("@/app/actions/settings").then(mod => {
      mod.listWaterSchemes().then(data => setSchemes(data || []))
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!name.trim()) {
      toast.error("List name is required")
      return
    }

    if (!file) {
      toast.error("Please attach a CSV file")
      return
    }

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("name", name)
      formData.append("category", category)
      formData.append("schemeId", selectedSchemeId)
      if (useManualMessage && message.trim()) {
        formData.append("manualMessage", message)
      }

      const res = await importSmsBatch(formData)
      if (res.ok) {
        toast.success(`Imported ${res.summary?.valid} contacts successfully.`)
        setOpen(false)
        setName("")
        setCategory("Bill Reminders")
        setFile(null)
      }
    } catch (err: any) {
      toast.error(err.message || "Import Failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-11 bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all hover:shadow-md">
          <Plus className="mr-2 h-4 w-4" /> Create contact list
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-700">Upload Customer contacts list</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-500">List name</Label>
              <Input
                placeholder="e.g. KARENGAMYAMBI"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-500">Category</Label>
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

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-slate-500">Target Water Scheme</Label>
            <Select onValueChange={(val) => setSelectedSchemeId(val || "all")} value={selectedSchemeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select Scheme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ALL SCHEMES</SelectItem>
                {schemes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4 border p-4 rounded-xl bg-slate-50/50">
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
                <p className="text-[9px] text-muted-foreground italic">Note: Placeholders like {"{{name}}"} are supported if in the CSV.</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-slate-500">Attach CSV Files</Label>
            <div
              className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2 hover:bg-slate-50 transition-colors cursor-pointer"
              onClick={() => document.getElementById('sms-file-input')?.click()}
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
             <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Required Format:</p>
             <ul className="text-[11px] space-y-1 text-slate-600 font-mono">
                <li>Column A - Customer Ref No</li>
                <li>Column B - Customer Phone number</li>
                <li>Column C - Customer Name</li>
                <li>Column D - Billing Period</li>
                <li>Column E - Outstanding Balance</li>
             </ul>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create list...
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
