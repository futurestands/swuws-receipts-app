"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { X } from "lucide-react"
import type { BillingPeriod, Branch, WaterScheme } from "@/lib/db/schema"

export function ReportFilters({
  periods,
  branches,
  schemes,
  initialFilters,
}: {
  periods: BillingPeriod[]
  branches: Branch[]
  schemes: WaterScheme[]
  initialFilters: {
    periodId?: string
    branchId?: string
    schemeId?: string
  }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function updateFilter(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== "all") {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    // Reset more specific filters if a parent changes
    if (key === "branchId") params.delete("schemeId")

    router.push(`${pathname}?${params.toString()}`)
  }

  function clearFilters() {
    router.push(pathname)
  }

  const hasFilters = searchParams.size > 0

  return (
    <div className="flex flex-wrap items-end gap-4 bg-muted/40 p-4 rounded-lg">
      <div className="space-y-1.5">
        <Label className="text-xs">Billing Period</Label>
        <Select
          value={initialFilters.periodId || "all"}
          onValueChange={(v) => updateFilter("periodId", v)}
        >
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="All Periods" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Periods</SelectItem>
            {periods.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.periodName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Branch (Area)</Label>
        <Select
          value={initialFilters.branchId || "all"}
          onValueChange={(v) => updateFilter("branchId", v)}
        >
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="All Branches" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Water Scheme</Label>
        <Select
          value={initialFilters.schemeId || "all"}
          onValueChange={(v) => updateFilter("schemeId", v)}
        >
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="All Schemes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Schemes</SelectItem>
            {schemes
              .filter((s) => !initialFilters.branchId || s.branchId === initialFilters.branchId)
              .map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
          <X className="mr-2 h-4 w-4" /> Clear
        </Button>
      )}
    </div>
  )
}
