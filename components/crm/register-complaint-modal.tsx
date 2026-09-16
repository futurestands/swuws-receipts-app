"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { registerComplaint, listUsersByArea, listSchemesByArea, lookupComplaintCustomer } from "@/app/actions/crm"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Plus, User, Tag, UserCheck, ShieldCheck, CheckCircle2, FileText, Search, X } from "lucide-react"
import type { CrmComplaintCategory, CrmDepartment, Branch } from "@/lib/db/schema"
import { format } from "date-fns"
import { useRouter } from "next/navigation"

const formSchema = z.object({
  customerId: z.string().optional().nullable(),
  complainantName: z.string().min(2, "Name is required"),
  complainantEmail: z.string().email().optional().or(z.literal("")),
  complainantPhone: z.string().min(9, "Phone number is required"),
  customerAccount: z.string().optional(),
  complainantAddress: z.string().optional(),
  area: z.string().min(1, "Area is required"),
  schemeId: z.string().optional().nullable(),
  language: z.string().default("English"),
  categoryId: z.string().min(1, "Category is required"),
  details: z.string().min(10, "Please provide more details"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  assignedToId: z.string().optional().nullable(),
  assignedDepartmentId: z.string().optional().nullable(),
})

type CustomerMatch = {
  id: string
  name: string
  phone: string | null
  address: string | null
  customerAccount: string | null
  waterSchemeId: string | null
  branchId: string | null
  schemeName: string | null
}

interface RegisterComplaintModalProps {
  categories: CrmComplaintCategory[]
  areas: Branch[]
  userName: string
}

export function RegisterComplaintModal({ categories, areas, userName }: RegisterComplaintModalProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [areaUsers, setAreaUsers] = useState<{ id: string, name: string, role: string }[]>([])
  const [areaSchemes, setAreaSchemes] = useState<{ id: string, name: string }[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [loadingSchemes, setLoadingSchemes] = useState(false)
  const [lookupQuery, setLookupQuery] = useState("")
  const [matches, setMatches] = useState<CustomerMatch[]>([])
  const [lookingUp, setLookingUp] = useState(false)
  const pendingSchemeId = useRef<string | null>(null)
  const { toast } = useToast()

  // z.input, not z.infer/z.output: fields with .default() (like priority)
  // are optional on the input side and required on the output side --
  // useForm's generic needs the pre-validation (input) shape, since that's
  // what the form actually holds before zodResolver parses it. Using
  // z.infer here caused a real, build-breaking type mismatch between the
  // form's Control/Resolver types and every FormField below it.
  const form = useForm<z.input<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerId: "",
      complainantName: "",
      complainantEmail: "",
      complainantPhone: "",
      customerAccount: "",
      complainantAddress: "",
      area: "",
      schemeId: "",
      language: "English",
      categoryId: "",
      details: "",
      priority: "medium",
      assignedToId: "",
      assignedDepartmentId: "",
    },
  })

  // Mappings to avoid showing UUIDs in the UI (Background use only)
  const areaNameMap = useMemo(() => new Map((areas || []).map(a => [a.id, a.name])), [areas])
  const schemeNameMap = useMemo(() => new Map((areaSchemes || []).map(s => [s.id, s.name])), [areaSchemes])
  const categoryNameMap = useMemo(() => new Map((categories || []).map(c => [c.id, c.name])), [categories])

  // Fetch users and schemes when area changes
  const selectedAreaId = form.watch("area")
  useEffect(() => {
    async function fetchData() {
      if (!selectedAreaId) {
        setAreaUsers([])
        setAreaSchemes([])
        return
      }
      setLoadingUsers(true)
      setLoadingSchemes(true)
      try {
        const [users, schemes] = await Promise.all([
          listUsersByArea(selectedAreaId).catch(() => []),
          listSchemesByArea(selectedAreaId).catch(() => [])
        ])
        setAreaUsers(users || [])
        setAreaSchemes(schemes || [])
      } catch (err) {
        console.error("Forensic: Failed to fetch area data", err)
      } finally {
        setLoadingUsers(false)
        setLoadingSchemes(false)
      }
    }
    fetchData()
  }, [selectedAreaId])

  useEffect(() => {
    if (pendingSchemeId.current && areaSchemes.some(s => s.id === pendingSchemeId.current)) {
      form.setValue("schemeId", pendingSchemeId.current)
      pendingSchemeId.current = null
    }
  }, [areaSchemes, form])

  useEffect(() => {
    const q = lookupQuery.trim()
    if (q.length < 3) {
      setMatches([])
      setLookingUp(false)
      return
    }
    let cancelled = false
    setLookingUp(true)
    const handle = window.setTimeout(async () => {
      try {
        const rows = await lookupComplaintCustomer(q)
        if (!cancelled) {
          setMatches(rows)
          const exact = rows.find(r => (r.customerAccount || "").toLowerCase() === q.toLowerCase())
          if (exact && rows.length === 1) applyCustomerMatch(exact)
        }
      } catch {
        if (!cancelled) setMatches([])
      } finally {
        if (!cancelled) setLookingUp(false)
      }
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [lookupQuery])

  function applyCustomerMatch(match: CustomerMatch) {
    const phone = match.phone && match.phone.toUpperCase() !== "NULL" ? match.phone : ""
    form.setValue("customerId", match.id)
    form.setValue("complainantName", match.name)
    form.setValue("complainantPhone", phone)
    form.setValue("complainantAddress", match.address && match.address.toUpperCase() !== "NULL" ? match.address : "")
    form.setValue("customerAccount", match.customerAccount || "")
    pendingSchemeId.current = match.waterSchemeId
    if (match.branchId) form.setValue("area", match.branchId)
    setLookupQuery(match.customerAccount || match.name)
    setMatches([])
  }

  function clearLinkedCustomer() {
    form.setValue("customerId", "")
    pendingSchemeId.current = null
  }

  // z.input to match the form's own generic above -- values coming out of
  // handleSubmit are checked against this type, not the parsed/output type.
  async function onSubmit(values: z.input<typeof formSchema>) {
    setLoading(true)
    try {
      const res = await registerComplaint({
        ...values,
        customerId: values.customerId || null,
        complainantEmail: values.complainantEmail || undefined,
        assignedToId: values.assignedToId === "unassigned" || !values.assignedToId ? null : values.assignedToId,
        schemeId: values.schemeId || null,
        assignedDepartmentId: values.assignedDepartmentId || null
      })
      if (res.ok) {
        toast({ title: "Success", description: `Complaint ${res.complaintNumber} registered.` })
        setOpen(false)
        form.reset()
        setLookupQuery("")
        setMatches([])
        router.refresh()
      }
    } catch (err) {
      toast({ title: "Submission Error", description: err instanceof Error ? err.message : String(err), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const linkedCustomerId = form.watch("customerId")

  return (
    <Dialog open={open} onOpenChange={(next) => {
      setOpen(next)
      if (!next) {
        setLookupQuery("")
        setMatches([])
      }
    }}>
      <DialogTrigger asChild>
        <Button className="h-9 bg-primary hover:bg-primary/90 shadow-sm transition-all px-4 text-xs font-black">
          <Plus className="mr-1.5 h-3.5 w-3.5" /> REGISTER TICKET
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:!max-w-[800px] !w-[90vw] !h-[70vh] overflow-hidden p-0 border-none shadow-2xl bg-white flex flex-col rounded-2xl animate-in fade-in zoom-in-95 duration-200">

        {/* COMPACT MINIMALIST HEADER - Professional Slate */}
        <div className="bg-[#0f172a] px-6 py-2.5 text-white flex items-center justify-between shrink-0 border-b border-white/5">
           <div className="flex items-center gap-2.5">
              <div className="h-6 w-6 rounded-md bg-primary/20 flex items-center justify-center border border-primary/30">
                 <FileText className="h-3 w-3 text-primary" />
              </div>
              <h2 className="text-[11px] font-black tracking-widest uppercase">Service Ticket Registrar</h2>
           </div>

           <div className="flex items-center gap-2 bg-white/5 px-2.5 py-1 rounded-lg">
              <ShieldCheck className="h-3 w-3 text-emerald-400" />
              <p className="text-[9px] font-black text-white uppercase truncate max-w-[100px]">{userName}</p>
           </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-10">

                {/* 1. CUSTOMER identification */}
                <div className="space-y-6">
                  <div className="flex items-center gap-2.5 border-b border-slate-50 pb-2.5">
                     <User className="h-3.5 w-3.5 text-sky-500" />
                     <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">1. Customer Identification</span>
                     {linkedCustomerId ? (
                       <Badge className="ml-auto h-5 bg-emerald-50 text-emerald-700 border-emerald-100 text-[8px] font-black uppercase tracking-widest">
                         <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> On file
                       </Badge>
                     ) : (
                       <span className="ml-auto text-[8px] font-bold text-slate-400 uppercase tracking-widest">Walk-in OK</span>
                     )}
                  </div>

                  <div className="relative">
                    <label className="text-[8px] font-black text-slate-400 uppercase">Find customer (A/C, name, phone, meter)</label>
                    <div className="relative mt-1.5">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <Input
                        value={lookupQuery}
                        onChange={e => setLookupQuery(e.target.value)}
                        placeholder="Type 3+ characters to fill name, phone, area, scheme..."
                        className="h-8 bg-slate-50 border-slate-200 text-xs font-bold pl-8 pr-8"
                      />
                      {lookingUp && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-slate-400" />}
                      {!lookingUp && lookupQuery && (
                        <button
                          type="button"
                          onClick={() => { setLookupQuery(""); setMatches([]); clearLinkedCustomer() }}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          aria-label="Clear customer search"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    {matches.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-xl max-h-48 overflow-y-auto">
                        {matches.map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => applyCustomerMatch(m)}
                            className="w-full text-left px-3 py-2 hover:bg-sky-50 border-b border-slate-50 last:border-0"
                          >
                            <p className="text-[11px] font-black text-slate-800 uppercase truncate">{m.name}</p>
                            <p className="text-[10px] font-mono text-slate-500">
                              {m.customerAccount || "No A/C"} · {m.phone && m.phone.toUpperCase() !== "NULL" ? m.phone : "No phone"} · {m.schemeName || "No scheme"}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                    {lookupQuery.trim().length >= 3 && !lookingUp && matches.length === 0 && !linkedCustomerId && (
                      <p className="text-[10px] font-bold text-amber-600 mt-1">No match in your area — continue as a walk-in.</p>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-6">
                    <FormField control={form.control} name="complainantName" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[8px] font-black text-slate-400 uppercase">Customer Name</FormLabel>
                        <FormControl><Input placeholder="John Doe" className="h-8 bg-slate-50 border-slate-200 text-xs font-bold" {...field} /></FormControl>
                        <FormMessage className="text-[8px]" />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="complainantPhone" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[8px] font-black text-slate-400 uppercase">Phone Number</FormLabel>
                        <FormControl><Input placeholder="07..." className="h-8 bg-slate-50 border-slate-200 text-xs font-bold" {...field} /></FormControl>
                        <FormMessage className="text-[8px]" />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="customerAccount" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[8px] font-black text-slate-400 uppercase">A/C Number</FormLabel>
                        <FormControl><Input placeholder="60000..." className="h-8 bg-slate-50 border-slate-200 text-xs font-bold" {...field} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                </div>

                {/* 2. CLASSIFICATION logic */}
                <div className="space-y-6">
                  <div className="flex items-center gap-2.5 border-b border-slate-50 pb-2.5">
                     <Tag className="h-3.5 w-3.5 text-amber-500" />
                     <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">2. Issue Classification</span>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                    <FormField control={form.control} name="area" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[8px] font-black text-slate-400 uppercase">Branch / Area</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger className="h-8 bg-slate-50 border-slate-200 text-xs font-bold w-full truncate">
                               {field.value ? (areaNameMap.get(field.value) || "Select...") : "Select Area"}
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-48">
                             {areas.map(a => <SelectItem key={a.id} value={a.id} className="text-xs font-bold">{a.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="schemeId" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[8px] font-black text-slate-400 uppercase flex items-center gap-1.5">Scheme {loadingSchemes && <Loader2 className="h-2 w-2 animate-spin" />}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""} disabled={!selectedAreaId || loadingSchemes}>
                          <FormControl>
                            <SelectTrigger className="h-8 bg-slate-50 border-slate-200 text-xs font-bold w-full truncate">
                               {field.value ? (schemeNameMap.get(field.value) || "Select...") : (selectedAreaId ? "Select Scheme" : "← Area")}
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-48">
                             {(areaSchemes || []).map(s => <SelectItem key={s.id} value={s.id} className="text-xs font-bold">{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="categoryId" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[8px] font-black text-slate-400 uppercase">Category</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                             <SelectTrigger className="h-8 bg-slate-50 border-slate-200 text-xs font-bold truncate">
                                {field.value ? (categoryNameMap.get(field.value) || "Select...") : "Nature of Issue"}
                             </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-48">{categories.map(c => <SelectItem key={c.id} value={c.id} className="text-xs font-bold">{c.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="language" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[8px] font-black text-slate-400 uppercase">Language</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl><SelectTrigger className="h-8 bg-slate-50 border-slate-200 text-xs font-bold"><span className="truncate">{field.value}</span></SelectTrigger></FormControl>
                          <SelectContent>
                             <SelectItem value="English" className="text-xs font-bold">English</SelectItem>
                             <SelectItem value="Luganda" className="text-xs font-bold">Luganda</SelectItem>
                             <SelectItem value="Runyankore" className="text-xs font-bold">Runyankore</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="details" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[8px] font-black text-slate-400 uppercase">Problem Description</FormLabel>
                      <FormControl>
                         <div className="rounded-xl border border-slate-200 bg-slate-50 p-0.5 focus-within:bg-white transition-all shadow-inner">
                            <Textarea placeholder="Detailed technical context..." className="min-h-[80px] border-none focus-visible:ring-0 resize-none text-[13px] p-3 font-bold leading-relaxed" {...field} />
                         </div>
                      </FormControl>
                    </FormItem>
                  )} />
                </div>

                {/* 3. ASSIGNMENT workflow */}
                <div className="space-y-6">
                  <div className="flex items-center gap-2.5 border-b border-slate-50 pb-2.5">
                     <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
                     <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">3. Dispatch & Assignment</span>
                  </div>

                  <div className="grid grid-cols-2 gap-8">
                    <FormField control={form.control} name="assignedToId" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[8px] font-black text-emerald-700 uppercase flex items-center gap-1.5">Staff {loadingUsers && <Loader2 className="h-2 w-2 animate-spin" />}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""} disabled={!selectedAreaId || loadingUsers}>
                          <FormControl><SelectTrigger className="h-9 bg-emerald-50/30 border-emerald-100 text-[11px] font-black text-slate-700 truncate">
                             <span className="truncate">{field.value ? (areaUsers.find(u => u.id === field.value)?.name || "Select...") : "Select staff member"}</span>
                          </SelectTrigger></FormControl>
                          <SelectContent className="max-h-48">
                             <SelectItem value="unassigned" className="text-[10px] text-slate-400 italic">-- LOG ONLY --</SelectItem>
                             {areaUsers.map(u => <SelectItem key={u.id} value={u.id} className="text-xs font-black">{u.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="priority" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[8px] font-black text-slate-400 uppercase">Priority</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl><SelectTrigger className="h-9 bg-slate-50 border-slate-200 text-[11px] font-black uppercase tracking-tighter truncate"><span className="truncate">{field.value}</span></SelectTrigger></FormControl>
                          <SelectContent>
                             <SelectItem value="low" className="text-blue-600 font-black text-[10px]">● LOW</SelectItem>
                             <SelectItem value="medium" className="text-slate-600 font-black text-[10px]">● MEDIUM</SelectItem>
                             <SelectItem value="high" className="text-orange-600 font-black text-[10px]">● HIGH</SelectItem>
                             <SelectItem value="critical" className="text-rose-600 font-black text-[10px] italic">● CRITICAL</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-50">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading} className="h-9 px-6 font-black text-slate-400 text-[9px] uppercase tracking-widest">Discard</Button>
                  <Button type="submit" className="bg-primary hover:bg-primary/90 text-white font-black h-9 px-10 shadow-xl shadow-primary/10 text-[9px] uppercase tracking-[0.2em] rounded-xl" disabled={loading}>
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirm Ticket"}
                  </Button>
                </div>
              </form>
            </Form>
          </div>

          {/* COMPACT SIDEBAR - Minimal footprint */}
          <div className="w-[160px] bg-slate-50/30 border-l border-slate-100 p-4 flex flex-col shrink-0">
             <div className="space-y-4">
                <h3 className="text-[7px] font-black text-slate-300 uppercase tracking-widest">Audit Context</h3>
                <div className="bg-white p-3 rounded-lg border border-slate-100 space-y-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                   <div>
                      <p className="text-[7px] font-black text-slate-400 uppercase leading-none">Timestamp</p>
                      <p className="text-[9px] text-slate-600 font-mono mt-1 font-bold">{format(new Date(), "HH:mm:ss")}</p>
                   </div>
                   <div className="pt-3 border-t border-slate-50">
                      <p className="text-[7px] font-black text-slate-400 uppercase leading-none">Registrar</p>
                      <p className="text-[9px] text-slate-800 font-black mt-1 uppercase truncate">{userName.split(' ')[0]}</p>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
