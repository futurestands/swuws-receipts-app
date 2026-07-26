"use client"

import { useState, useTransition, useMemo } from "react"
import { useRouter } from "next/navigation"
import { createCustomer } from "@/app/actions/customers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { FileUp, Search, X } from "lucide-react"
import Link from "next/link"
import { FormField, FormActions } from "@/components/ui/form-layout"
import type { Branch, WaterScheme } from "@/lib/db/schema"

export function CustomerSearchBar({
  initialQuery,
  initialBranchId,
  initialSchemeId,
  branches,
  schemes,
  canImport
}: {
  initialQuery: string
  initialBranchId?: string
  initialSchemeId?: string
  branches: Branch[]
  schemes: WaterScheme[]
  canImport: boolean
}) {
  const router = useRouter()
  const [query, setQuery] = useState(initialQuery)
  const [branchId, setBranchId] = useState(initialBranchId || "all")
  const [schemeId, setSchemeId] = useState(initialSchemeId || "all")

  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [account, setAccount] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Filter schemes based on selected branch
  const filteredSchemes = useMemo(() => {
    if (branchId === "all") return schemes
    return schemes.filter(s => s.branchId === branchId)
  }, [branchId, schemes])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (query.trim()) params.set("q", query.trim())
    if (branchId !== "all") params.set("branchId", branchId)
    if (schemeId !== "all") params.set("schemeId", schemeId)

    startTransition(() => {
      router.push(`/dashboard/customers?${params.toString()}`)
    })
  }

  function clearFilters() {
    setQuery("")
    setBranchId("all")
    setSchemeId("all")
    startTransition(() => {
      router.push(`/dashboard/customers`)
    })
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createCustomer({
        name,
        customerAccount: account || undefined,
        phone: phone || undefined,
        address: address || undefined,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success("Customer created")
      setOpen(false)
      setName("")
      setAccount("")
      setPhone("")
      setAddress("")
      router.push(`/dashboard/customers/${result.customer.id}`)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row items-end gap-3">
        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 w-full flex-1">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Text Search</Label>
            <Input
              placeholder="Name, account #, phone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={pending}
              className="h-11"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Branch</Label>
            <Select
              value={branchId}
              onValueChange={(v) => {
                setBranchId(v)
                setSchemeId("all") // Reset scheme when branch changes
              }}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder="All Branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Water Scheme</Label>
            <Select
              value={schemeId}
              onValueChange={setSchemeId}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder="All Schemes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Schemes</SelectItem>
                {filteredSchemes.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 items-end">
            <Button type="submit" disabled={pending} className="h-11 flex-1">
              <Search className={`h-4 w-4 mr-2 ${pending ? "animate-pulse" : ""}`} />
              {pending ? "Filtering…" : "Search"}
            </Button>
            {(query || branchId !== "all" || schemeId !== "all") && (
              <Button type="button" variant="ghost" size="icon" onClick={clearFilters} className="h-11 w-11 shrink-0" title="Clear Filters">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </form>

        <div className="flex items-center gap-2 w-full lg:w-auto pb-0.5">
          {canImport && (
            <Button variant="outline" asChild className="flex-1 lg:flex-initial h-11 border-dashed">
              <Link href="/dashboard/customers/bulkimport">
                <FileUp className="h-4 w-4 mr-2" /> Bulk Import
              </Link>
            </Button>
          )}

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary" className="flex-1 lg:flex-initial h-11">New customer</Button>
            </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New customer profile</DialogTitle>
            <DialogDescription>
              Creates a reusable profile you can link receipts to later.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <FormField label="Name" htmlFor="c-name" required>
              <Input id="c-name" required value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
            </FormField>
            <FormField label="Account number" htmlFor="c-account">
              <Input id="c-account" value={account} onChange={(e) => setAccount(e.target.value)} className="h-11" />
            </FormField>
            <FormField label="Phone" htmlFor="c-phone">
              <Input id="c-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11" />
            </FormField>
            <FormField label="Address" htmlFor="c-address">
              <Input id="c-address" value={address} onChange={(e) => setAddress(e.target.value)} className="h-11" />
            </FormField>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <FormActions>
              <Button type="submit" disabled={pending} className="h-11">
                {pending ? "Creating…" : "Create customer"}
              </Button>
            </FormActions>
          </form>
        </DialogContent>
      </Dialog>
      </div>
      </div>
    </div>
  )
}
