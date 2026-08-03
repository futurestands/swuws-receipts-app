"use client"

import { useState, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { formatUGX } from "@/lib/format"
import { Settings2, Plus, Trash2, Globe, Home } from "lucide-react"
import { upsertTariff, deleteTariff } from "@/app/actions/billing-engine"
import { TariffImportWizard } from "./tariff-import-wizard"
import type { Branch, WaterScheme } from "@/lib/db/schema"

type TariffWithMetadata = {
  id: string
  targetType: string
  targetId: string
  targetName: string
  customerCategory: string
  unitPrice: number
  serviceFee: number
  vatPercentage: number
}

export function TariffPanel({
  tariffs,
  branches,
  schemes,
}: {
  tariffs: TariffWithMetadata[]
  branches: Branch[]
  schemes: WaterScheme[]
}) {
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  const [formData, setFormData] = useState({
    targetType: "branch" as "branch" | "scheme",
    targetId: "",
    customerCategory: "domestic",
    unitPrice: "",
    serviceFee: "",
    vatPercentage: "18",
  })

  async function handleSave() {
    if (!formData.targetId || !formData.unitPrice) {
      toast.error("Please fill in all required fields.")
      return
    }

    startTransition(async () => {
      try {
        const result = await upsertTariff({
          targetType: formData.targetType,
          targetId: formData.targetId,
          customerCategory: formData.customerCategory,
          unitPrice: Number(formData.unitPrice),
          serviceFee: Number(formData.serviceFee || 0),
          vatPercentage: Number(formData.vatPercentage),
        })

        if (result.ok) {
          toast.success("Tariff saved successfully")
          setOpen(false)
          setFormData({
            targetType: "branch",
            targetId: "",
            customerCategory: "domestic",
            unitPrice: "",
            serviceFee: "",
            vatPercentage: "18"
          })
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to save tariff"
        toast.error(message)
      }
    })
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to remove this tariff configuration?")) return

    startTransition(async () => {
      try {
        await deleteTariff(id)
        toast.success("Tariff removed")
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to delete"
        toast.error(message)
      }
    })
  }

  return (
    <div className="space-y-6">
      <Card className="card-accent-blue">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-brand-blue" />
              Billing & Tariff Management
            </CardTitle>
            <CardDescription>Configure water rates, service fees, and taxes for different areas.</CardDescription>
          </div>
          <div className="flex gap-2">
            <TariffImportWizard />
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" /> Add Tariff
                </Button>
              </DialogTrigger>
              <DialogContent>
              <DialogHeader>
                <DialogTitle>Configure New Rate</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Apply To</Label>
                    <Select
                      value={formData.targetType}
                      onValueChange={(v) => {
                        if (v === "branch" || v === "scheme") {
                          setFormData(f => ({ ...f, targetType: v, targetId: "" }))
                        }
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="branch">Entire Branch</SelectItem>
                        <SelectItem value="scheme">Specific Scheme</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Select {formData.targetType === 'branch' ? 'Branch' : 'Scheme'}</Label>
                    <Select
                      value={formData.targetId}
                      onValueChange={(v) => setFormData(f => ({ ...f, targetId: v || "" }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Choose..." /></SelectTrigger>
                      <SelectContent>
                        {formData.targetType === 'branch'
                          ? branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)
                          : schemes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)
                        }
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Customer Category</Label>
                  <Select
                    value={formData.customerCategory}
                    onValueChange={(v) => setFormData(f => ({ ...f, customerCategory: v ?? "domestic" }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="domestic">Domestic</SelectItem>
                      <SelectItem value="institutional">Institutional</SelectItem>
                      <SelectItem value="psp">PSP (Public Stand Pipes)</SelectItem>
                      <SelectItem value="commercial">Commercial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Unit Rate (UGX/m³)</Label>
                    <Input
                      type="number"
                      placeholder="3500"
                      value={formData.unitPrice}
                      onChange={(e) => setFormData(f => ({ ...f, unitPrice: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Monthly Service Fee</Label>
                    <Input
                      type="number"
                      placeholder="2000"
                      value={formData.serviceFee}
                      onChange={(e) => setFormData(f => ({ ...f, serviceFee: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>VAT Percentage (%)</Label>
                  <Input
                    type="number"
                    value={formData.vatPercentage}
                    onChange={(e) => setFormData(f => ({ ...f, vatPercentage: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={isPending}>
                  {isPending ? "Saving..." : "Save Configuration"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Target Area</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Unit Price</TableHead>
                <TableHead>Service Fee</TableHead>
                <TableHead>VAT %</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tariffs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground italic">
                    No tariffs configured yet. Click &quot;Add Tariff&quot; to begin.
                  </TableCell>
                </TableRow>
              ) : (
                tariffs.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-bold">{t.targetName}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 text-xs">
                        {t.targetType === 'branch' ? <Globe className="h-3 w-3" /> : <Home className="h-3 w-3" />}
                        {t.targetType.toUpperCase()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs uppercase font-bold text-brand-blue">
                        {t.customerCategory}
                      </div>
                    </TableCell>
                    <TableCell>{formatUGX(t.unitPrice)} / m³</TableCell>
                    <TableCell>{formatUGX(t.serviceFee)} / mo</TableCell>
                    <TableCell>{t.vatPercentage}%</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(t.id)}
                        className="text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 text-xs text-muted-foreground p-4 bg-muted/20 rounded-lg border border-dashed">
        <p><strong>Note:</strong> Scheme-specific rates always take priority over Branch rates if both are configured for a customer.</p>
        <p><strong>Impact:</strong> Changes here will immediately update the &quot;Amount Due&quot; shown to plumbers in the field when they capture readings.</p>
      </div>
    </div>
  )
}
