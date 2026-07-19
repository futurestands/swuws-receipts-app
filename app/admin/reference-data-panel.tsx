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
import type { Branch, PaymentMethod, WaterScheme } from "@/lib/db/schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { FileUp, Download } from "lucide-react"
import Link from "next/link"
import { downloadHierarchyTemplate } from "@/app/actions/hierarchy-import"

export function ReferenceDataPanel({
  branches: initialBranches,
  methods: initialMethods,
  schemes: initialSchemes,
}: {
  branches: Branch[]
  methods: PaymentMethod[]
  schemes: WaterScheme[]
}) {
  const [branches, setBranches] = useState(initialBranches)
  const [methods, setMethods] = useState(initialMethods)
  const [schemes, setSchemes] = useState(initialSchemes)
  const [pending, startTransition] = useTransition()

  const [branchName, setBranchName] = useState("")
  const [branchCode, setBranchCode] = useState("")
  const [methodName, setMethodName] = useState("")
  const [methodCode, setMethodCode] = useState("")
  const [schemeName, setSchemeName] = useState("")
  const [schemeCode, setSchemeCode] = useState("")
  const [schemeBranchId, setSchemeBranchId] = useState("")
  const [schemeArea, setSchemeArea] = useState("")

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
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/bulkhierarchy">
              <FileUp className="h-4 w-4 mr-2" /> Bulk Import
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const base64 = await downloadHierarchyTemplate()
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
              a.download = `hierarchy-import-template.xlsx`
              a.click()
              window.URL.revokeObjectURL(url)
            }}
          >
            <Download className="h-4 w-4 mr-2" /> Template
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Branches</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAddBranch} className="flex items-end gap-2">
            <div className="space-y-2 flex-1">
              <Label htmlFor="branch-name">Name</Label>
              <Input
                id="branch-name"
                required
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
              />
            </div>
            <div className="space-y-2 flex-1">
              <Label htmlFor="branch-code">Code</Label>
              <Input
                id="branch-code"
                required
                value={branchCode}
                onChange={(e) => setBranchCode(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={pending}>
              Add
            </Button>
          </form>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>{b.name}</TableCell>
                  <TableCell className="text-muted-foreground">{b.code}</TableCell>
                  <TableCell>
                    <Switch
                      checked={b.active}
                      onCheckedChange={() =>
                        startTransition(async () => {
                          const result = await setBranchActive(b.id, !b.active)
                          if (!result.ok) {
                            toast.error(result.error)
                            return
                          }
                          setBranches((prev) =>
                            prev.map((x) => (x.id === b.id ? { ...x, active: !x.active } : x)),
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

      <Card>
        <CardHeader>
          <CardTitle>Payment methods</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAddMethod} className="flex items-end gap-2">
            <div className="space-y-2 flex-1">
              <Label htmlFor="method-name">Name</Label>
              <Input
                id="method-name"
                required
                value={methodName}
                onChange={(e) => setMethodName(e.target.value)}
              />
            </div>
            <div className="space-y-2 flex-1">
              <Label htmlFor="method-code">Code</Label>
              <Input
                id="method-code"
                required
                value={methodCode}
                onChange={(e) => setMethodCode(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={pending}>
              Add
            </Button>
          </form>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {methods.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.name}</TableCell>
                  <TableCell className="text-muted-foreground">{m.code}</TableCell>
                  <TableCell>
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

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Water schemes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAddScheme} className="grid gap-2 sm:grid-cols-5 items-end">
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="scheme-name">Name</Label>
              <Input
                id="scheme-name"
                required
                value={schemeName}
                onChange={(e) => setSchemeName(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="scheme-code">Code</Label>
              <Input
                id="scheme-code"
                required
                value={schemeCode}
                onChange={(e) => setSchemeCode(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-1">
              <Label>Branch</Label>
              <Select value={schemeBranchId} onValueChange={(v) => setSchemeBranchId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None" />
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
              <Label htmlFor="scheme-area">Service area</Label>
              <Input
                id="scheme-area"
                value={schemeArea}
                onChange={(e) => setSchemeArea(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={pending} className="sm:col-span-1">
              Add
            </Button>
          </form>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Service area</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schemes.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.code}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {branches.find((b) => b.id === s.branchId)?.name || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.serviceArea || "—"}</TableCell>
                  <TableCell>
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
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
