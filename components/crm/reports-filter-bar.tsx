"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Search, RotateCcw, Loader2 } from "lucide-react"

interface ReportsFilterBarProps {
  areas: { id: string; name: string }[]
  staff: { id: string; name: string }[]
  categories: { id: string; name: string }[]
}

/**
 * The report parameters panel used to be entirely decorative: plain
 * uncontrolled inputs inside a Server Component, no value/onValueChange on
 * any Select, and no click handler on Get Data or Reset. The District and
 * Staff dropdowns had only an "All" option, so neither could ever be used.
 *
 * Same useTransition + router.push pattern as the complaints filter bar.
 */
export function ReportsFilterBar({ areas, staff, categories }: ReportsFilterBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const [from, setFrom] = useState(searchParams.get("from") ?? "")
  const [till, setTill] = useState(searchParams.get("till") ?? "")
  const [status, setStatus] = useState(searchParams.get("status") ?? "all")
  const [priority, setPriority] = useState(searchParams.get("priority") ?? "all")
  const [district, setDistrict] = useState(searchParams.get("district") ?? "all")
  const [category, setCategory] = useState(searchParams.get("category") ?? "all")
  const [staffId, setStaffId] = useState(searchParams.get("staff") ?? "all")

  function applyFilters() {
    const params = new URLSearchParams()
    if (from) params.set("from", from)
    if (till) params.set("till", till)
    if (status !== "all") params.set("status", status)
    if (priority !== "all") params.set("priority", priority)
    if (district !== "all") params.set("district", district)
    if (category !== "all") params.set("category", category)
    if (staffId !== "all") params.set("staff", staffId)

    startTransition(() => {
      router.push(`/dashboard/crm/reports?${params.toString()}`)
    })
  }

  function resetFilters() {
    setFrom("")
    setTill("")
    setStatus("all")
    setPriority("all")
    setDistrict("all")
    setCategory("all")
    setStaffId("all")
    startTransition(() => {
      router.push("/dashboard/crm/reports")
    })
  }

  return (
    <Card className="shadow-sm border-none bg-white">
      <CardHeader className="border-b py-3 bg-slate-50/50">
        <CardTitle className="text-[10px] font-bold uppercase text-slate-500">Report Parameters</CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 items-end">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">From</label>
            <Input type="date" className="h-9" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Till</label>
            <Input type="date" className="h-9" value={till} onChange={e => setTill(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Status</label>
            <Select value={status} onValueChange={v => setStatus(v ?? "all")}>
              <SelectTrigger className="h-9"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Priority</label>
            <Select value={priority} onValueChange={v => setPriority(v ?? "all")}>
              <SelectTrigger className="h-9"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">District / Area</label>
            <SearchableSelect
              value={district}
              onValueChange={(v) => setDistrict(v || "all")}
              options={[
                { value: "all", label: "All Areas" },
                ...areas.map((a) => ({ value: a.id, label: a.name })),
              ]}
              placeholder="All Areas"
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Complaint Type</label>
            <Select value={category} onValueChange={v => setCategory(v ?? "all")}>
              <SelectTrigger className="h-9"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Staff</label>
            <Select value={staffId} onValueChange={v => setStaffId(v ?? "all")}>
              <SelectTrigger className="h-9"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="all">All Staff</SelectItem>
                {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-3">
            <Button
              className="h-9 flex-1 bg-[#0369a1] hover:bg-[#075985] text-white font-bold"
              onClick={applyFilters}
              disabled={pending}
            >
              {pending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Get Data
            </Button>
            <Button
              variant="outline"
              className="h-9 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 font-bold"
              onClick={resetFilters}
              disabled={pending}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
