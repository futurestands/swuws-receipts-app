"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { FileUp, Download, CheckCircle2, AlertTriangle, Loader2, XCircle } from "lucide-react"
import { toast } from "sonner"
import { validateTariffImport, executeTariffImport, downloadTariffTemplate, type TariffImportSummary } from "@/app/actions/tariff-import"

export function TariffImportWizard() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<"upload" | "review" | "done">("upload")
  const [summary, setSummary] = useState<TariffImportSummary | null>(null)
  const [pending, startTransition] = useTransition()
  const [importResult, setResult] = useState<{ count: number; report: string } | null>(null)

  async function handleDownloadTemplate() {
    const base64 = await downloadTariffTemplate()
    const link = document.createElement("a")
    link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`
    link.download = "SWUWS_Tariff_Template.xlsx"
    link.click()
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append("file", file)

    startTransition(async () => {
      const res = await validateTariffImport(formData)
      if (res.ok) {
        setSummary(res.summary)
        setStep("review")
      } else {
        toast.error(res.error)
      }
    })
  }

  async function handleConfirm() {
    if (!summary) return
    startTransition(async () => {
      const res = await executeTariffImport(summary)
      if (res.ok) {
        setResult(res)
        setStep("done")
        toast.success(`Successfully updated ${res.count} tariffs`)
      } else {
        toast.error(res.error)
      }
    })
  }

  function reset() {
    setOpen(false)
    setStep("upload")
    setSummary(null)
    setResult(null)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 border-brand-blue text-brand-blue hover:bg-brand-blue/5">
          <FileUp className="h-4 w-4" /> Import Tariffs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 border-b">
          <DialogTitle>Bulk Tariff Import</DialogTitle>
          <DialogDescription>
            Update water rates and service fees for multiple schemes using an Excel file.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {step === "upload" && (
            <div className="p-12 flex flex-col items-center justify-center space-y-6 text-center">
              <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <FileUp className="size-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Step 1: Upload Excel File</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Download our official template, fill in the prices for each area, and upload it here.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
                <Button variant="outline" className="flex-1 gap-2" onClick={handleDownloadTemplate}>
                  <Download className="size-4" /> Download Template
                </Button>
                <div className="relative flex-1">
                  <Input
                    type="file"
                    accept=".xlsx,.xls"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={handleFileSelect}
                    disabled={pending}
                  />
                  <Button className="w-full gap-2" disabled={pending}>
                    {pending ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
                    Select File
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === "review" && summary && (
            <div className="flex flex-col h-full">
              <div className="p-4 bg-muted/30 border-b grid grid-cols-3 gap-4">
                <div className="p-3 rounded-md border bg-background text-center">
                  <p className="text-xs text-muted-foreground uppercase font-bold">Total Rows</p>
                  <p className="text-2xl font-black">{summary.totalRows}</p>
                </div>
                <div className="p-3 rounded-md border bg-background text-center">
                  <p className="text-xs text-muted-foreground uppercase font-bold text-green-600">Valid</p>
                  <p className="text-2xl font-black text-green-600">{summary.validRows}</p>
                </div>
                <div className="p-3 rounded-md border bg-background text-center">
                  <p className="text-xs text-muted-foreground uppercase font-bold text-destructive">Errors</p>
                  <p className="text-2xl font-black text-destructive">{summary.errorRows}</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Level</TableHead>
                      <TableHead>Area Name</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Service Fee</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.rows.map((row, i) => (
                      <TableRow key={i} className={!row.valid ? "bg-destructive/5" : undefined}>
                        <TableCell>
                          <Badge variant="outline" className="uppercase text-[10px]">
                            {row.data.targetType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{row.data.targetName}</div>
                          {row.errors.map((err, ei) => (
                            <p key={ei} className="text-[10px] text-destructive flex items-center gap-1">
                              <XCircle className="size-3" /> {err}
                            </p>
                          ))}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {row.data.unitPrice.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {row.data.serviceFee.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {row.valid ? (
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100 shadow-none border-transparent">Ready</Badge>
                          ) : (
                            <Badge variant="destructive">Error</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="p-4 border-t flex justify-between items-center bg-background">
                <Button variant="ghost" onClick={() => setStep("upload")}>Back</Button>
                <Button
                  onClick={handleConfirm}
                  disabled={pending || summary.validRows === 0}
                  className="gap-2"
                >
                  {pending && <Loader2 className="size-4 animate-spin" />}
                  Finalize {summary.validRows} Updates
                </Button>
              </div>
            </div>
          )}

          {step === "done" && importResult && (
            <div className="p-12 flex flex-col items-center justify-center space-y-6 text-center">
              <CheckCircle2 className="size-16 text-green-500" />
              <div className="space-y-2">
                <h3 className="text-2xl font-bold">Import Completed!</h3>
                <p className="text-muted-foreground">
                  Successfully processed {importResult.count} tariff updates.
                </p>
              </div>
              <Button onClick={reset} className="w-full max-w-xs">Return to Tariffs</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
