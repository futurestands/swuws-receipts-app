"use client"

import { useState } from "react"
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
  XCircle
} from "lucide-react"
import { resolveComplaint, closeComplaint } from "@/app/actions/crm"
import { useToast } from "@/hooks/use-toast"
import { Textarea } from "@/components/ui/textarea"
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

export function ComplaintDetailsSheet({ complaint, open, onOpenChange }: ComplaintDetailsSheetProps) {
  const [loading, setLoading] = useState(false)
  const [notes, setNotes] = useState("")
  const [showResolveForm, setShowResolveForm] = useState(false)
  const { toast } = useToast()

  if (!complaint) return null

  async function handleResolve() {
    if (!notes.trim()) {
      toast({ title: "Required", description: "Please provide resolution notes.", variant: "destructive" })
      return
    }
    setLoading(true)
    try {
      const res = await resolveComplaint(complaint.id, notes)
      if (res.ok) {
        toast({ title: "Success", description: "Complaint marked as resolved." })
        onOpenChange(false)
      }
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : String(err), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  async function handleClose() {
    setLoading(true)
    try {
      const res = await closeComplaint(complaint.id)
      if (res.ok) {
        toast({ title: "Success", description: "Complaint closed successfully." })
        onOpenChange(false)
      }
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : String(err), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const statusColors: Record<string, string> = {
    open: "bg-rose-50 text-rose-700 border-rose-100",
    assigned: "bg-amber-50 text-amber-700 border-amber-100",
    resolved: "bg-emerald-50 text-emerald-700 border-emerald-100",
    closed: "bg-slate-50 text-slate-700 border-slate-200",
  }

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
                 {complaint.status}
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
                 <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <ShieldCheck className="h-3 w-3" /> Assigned Personnel
                 </h3>
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

              {/* Resolution Info if exists */}
              {complaint.status === 'resolved' && (
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
              {showResolveForm && (
                 <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-300">
                    <div className="flex items-center justify-between">
                       <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Final Resolution Entry</h3>
                       <Button variant="ghost" size="sm" onClick={() => setShowResolveForm(false)} className="h-6 text-[9px] font-black uppercase tracking-widest text-slate-400">Cancel</Button>
                    </div>
                    <div className="bg-white rounded-2xl p-4 border-2 border-emerald-500 shadow-xl shadow-emerald-500/10 space-y-4">
                       <Textarea
                          placeholder="Describe the technical or financial fix applied..."
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className="min-h-[100px] border-none focus-visible:ring-0 text-sm font-bold resize-none"
                       />
                       <Button
                          onClick={handleResolve}
                          disabled={loading}
                          className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-[0.2em] text-[10px]"
                       >
                          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Commit Resolution & Close Dossier"}
                       </Button>
                    </div>
                 </div>
              )}
           </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-white border-t border-slate-100 shrink-0 flex items-center gap-4">
           {complaint.status !== 'resolved' && complaint.status !== 'closed' && !showResolveForm && (
              <Button
                 onClick={() => setShowResolveForm(true)}
                 className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest text-xs shadow-lg shadow-emerald-500/20"
              >
                 <CheckCircle2 className="mr-2 h-4 w-4" /> Resolve Ticket
              </Button>
           )}
           {complaint.status === 'resolved' && (
              <Button
                 onClick={handleClose}
                 disabled={loading}
                 className="flex-1 h-12 bg-slate-900 hover:bg-slate-800 text-white font-black uppercase tracking-widest text-xs"
              >
                 {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><XCircle className="mr-2 h-4 w-4" /> Finalize & Archive</>}
              </Button>
           )}
           <Button variant="outline" onClick={() => onOpenChange(false)} className="h-12 px-8 font-black text-slate-400 text-xs uppercase tracking-widest">
              Close View
           </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
