"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatDateTime } from "@/lib/format"
import {
  User,
  Phone,
  Mail,
  MapPin,
  CheckCircle2,
  ClipboardList,
  ShieldCheck,
  MessageSquare,
  Loader2,
  XCircle,
  PlayCircle,
  RotateCcw,
  UserCog
} from "lucide-react"
import {
  resolveComplaint,
  closeComplaint,
  assignComplaint,
  startComplaint,
  reopenComplaint,
  listCrmStaff,
  listCrmDepartments
} from "@/app/actions/crm"
import { useToast } from "@/hooks/use-toast"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { CrmComplaint } from "@/lib/db/schema"

interface ComplaintDetailsSheetProps {
  complaint: CrmComplaint & {
    categoryName?: string;
    assignedToName?: string;
    customerAccount?: string;
    areaName?: string;
  }
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PanelMode = "none" | "resolve" | "assign" | "reopen"

export function ComplaintDetailsSheet({ complaint, open, onOpenChange }: ComplaintDetailsSheetProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [panel, setPanel] = useState<PanelMode>("none")
  const [notes, setNotes] = useState("")
  const [reopenReason, setReopenReason] = useState("")
  const { toast } = useToast()

  // Assignment options are fetched when the dossier opens rather than
  // threaded down through the table and board, both of which render this
  // sheet for every row.
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([])
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [assignee, setAssignee] = useState("")
  const [department, setDepartment] = useState("")
  const [priority, setPriority] = useState("")

  useEffect(() => {
    if (!open) return
    setPanel("none")
    setNotes("")
    setReopenReason("")
    setAssignee(complaint.assignedToId || "unassigned")
    setDepartment(complaint.assignedDepartmentId || "none")
    setPriority(complaint.priority)

    Promise.all([
      listCrmStaff().catch(() => []),
      listCrmDepartments().catch(() => []),
    ]).then(([staffRows, deptRows]) => {
      setStaff(staffRows as { id: string; name: string }[])
      setDepartments(deptRows as { id: string; name: string }[])
    })
  }, [open, complaint.id, complaint.assignedToId, complaint.assignedDepartmentId, complaint.priority])

  if (!complaint) return null

  async function run(action: () => Promise<{ ok: boolean }>, successMessage: string) {
    setLoading(true)
    try {
      const res = await action()
      if (res.ok) {
        toast({ title: "Success", description: successMessage })
        onOpenChange(false)
        router.refresh()
      }
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : String(err), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  function handleResolve() {
    if (!notes.trim()) {
      toast({ title: "Required", description: "Please provide resolution notes.", variant: "destructive" })
      return
    }
    return run(() => resolveComplaint(complaint.id, notes), "Complaint marked as resolved.")
  }

  function handleAssign() {
    return run(
      () => assignComplaint(complaint.id, {
        assignedToId: assignee === "unassigned" ? null : assignee,
        assignedDepartmentId: department === "none" ? null : department,
        priority: priority as "low" | "medium" | "high" | "critical",
      }),
      "Ticket dispatch updated.",
    )
  }

  function handleReopen() {
    if (!reopenReason.trim()) {
      toast({ title: "Required", description: "Please say why the ticket is being reopened.", variant: "destructive" })
      return
    }
    return run(() => reopenComplaint(complaint.id, reopenReason), "Ticket reopened.")
  }

  const statusColors: Record<string, string> = {
    open: "bg-rose-50 text-rose-700 border-rose-100",
    assigned: "bg-amber-50 text-amber-700 border-amber-100",
    in_progress: "bg-sky-50 text-sky-700 border-sky-100",
    resolved: "bg-emerald-50 text-emerald-700 border-emerald-100",
    closed: "bg-slate-50 text-slate-700 border-slate-200",
  }

  const isCompleted = complaint.status === "resolved" || complaint.status === "closed"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[540px] p-0 border-none shadow-2xl flex flex-col bg-slate-50">

        {/* Header */}
        <div className="bg-[#0f172a] p-6 text-white shrink-0">
           <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                 <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/30">
                    <ClipboardList className="h-4 w-4 text-primary" />
                 </div>
                 <SheetTitle className="text-white text-base font-black tracking-tight uppercase">Ticket Dossier</SheetTitle>
              </div>
              <Badge className={cn("px-3 py-0.5 rounded-full text-[10px] font-black uppercase border shadow-sm", statusColors[complaint.status])}>
                 {complaint.status.replace("_", " ")}
              </Badge>
           </div>
           <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-slate-400 font-bold bg-white/5 px-2 py-0.5 rounded uppercase">Ref: {complaint.complaintNumber}</span>
              <span className="h-1 w-1 rounded-full bg-slate-600" />
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{complaint.categoryName || 'General Issue'}</span>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
           <div className="p-6 space-y-8">

              {/* Section 1: Customer */}
              <div className="space-y-4">
                 <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <User className="h-3 w-3" /> Originating Customer
                 </h3>
                 <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Customer Name</p>
                          <p className="text-sm font-black text-slate-800 uppercase mt-0.5">{complaint.complainantName}</p>
                       </div>
                       <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Account Number</p>
                          <p className="text-sm font-mono font-bold text-slate-600 mt-0.5">{complaint.customerAccount || 'N/A'}</p>
                       </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
                       <div className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-slate-300" />
                          <p className="text-xs font-bold text-slate-600">{complaint.complainantPhone}</p>
                       </div>
                       <div className="flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 text-slate-300" />
                          <p className="text-xs font-bold text-slate-600 truncate">{complaint.complainantEmail || 'No Email'}</p>
                       </div>
                    </div>
                    <div className="flex items-start gap-2 pt-2">
                       <MapPin className="h-3.5 w-3.5 text-slate-300 mt-0.5" />
                       <p className="text-xs font-medium text-slate-500 leading-relaxed italic">{complaint.complainantAddress || 'Location not specified'}</p>
                    </div>
                 </div>
              </div>

              {/* Section 2: Ticket Details */}
              <div className="space-y-4">
                 <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <MessageSquare className="h-3 w-3" /> Incident Narrative
                 </h3>
                 <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                    <p className="text-sm text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">
                       {complaint.details}
                    </p>
                    <div className="mt-6 pt-4 border-t border-slate-50 flex items-center justify-between">
                       <div className="flex items-center gap-4">
                          <div>
                             <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Priority</p>
                             <Badge variant="outline" className={cn("mt-1 text-[9px] font-black uppercase tracking-widest border-0 px-0",
                                complaint.priority === 'critical' ? 'text-rose-600' :
                                complaint.priority === 'high' ? 'text-orange-600' : 'text-sky-600')}>
                                {complaint.priority}
                             </Badge>
                          </div>
                          <div className="h-8 w-px bg-slate-100" />
                          <div>
                             <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Language</p>
                             <p className="text-[10px] font-bold text-slate-600 mt-1 uppercase">{complaint.language}</p>
                          </div>
                       </div>
                       <div className="text-right">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Logged At</p>
                          <p className="text-[10px] font-mono font-bold text-slate-500 mt-1">{formatDateTime(complaint.createdAt)}</p>
                       </div>
                    </div>
                 </div>
              </div>

              {/* Section 3: Handler */}
              <div className="space-y-4">
                 <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                       <ShieldCheck className="h-3 w-3" /> Assigned Personnel
                    </h3>
                    {!isCompleted && panel !== "assign" && (
                       <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPanel("assign")}
                          className="h-6 text-[9px] font-black uppercase tracking-widest text-sky-600 gap-1.5"
                       >
                          <UserCog className="h-3 w-3" /> Reassign
                       </Button>
                    )}
                 </div>
                 <div className="bg-emerald-50/30 rounded-2xl p-5 border border-emerald-100/50 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                       <div className="h-10 w-10 rounded-full bg-white border border-emerald-100 flex items-center justify-center text-sm font-black text-emerald-600 shadow-sm">
                          {complaint.assignedToName ? complaint.assignedToName[0] : '?'}
                       </div>
                       <div>
                          <p className="text-[10px] font-bold text-emerald-600/70 uppercase leading-none">Primary Handler</p>
                          <p className="text-sm font-black text-slate-800 uppercase mt-1.5">{complaint.assignedToName || 'Unassigned'}</p>
                       </div>
                    </div>
                    <div className="text-right">
                       <p className="text-[9px] font-bold text-slate-400 uppercase leading-none">Operational Area</p>
                       <p className="text-xs font-bold text-slate-600 mt-1.5 uppercase tracking-tighter">{complaint.areaName || 'Unassigned'}</p>
                    </div>
                 </div>
              </div>

              {/* Dispatch / reassignment */}
              {panel === "assign" && (
                 <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-300">
                    <div className="flex items-center justify-between">
                       <h3 className="text-[10px] font-black text-sky-600 uppercase tracking-widest">Dispatch Ticket</h3>
                       <Button variant="ghost" size="sm" onClick={() => setPanel("none")} className="h-6 text-[9px] font-black uppercase tracking-widest text-slate-400">Cancel</Button>
                    </div>
                    <div className="bg-white rounded-2xl p-4 border-2 border-sky-500 shadow-xl shadow-sky-500/10 space-y-4">
                       <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase">Handler</label>
                          <Select value={assignee} onValueChange={v => setAssignee(v ?? "unassigned")}>
                             <SelectTrigger className="h-9 text-xs font-bold"><SelectValue placeholder="Select staff" /></SelectTrigger>
                             <SelectContent className="max-h-52">
                                <SelectItem value="unassigned" className="text-[10px] italic text-slate-400">-- UNASSIGNED --</SelectItem>
                                {staff.map(s => <SelectItem key={s.id} value={s.id} className="text-xs font-bold">{s.name}</SelectItem>)}
                             </SelectContent>
                          </Select>
                       </div>
                       <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase">Department</label>
                          <Select value={department} onValueChange={v => setDepartment(v ?? "none")}>
                             <SelectTrigger className="h-9 text-xs font-bold"><SelectValue placeholder="Select department" /></SelectTrigger>
                             <SelectContent className="max-h-52">
                                <SelectItem value="none" className="text-[10px] italic text-slate-400">-- NONE --</SelectItem>
                                {departments.map(d => <SelectItem key={d.id} value={d.id} className="text-xs font-bold">{d.name}</SelectItem>)}
                             </SelectContent>
                          </Select>
                       </div>
                       <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase">Priority</label>
                          <Select value={priority} onValueChange={v => setPriority(v ?? "medium")}>
                             <SelectTrigger className="h-9 text-xs font-black uppercase"><SelectValue /></SelectTrigger>
                             <SelectContent>
                                <SelectItem value="low" className="text-[10px] font-black text-blue-600">LOW</SelectItem>
                                <SelectItem value="medium" className="text-[10px] font-black text-slate-600">MEDIUM</SelectItem>
                                <SelectItem value="high" className="text-[10px] font-black text-orange-600">HIGH</SelectItem>
                                <SelectItem value="critical" className="text-[10px] font-black text-rose-600">CRITICAL</SelectItem>
                             </SelectContent>
                          </Select>
                       </div>
                       <Button
                          onClick={handleAssign}
                          disabled={loading}
                          className="w-full h-11 bg-sky-700 hover:bg-sky-800 text-white font-black uppercase tracking-[0.2em] text-[10px]"
                       >
                          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Commit Dispatch"}
                       </Button>
                    </div>
                 </div>
              )}

              {/* Resolution Info if exists */}
              {complaint.status === 'resolved' && complaint.resolutionNotes && (
                 <div className="space-y-4">
                    <h3 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                       <CheckCircle2 className="h-3 w-3" /> Resolution Record
                    </h3>
                    <div className="bg-emerald-600 rounded-2xl p-6 text-white shadow-xl shadow-emerald-900/20">
                       <p className="text-sm font-bold leading-relaxed whitespace-pre-wrap">{complaint.resolutionNotes}</p>
                       <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-100">Resolved {complaint.resolvedAt ? formatDateTime(complaint.resolvedAt) : "N/A"}</p>
                          <CheckCircle2 className="h-4 w-4 text-emerald-200" />
                       </div>
                    </div>
                 </div>
              )}

              {/* Resolution Form */}
              {panel === "resolve" && (
                 <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-300">
                    <div className="flex items-center justify-between">
                       <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Final Resolution Entry</h3>
                       <Button variant="ghost" size="sm" onClick={() => setPanel("none")} className="h-6 text-[9px] font-black uppercase tracking-widest text-slate-400">Cancel</Button>
                    </div>
                    <div className="bg-white rounded-2xl p-4 border-2 border-emerald-500 shadow-xl shadow-emerald-500/10 space-y-4">
                       <Textarea
                          placeholder="Describe the technical or financial fix applied..."
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className="min-h-[100px] border-none focus-visible:ring-0 text-sm font-bold resize-none"
                       />
                       <p className="text-[9px] font-bold text-slate-400 italic">
                          These notes are sent to the customer by SMS, so keep them short and plain.
                       </p>
                       <Button
                          onClick={handleResolve}
                          disabled={loading}
                          className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-[0.2em] text-[10px]"
                       >
                          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Commit Resolution & Notify Customer"}
                       </Button>
                    </div>
                 </div>
              )}

              {/* Reopen form */}
              {panel === "reopen" && (
                 <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-300">
                    <div className="flex items-center justify-between">
                       <h3 className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Reopen Ticket</h3>
                       <Button variant="ghost" size="sm" onClick={() => setPanel("none")} className="h-6 text-[9px] font-black uppercase tracking-widest text-slate-400">Cancel</Button>
                    </div>
                    <div className="bg-white rounded-2xl p-4 border-2 border-amber-500 shadow-xl shadow-amber-500/10 space-y-4">
                       <Textarea
                          placeholder="Why is this ticket being reopened? e.g. customer reports the leak has returned."
                          value={reopenReason}
                          onChange={(e) => setReopenReason(e.target.value)}
                          className="min-h-[90px] border-none focus-visible:ring-0 text-sm font-bold resize-none"
                       />
                       <Button
                          onClick={handleReopen}
                          disabled={loading}
                          className="w-full h-11 bg-amber-600 hover:bg-amber-700 text-white font-black uppercase tracking-[0.2em] text-[10px]"
                       >
                          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reopen & Requeue"}
                       </Button>
                    </div>
                 </div>
              )}
           </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-white border-t border-slate-100 shrink-0 flex items-center gap-3">
           {(complaint.status === 'open' || complaint.status === 'assigned') && panel === "none" && (
              <Button
                 onClick={() => run(() => startComplaint(complaint.id), "Ticket moved to in progress.")}
                 disabled={loading}
                 variant="outline"
                 className="h-12 px-5 border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 font-black uppercase tracking-widest text-[10px]"
              >
                 <PlayCircle className="mr-2 h-4 w-4" /> Start Work
              </Button>
           )}
           {!isCompleted && panel === "none" && (
              <Button
                 onClick={() => setPanel("resolve")}
                 className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest text-xs shadow-lg shadow-emerald-500/20"
              >
                 <CheckCircle2 className="mr-2 h-4 w-4" /> Resolve Ticket
              </Button>
           )}
           {complaint.status === 'resolved' && panel === "none" && (
              <Button
                 onClick={() => run(() => closeComplaint(complaint.id), "Complaint closed successfully.")}
                 disabled={loading}
                 className="flex-1 h-12 bg-slate-900 hover:bg-slate-800 text-white font-black uppercase tracking-widest text-xs"
              >
                 {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><XCircle className="mr-2 h-4 w-4" /> Finalize & Archive</>}
              </Button>
           )}
           {isCompleted && panel === "none" && (
              <Button
                 variant="outline"
                 onClick={() => setPanel("reopen")}
                 className="h-12 px-5 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 font-black uppercase tracking-widest text-[10px]"
              >
                 <RotateCcw className="mr-2 h-4 w-4" /> Reopen
              </Button>
           )}
           <Button variant="outline" onClick={() => onOpenChange(false)} className="h-12 px-6 font-black text-slate-400 text-xs uppercase tracking-widest">
              Close View
           </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
