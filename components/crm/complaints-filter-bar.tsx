"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, RotateCcw, Filter, Loader2 } from "lucide-react"

interface ComplaintsFilterBarProps {
  areas: { id: string; name: string }[]
  staff: { id: string; name: string }[]
}

/**
 * Previously this whole panel was decorative: no <form>, no submit handler,
 * no value/onValueChange on any Select -- every field here did nothing when
 * changed, and the Search button had no click handler at all. The page
 * itself (a Server Component) correctly reads filters from searchParams,
 * but nothing wrote to searchParams. This component closes that gap,
 * following the same useTransition + router.push pattern already used in
 * app/dashboard/customers/customer-search-bar.tsx.
 */
export function ComplaintsFilterBar({ areas, staff }: ComplaintsFilterBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const [no, setNo] = useState(searchParams.get("no") ?? "")
  const [from, setFrom] = useState(searchParams.get("from") ?? "")
  const [till, setTill] = useState(searchParams.get("till") ?? "")
  const [status, setStatus] = useState(searchParams.get("status") ?? "all")
  const [area, setArea] = useState(searchParams.get("area") ?? "all")
  const [staffId, setStaffId] = useState(searchParams.get("staff") ?? "all")

  function applyFilters() {
    const params = new URLSearchParams()
    if (no) params.set("no", no)
    if (from) params.set("from", from)
    if (till) params.set("till", till)
    if (status !== "all") params.set("status", status)
    if (area !== "all") params.set("area", area)
    if (staffId !== "all") params.set("staff", staffId)

    startTransition(() => {
      router.push(`/dashboard/crm/complaints?${params.toString()}`)
    })
  }

  function resetFilters() {
    setNo("")
    setFrom("")
    setTill("")
    setStatus("all")
    setArea("all")
    setStaffId("all")
    startTransition(() => {
      router.push("/dashboard/crm/complaints")
    })
  }

  return (
    <Card className="shadow-sm border-none bg-white">
      <CardHeader className="border-b py-3 bg-slate-50/50 px-6">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-500" />
          <CardTitle className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Master Filter Engine</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 items-end">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase text-slate-400 tracking-tight ml-1">Complaint Ref #</label>
            <Input
              placeholder="Search ID..."
              className="h-10 bg-slate-50 border-slate-200"
              value={no}
              onChange={e => setNo(e.target.value)}
              onKeyDown={e => e.key === "Enter" && applyFilters()}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase text-slate-400 tracking-tight ml-1">Period From</label>
            <Input type="date" className="h-10 bg-slate-50 border-slate-200" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase text-slate-400 tracking-tight ml-1">Period Till</label>
            <Input type="date" className="h-10 bg-slate-50 border-slate-200" value={till} onChange={e => setTill(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase text-slate-400 tracking-tight ml-1">Current Status</label>
            <Select value={status} onValueChange={v => setStatus(v ?? "all")}>
              <SelectTrigger className="h-10 bg-slate-50 border-slate-200 text-xs font-bold uppercase">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase text-slate-400 tracking-tight ml-1">Service Area</label>
            <Select value={area} onValueChange={v => setArea(v ?? "all")}>
              <SelectTrigger className="h-10 bg-slate-50 border-slate-200 text-xs font-bold uppercase">
                <SelectValue placeholder="All Areas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Areas</SelectItem>
                {areas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase text-slate-400 tracking-tight ml-1">Staff Assigned</label>
            <Select value={staffId} onValueChange={v => setStaffId(v ?? "all")}>
              <SelectTrigger className="h-10 bg-slate-50 border-slate-200 text-xs font-bold uppercase">
                <SelectValue placeholder="All Staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Button
              className="h-10 w-full bg-[#0369a1] hover:bg-[#075985] text-xs font-black uppercase tracking-widest shadow-lg shadow-sky-900/10"
              onClick={applyFilters}
              disabled={pending}
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-2" />}
              Search
            </Button>
          </div>
          <div className="space-y-2">
            <Button
              variant="outline"
              className="h-10 w-full border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 text-xs font-black uppercase tracking-widest"
              onClick={resetFilters}
              disabled={pending}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-2" /> Reset
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
