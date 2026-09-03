"use client"

import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDateTime } from "@/lib/format"
import {
  User,
  Phone,
  MapPin,
  Clock,
  AlertCircle,
  CheckCircle2,
  MessageSquare,
  ArrowRight,
  UserCheck,
  Zap
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { CrmComplaint } from "@/lib/db/schema"
import { ComplaintRowActions } from "./complaint-row-actions"

interface ComplaintCardProps {
  complaint: CrmComplaint & {
    categoryName?: string;
    assignedToName?: string;
    customerAccount?: string;
    areaName?: string;
  }
}

function ComplaintCard({ complaint }: ComplaintCardProps) {
  const statusColors: Record<string, string> = {
    open: "bg-rose-50 text-rose-700 border-rose-100",
    assigned: "bg-amber-50 text-amber-700 border-amber-100",
    resolved: "bg-emerald-50 text-emerald-700 border-emerald-100",
    closed: "bg-slate-50 text-slate-700 border-slate-200",
  }

  const priorityColors: Record<string, string> = {
    critical: "bg-rose-600 text-white animate-pulse",
    high: "bg-orange-500 text-white",
    medium: "bg-sky-500 text-white",
    low: "bg-slate-500 text-white",
  }

  return (
    <Card className="flex flex-col h-full hover:shadow-xl transition-all duration-300 border-2 border-slate-100 group">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <Badge className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-0", priorityColors[complaint.priority])}>
            {complaint.priority}
          </Badge>
          <span className="text-[10px] font-mono font-bold text-slate-400">#{complaint.complaintNumber.slice(-6)}</span>
        </div>
        <CardTitle className="text-sm font-black text-slate-800 uppercase line-clamp-1 group-hover:text-primary transition-colors">
          {complaint.complainantName}
        </CardTitle>
        <p className="text-[10px] font-bold text-slate-500 truncate uppercase tracking-tighter">
          {complaint.categoryName}
        </p>
      </CardHeader>

      <CardContent className="p-4 pt-2 flex-1 space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-slate-600">
            <Phone className="h-3 w-3 opacity-50" />
            <span className="text-[11px] font-bold">{complaint.complainantPhone}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-600">
            <MapPin className="h-3 w-3 opacity-50" />
            <span className="text-[11px] font-medium truncate">{complaint.areaName || "Unknown Area"}</span>
          </div>
        </div>

        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] font-medium text-slate-700 leading-relaxed line-clamp-3 min-h-[60px]">
          {complaint.details}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-50">
          <div className="flex items-center gap-1.5">
             <div className="h-5 w-5 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[8px] font-black text-slate-400">
                {(complaint.assignedToName || "?")[0]}
             </div>
             <span className="text-[10px] font-bold text-slate-500">{complaint.assignedToName || "Unassigned"}</span>
          </div>
          <Badge variant="outline" className={cn("text-[9px] font-black uppercase border px-1.5 h-5", statusColors[complaint.status])}>
            {complaint.status}
          </Badge>
        </div>
      </CardContent>

      <CardFooter className="p-3 pt-0">
        <div className="w-full">
           <ComplaintRowActions complaint={complaint} />
        </div>
      </CardFooter>
    </Card>
  )
}

export function ComplaintsServiceBoard({
  complaints
}: {
  complaints: any[]
}) {
  if (complaints.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border-2 border-dashed border-slate-100 text-slate-400 italic">
        <MessageSquare className="h-12 w-12 opacity-5 mb-4" />
        <p className="text-sm font-medium">No tickets in the current view.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {complaints.map((c) => (
        <ComplaintCard key={c.id} complaint={c} />
      ))}
    </div>
  )
}
