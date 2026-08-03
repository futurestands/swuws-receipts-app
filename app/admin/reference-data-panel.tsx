"use client"

import { useState, useTransition } from "react"
import {
  createBranch,
  setBranchActive,
  createPaymentMethod,
  setPaymentMethodActive,
  createWaterScheme,
  setWaterSchemeActive,
} from "@/app/actions/settings"
import type { Branch, PaymentMethod, WaterScheme, Cluster } from "@/lib/db/schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { FileUp, Download, Globe, Home, FileSpreadsheet } from "lucide-react"
import Link from "next/link"
import { downloadUnifiedHierarchyTemplate } from "@/app/actions/hierarchy-engine"
import * as XLSX from "xlsx"
import { saveAs } from "file-saver"

export function ReferenceDataPanel({
  branches: initialBranches,
  methods: initialMethods,
  schemes: initialSchemes,
  clusters: initialClusters,
}: {
  branches: Branch[]
  methods: PaymentMethod[]
  schemes: WaterScheme[]
  clusters: Cluster[]
}) {
  const [branches, setBranches] = useState(initialBranches)
  const [methods, setMethods] = useState(initialMethods)
  const [schemes, setSchemes] = useState(initialSchemes)
  const [clusters, setClusters] = useState(initialClusters)
  const [pending, startTransition] = useTransition()

  const [branchName, setBranchName] = useState("")
  const [branchCode, setBranchCode] = useState("")
  const [methodName, setMethodName] = useState("")
  const [methodCode, setMethodCode] = useState("")
  const [schemeName, setSchemeName] = useState("")
  const [schemeCode, setSchemeCode] = useState("")
  const [schemeBranchId, setSchemeBranchId] = useState("")
  const [schemeArea, setSchemeArea] = useState("")

  function handleExportSchemes() {
    try {
      const data = schemes.map((s) => {
        const area = branches.find((b) => b.id === s.branchId)
        const region = area ? clusters.find((c) => c.id === area.clusterId) : null

        return {
          "Scheme Name": s.name,
          "Code": s.code,
          "Area Office": area?.name || "—",
          "Region (Cluster)": region?.name || "—",
          "Service Area": s.serviceArea || "—",
          "Status": s.active ? "Active" : "Inactive",
        }
      })

      const worksheet = XLSX.utils.json_to_sheet(data)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, "Water Schemes")

      const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" })
      const blob = new Blob([excelBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
      saveAs(blob, `water-schemes-export-${new Date().toISOString().split("T")[0]}.xlsx`)
      toast.success("Scheme list exported successfully")
    } catch (err) {
      console.error("Export failed", err)
      toast.error("Failed to export scheme list")
    }
  }

  function handleAddBranch(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await createBranch({ name: branchName, code: branchCode })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setBranches((prev) => [...prev, result.branch])
      setBranchName("")
      setBranchCode("")
    })
  }

  function handleAddMethod(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await createPaymentMethod({ name: methodName, code: methodCode })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setMethods((prev) => [...prev, result.method])
      setMethodName("")
      setMethodCode("")
    })
  }

  function handleAddScheme(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await createWaterScheme({
        name: schemeName,
        code: schemeCode,
        branchId: schemeBranchId || undefined,
        serviceArea: schemeArea || undefined,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setSchemes((prev) => [...prev, result.scheme])
      setSchemeName("")
      setSchemeCode("")
      setSchemeBranchId("")
      setSchemeArea("")
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-medium">Hierarchy & Data Management</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportSchemes}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Download List
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/bulkhierarchy">
              <FileUp className="h-4 w-4 mr-2" /> Bulk Import
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const base64 = await downloadUnifiedHierarchyTemplate()
              const byteCharacters = atob(base64)
              const byteNumbers = new Array(byteCharacters.length)
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i)
              }
              const byteArray = new Uint8Array(byteNumbers)
              const blob = new Blob([byteArray], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
              const url = window.URL.createObjectURL(blob)
              const a = document.createElement("a")
              a.href = url
              a.download = `unified-hierarchy-template.xlsx`
              a.click()
              window.URL.revokeObjectURL(url)
            }}
          >
            <Download className="h-4 w-4 mr-2" /> One-Row Template
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-1">
      <Card className="card-accent-blue">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-brand-blue" />
            Water Schemes & Area Offices
          </CardTitle>
          <CardDescription>Manage your organization&apos;s regions, area offices, and water schemes in one place.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleAddScheme} className="grid gap-4 sm:grid-cols-5 items-end p-4 bg-muted/20 rounded-lg border border-dashed">
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="scheme-name">Scheme Name</Label>
              <Input
                id="scheme-name"
                required
                placeholder="e.g. Kabere"
                value={schemeName}
                onChange={(e) => setSchemeName(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="scheme-code">Scheme Code (Optional)</Label>
              <Input
                id="scheme-code"
                placeholder="Auto-generated if blank"
                value={schemeCode}
                onChange={(e) => setSchemeCode(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-1">
              <Label>Area Office</Label>
              <Select value={schemeBranchId} onValueChange={(v) => setSchemeBranchId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select Area Office..." />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="scheme-area">Service Area Description</Label>
              <Input
                id="scheme-area"
                placeholder="e.g. South Sector"
                value={schemeArea}
                onChange={(e) => setSchemeArea(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={pending} className="sm:col-span-1">
              Add New Scheme
            </Button>
          </form>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scheme Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Area Office</TableHead>
                <TableHead>Region (Cluster)</TableHead>
                <TableHead>Service Area</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schemes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground italic">
                    No schemes found. Use the &quot;One-Row Template&quot; above for bulk onboarding.
                  </TableCell>
                </TableRow>
              ) : (
                schemes.map((s) => {
                  const area = branches.find((b) => b.id === s.branchId)
                  const region = area ? clusters.find((c) => c.id === area.clusterId) : null

                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-bold">{s.name}</TableCell>
                      <TableCell className="text-xs font-mono">{s.code}</TableCell>
                      <TableCell>{area?.name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs uppercase font-medium">
                        {region?.name || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{s.serviceArea || "—"}</TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={s.active}
                          onCheckedChange={() =>
                            startTransition(async () => {
                              const result = await setWaterSchemeActive(s.id, !s.active)
                              if (!result.ok) {
                                toast.error(result.error)
                                return
                              }
                              setSchemes((prev) =>
                                prev.map((x) => (x.id === s.id ? { ...x, active: !x.active } : x)),
                              )
                            })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Methods</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAddMethod} className="flex items-end gap-2">
            <div className="space-y-2 flex-1">
              <Label htmlFor="method-name">Method Name</Label>
              <Input
                id="method-name"
                required
                value={methodName}
                onChange={(e) => setMethodName(e.target.value)}
              />
            </div>
            <div className="space-y-2 flex-1">
              <Label htmlFor="method-code">System Code</Label>
              <Input
                id="method-code"
                required
                value={methodCode}
                onChange={(e) => setMethodCode(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={pending}>
              Add Method
            </Button>
          </form>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="text-center">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {methods.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">{m.code}</TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={m.active}
                      onCheckedChange={() =>
                        startTransition(async () => {
                          const result = await setPaymentMethodActive(m.id, !m.active)
                          if (!result.ok) {
                            toast.error(result.error)
                            return
                          }
                          setMethods((prev) =>
                            prev.map((x) => (x.id === m.id ? { ...x, active: !x.active } : x)),
                          )
                        })
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
