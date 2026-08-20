"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Loader2 } from "lucide-react"

/**
 * Same bug as the complaints filter bar: no <form>, no value/onValueChange
 * on either Select, no click handler on Search -- this whole panel did
 * nothing when interacted with. Fixed with the same pattern.
 */
export function SmsFilterBar() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const [from, setFrom] = useState(searchParams.get("from") ?? "")
  const [till, setTill] = useState(searchParams.get("till") ?? "")
  const [status, setStatus] = useState(searchParams.get("status") ?? "all")
  const [category, setCategory] = useState(searchParams.get("category") ?? "all")

  function applyFilters() {
    const params = new URLSearchParams()
    if (from) params.set("from", from)
    if (till) params.set("till", till)
    if (status !== "all") params.set("status", status)
    if (category !== "all") params.set("category", category)

    startTransition(() => {
      router.push(`/dashboard/crm/sms?${params.toString()}`)
    })
  }

  return (
    <Card className="shadow-sm border-none bg-slate-50/50">
      <CardContent className="p-6">
        <div className="grid gap-4 md:grid-cols-5 items-end">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">From</label>
            <Input type="date" className="h-9 bg-white" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Till</label>
            <Input type="date" className="h-9 bg-white" value={till} onChange={e => setTill(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Status</label>
            <Select value={status} onValueChange={v => setStatus(v ?? "all")}>
              <SelectTrigger className="h-9 bg-white">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Category</label>
            <Select value={category} onValueChange={v => setCategory(v ?? "all")}>
              <SelectTrigger className="h-9 bg-white">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="Bill Reminders">Bill Reminders</SelectItem>
                <SelectItem value="Alerts">Alerts</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button className="h-9 w-full bg-sky-700 hover:bg-sky-800" onClick={applyFilters} disabled={pending}>
              {pending ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-2" />}
              Search
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
