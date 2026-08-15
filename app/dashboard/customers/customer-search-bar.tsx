"use client"

import { useState, useTransition, useMemo } from "react"
import { useRouter } from "next/navigation"
import { createCustomer, exportCustomersExcel } from "@/app/actions/customers"
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
import { FileUp, Search, X, Camera, Loader2, Download } from "lucide-react"
import Link from "next/link"
import { FormField, FormActions } from "@/components/ui/form-layout"
import type { Branch, WaterScheme } from "@/lib/db/schema"
import { isNative } from "@/lib/mobile-hardware"
import { CapacitorBarcodeScanner } from "@capacitor/barcode-scanner"

export function CustomerSearchBar({
  initialQuery,
  initialBranchId,
  initialSchemeId,
  initialCategory,
  initialMinBalance,
  initialMaxBalance,
  branches,
  schemes,
  canImport,
}: {
  initialQuery: string
  initialBranchId?: string
  initialSchemeId?: string
  initialCategory?: string
  initialMinBalance?: string
  initialMaxBalance?: string
  branches: Branch[]
  schemes: WaterScheme[]
  canImport: boolean
}) {
  const router = useRouter()
  const [query, setQuery] = useState(initialQuery)
  const [branchId, setBranchId] = useState<string>(initialBranchId || "all")
  const [schemeId, setSchemeId] = useState<string>(initialSchemeId || "all")
  const [category, setCategory] = useState<string>(initialCategory || "all")
  const [minBalance, setMinBalance] = useState(initialMinBalance || "")
  const [maxBalance, setMaxBalance] = useState(initialMaxBalance || "")

  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [account, setAccount] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [newCustomerCategory, setNewCustomerCategory] = useState("domestic")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [isScanning, setIsScanning] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  // Filter schemes based on selected branch
  const filteredSchemes = useMemo(() => {
    if (branchId === "all") return schemes
    return schemes.filter((s) => s.branchId === branchId)
  }, [branchId, schemes])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (query.trim()) params.set("q", query.trim())
    if (branchId !== "all") params.set("branchId", branchId)
    if (schemeId !== "all") params.set("schemeId", schemeId)
    if (category !== "all") params.set("category", category)
    if (minBalance.trim()) params.set("minBalance", minBalance.trim())
    if (maxBalance.trim()) params.set("maxBalance", maxBalance.trim())

    startTransition(() => {
      router.push(`/dashboard/customers?${params.toString()}`)
    })
  }

  function clearFilters() {
    setQuery("")
    setBranchId("all")
    setSchemeId("all")
    setCategory("all")
    setMinBalance("")
    setMaxBalance("")
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
        category: newCustomerCategory,
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

  // Wrapper handlers to satisfy Select's callback signature and normalize nulls
  function handleBranchChange(value: string | null) {
    setBranchId(value ?? "all")
    setSchemeId("all")
  }

  function handleSchemeChange(value: string | null) {
    setSchemeId(value ?? "all")
  }

  async function handleScan() {
    if (!isNative()) {
      toast.error("QR Scanning is only available on the Android app.")
      return
    }

    try {
      setIsScanning(true)
      const result = await CapacitorBarcodeScanner.scanBarcode({
        hint: 1 // 1 is for QR codes, or we can use CapacitorBarcodeScannerType.ALL if available
      })

      setIsScanning(false)

      if (result.ScanResult) {
        setQuery(result.ScanResult)
        // Trigger search automatically
        const params = new URLSearchParams()
        params.set("q", result.ScanResult)
        if (branchId !== "all") params.set("branchId", branchId)
        if (schemeId !== "all") params.set("schemeId", schemeId)
        if (category !== "all") params.set("category", category)
        if (minBalance.trim()) params.set("minBalance", minBalance.trim())
        if (maxBalance.trim()) params.set("maxBalance", maxBalance.trim())
        startTransition(() => {
          router.push(`/dashboard/customers?${params.toString()}`)
        })
      }
    } catch (err) {
      console.error(err)
      setIsScanning(false)
      toast.error("Scanning failed")
    }
  }

  async function handleExport() {
    try {
      setIsExporting(true)
      const base64 = await exportCustomersExcel({
        query: query.trim() || undefined,
        branchId,
        waterSchemeId: schemeId,
        category: category === 'all' ? undefined : category,
        minBalance: minBalance ? Number(minBalance) : undefined,
        maxBalance: maxBalance ? Number(maxBalance) : undefined,
      })

      const byteCharacters = atob(base64)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `customers_export_${new Date().toISOString().split("T")[0]}.xlsx`
      a.click()
      window.URL.revokeObjectURL(url)
      toast.success("Excel export downloaded")
    } catch (err) {
      console.error(err)
      toast.error("Export failed")
    } finally {
      setIsExporting(false)
    }
  }

  if (isScanning) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
        <div className="flex flex-col items-center gap-4">
           <Loader2 className="size-12 text-white animate-spin" />
           <p className="text-white font-bold">Initializing Scanner...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row items-end gap-3">
        <form
          onSubmit={handleSearch}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 w-full flex-1"
        >
          <div className="space-y-1">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">
              Text Search
            </Label>
            <Input
              placeholder="Name, account #, phone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={pending}
              className="h-11"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">
              Branch
            </Label>
            <Select value={branchId} onValueChange={(v) => handleBranchChange(v)}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="All Branches">
                  {branchId === "all" ? "All Branches" : branches.find(b => b.id === branchId)?.name}
                </SelectValue>
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

          <div className="space-y-1">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">
              Water Scheme
            </Label>
            <Select value={schemeId} onValueChange={(v) => handleSchemeChange(v)}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="All Schemes">
                  {schemeId === "all" ? "All Schemes" : schemes.find(s => s.id === schemeId)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Schemes</SelectItem>
                {filteredSchemes.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">
              Category
            </Label>
            <Select value={category} onValueChange={(v) => setCategory(v || "all")}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="domestic">Domestic</SelectItem>
                <SelectItem value="institutional">Institutional</SelectItem>
                <SelectItem value="psp">PSP (Public Standpost)</SelectItem>
                <SelectItem value="commercial">Commercial</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">
              Min Arrears
            </Label>
            <Input
              type="number"
              placeholder="0"
              value={minBalance}
              onChange={(e) => setMinBalance(e.target.value)}
              disabled={pending}
              className="h-11"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">
              Max Arrears
            </Label>
            <Input
              type="number"
              placeholder="Max"
              value={maxBalance}
              onChange={(e) => setMaxBalance(e.target.value)}
              disabled={pending}
              className="h-11"
            />
          </div>

          <div className="flex gap-2 items-end">
            <Button type="submit" disabled={pending} className="h-11 flex-1">
              <Search className={`h-4 w-4 mr-2 ${pending ? "animate-pulse" : ""}`} />
              {pending ? "Filtering…" : "Search"}
            </Button>

            {isNative() && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleScan}
                className="h-11 w-11 shrink-0 border-brand-blue text-brand-blue"
                title="Scan QR Code"
              >
                <Camera className="h-4 w-4" />
              </Button>
            )}

            {(query || branchId !== "all" || schemeId !== "all" || category !== "all" || minBalance || maxBalance) && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={clearFilters}
                className="h-11 w-11 shrink-0"
                title="Clear Filters"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </form>

        <div className="flex items-center gap-2 w-full lg:w-auto pb-0.5">
          <Button
            variant="outline"
            className="flex-1 lg:flex-initial h-11"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Download Excel
          </Button>

          {canImport && (
            <Button variant="outline" asChild className="flex-1 lg:flex-initial h-11 border-dashed">
              <Link href="/dashboard/customers/bulkimport">
                <FileUp className="h-4 w-4 mr-2" /> Bulk Import
              </Link>
            </Button>
          )}

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary" className="flex-1 lg:flex-initial h-11">
                New customer
              </Button>
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
                  <Input
                    id="c-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-11"
                  />
                </FormField>
                <FormField label="Account number" htmlFor="c-account">
                  <Input
                    id="c-account"
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                    className="h-11"
                  />
                </FormField>
                <FormField label="Phone" htmlFor="c-phone">
                  <Input
                    id="c-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-11"
                  />
                </FormField>
                <FormField label="Address" htmlFor="c-address">
                  <Input
                    id="c-address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="h-11"
                  />
                </FormField>
                <FormField label="Category" htmlFor="c-category">
                  <Select value={newCustomerCategory} onValueChange={(v) => setNewCustomerCategory(v || "domestic")}>
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="domestic">Domestic</SelectItem>
                      <SelectItem value="institutional">Institutional</SelectItem>
                      <SelectItem value="psp">PSP (Public Standpost)</SelectItem>
                      <SelectItem value="commercial">Commercial</SelectItem>
                    </SelectContent>
                  </Select>
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
