"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { registerComplaint } from "@/app/actions/crm"
import { toast } from "sonner"
import { Loader2, Plus, User, History } from "lucide-react"
import type { CrmComplaintCategory } from "@/lib/db/schema"
import { format } from "date-fns"

interface RegisterComplaintModalProps {
  categories: CrmComplaintCategory[]
  userName: string
}

export function RegisterComplaintModal({ categories, userName }: RegisterComplaintModalProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const [formData, setFormData] = useState({
    complainantName: "",
    complainantEmail: "",
    complainantPhone: "",
    customerAccount: "",
    complainantAddress: "",
    area: "",
    language: "English",
    categoryId: "",
    details: "",
    priority: "medium" as const,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!formData.complainantName || !formData.complainantPhone || !formData.categoryId || !formData.details) {
      toast.error("Please fill in all required fields")
      return
    }

    setLoading(true)
    try {
      const res = await registerComplaint({
        ...formData,
        complainantEmail: formData.complainantEmail || undefined,
      })
      if (res.ok) {
        toast.success(`Complaint ${res.complaintNumber} registered successfully.`)
        setOpen(false)
        setFormData({
          complainantName: "",
          complainantEmail: "",
          complainantPhone: "",
          customerAccount: "",
          complainantAddress: "",
          area: "",
          language: "English",
          categoryId: "",
          details: "",
          priority: "medium",
        })
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to register complaint")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-11 bg-primary hover:bg-primary/90 shadow-sm transition-all hover:shadow-md">
          <Plus className="mr-2 h-4 w-4" /> Register Complaint
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="text-xl font-bold text-slate-700 flex items-center gap-2">
             Register Complaint
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-6">
          <div className="lg:col-span-2">
            <h3 className="text-sm font-bold text-sky-700 uppercase mb-4 flex items-center gap-2">
               <User className="h-4 w-4" /> Details
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase text-slate-500">Complainant's Name</Label>
                  <Input
                    placeholder="Enter name"
                    value={formData.complainantName}
                    onChange={(e) => setFormData(prev => ({ ...prev, complainantName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase text-slate-500">Email</Label>
                  <Input
                    type="email"
                    placeholder="example@mail.com"
                    value={formData.complainantEmail}
                    onChange={(e) => setFormData(prev => ({ ...prev, complainantEmail: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase text-slate-500">Phone number</Label>
                  <Input
                    placeholder="+256775123456"
                    value={formData.complainantPhone}
                    onChange={(e) => setFormData(prev => ({ ...prev, complainantPhone: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase text-slate-500">Customer registration number</Label>
                  <Input
                    placeholder="60000..."
                    value={formData.customerAccount}
                    onChange={(e) => setFormData(prev => ({ ...prev, customerAccount: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase text-slate-500">Address</Label>
                  <Input
                    placeholder="Street/Village"
                    value={formData.complainantAddress}
                    onChange={(e) => setFormData(prev => ({ ...prev, complainantAddress: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase text-slate-500">Area</Label>
                  <Select
                    onValueChange={(val) => setFormData(prev => ({ ...prev, area: val || "" }))}
                    value={formData.area}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Area" />
                    </SelectTrigger>
                    <SelectContent>
                       <SelectItem value="Kabale">Kabale</SelectItem>
                       <SelectItem value="Mbarara">Mbarara</SelectItem>
                       <SelectItem value="Bushenyi">Bushenyi</SelectItem>
                       <SelectItem value="Kanungu">Kanungu</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase text-slate-500">Language</Label>
                  <Select
                    onValueChange={(val) => setFormData(prev => ({ ...prev, language: val || "English" }))}
                    value={formData.language}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Language" />
                    </SelectTrigger>
                    <SelectContent>
                       <SelectItem value="English">English</SelectItem>
                       <SelectItem value="Luganda">Luganda</SelectItem>
                       <SelectItem value="Runyankore-Rukiga">Runyankore-Rukiga</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase text-slate-500">Complaint Type/category</Label>
                  <Select
                    onValueChange={(val) => setFormData(prev => ({ ...prev, categoryId: val || "" }))}
                    value={formData.categoryId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Category" />
                    </SelectTrigger>
                    <SelectContent>
                       {categories.map(c => (
                         <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                       ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase text-slate-500">Complaint Details</Label>
                <Textarea
                  placeholder="Describe the issue in detail..."
                  className="min-h-[120px] resize-none"
                  value={formData.details}
                  onChange={(e) => setFormData(prev => ({ ...prev, details: e.target.value }))}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="submit" className="bg-[#10b981] hover:bg-[#059669] text-white font-bold h-11 px-8" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save complaint details...
                </Button>
              </div>
            </form>
          </div>

          <div className="border-l pl-6 hidden lg:block">
            <h3 className="text-sm font-bold text-sky-700 uppercase mb-4 flex items-center gap-2">
               <History className="h-4 w-4" /> Logs
            </h3>

            <div className="relative space-y-6 before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
               <div className="relative flex items-center justify-between md:justify-start">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full border border-slate-200 bg-white text-sky-500 shadow-sm z-10 shrink-0">
                     <Plus className="h-4 w-4" />
                  </div>
                  <div className="ml-4">
                     <p className="text-xs font-bold text-slate-700">Creating</p>
                     <p className="text-[10px] text-slate-400 font-medium">{format(new Date(), "yyyy-MM-dd")}</p>
                     <p className="text-[9px] uppercase font-black text-slate-500 mt-0.5">{userName}</p>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
