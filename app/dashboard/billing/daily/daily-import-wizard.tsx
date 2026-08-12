"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronRight,
  FileSpreadsheet,
  ShieldAlert,
} from "lucide-react"
import {
  validateDailyCollectionImport,
  commitDailyCollectionImport,
  validateDailyBalanceSync,
  commitDailyBalanceSync,
  downloadDailyCollectionTemplate,
  DailyValidationSummary,
  DailySyncSummary,
} from "@/app/actions/daily-collections"
import { cn } from "@/lib/utils"
import { formatUGX, formatDate } from "@/lib/format"
import { StatCard, StatCardGrid } from "@/components/ui/stat-card"
import { ScrollableTableContainer } from "@/components/ui/responsive-table"
import * as XLSX from "xlsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

type Step = "setup" | "preview" | "confirm" | "complete"

export function DailyImportWizard() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("setup")
  const [mode, setMode] = useState<"standard" | "sync">("sync")
  const [file, setFile] = useState<File | null>(null)
  const [summary, setSummary] = useState<DailyValidationSummary | null>(null)
  const [syncSummary, setSyncSummary] = useState<DailySyncSummary | null>(null)
  const [isProcessing, startTransition] = useTransition()

  async function handleDownloadTemplate(format: "xlsx" | "csv") {
    // If in sync mode, we use the simple template
    if (mode === "sync") {
       // Mock simple download for sync mode
       const headers = ["AccountNumber", "TotalAmountDue"]
       const sample = [{ AccountNumber: "6000000000", TotalAmountDue: "50000" }]
       const ws = XLSX.utils.json_to_sheet(sample, { header: headers })
       const wb = XLSX.utils.book_new()
       XLSX.utils.book_append_sheet(wb, ws, "BalanceSync")
       XLSX.writeFile(wb, `balance_sync_template.${format}`)
       return
    }

    try {
      const base64 = await downloadDailyCollectionTemplate(format)
      const byteCharacters = atob(base64)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], {
        type: format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/csv"
      })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `daily_collection_template.${format}`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      toast.error("Failed to download template")
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (!selected) return
    const ext = selected.name.split(".").pop()?.toLowerCase()
    if (ext !== "csv" && ext !== "xlsx") {
      toast.error("Invalid file format. Please upload .csv or .xlsx")
      return
    }
    setFile(selected)
  }

  async function handleValidate() {
    if (!file) return
    const formData = new FormData()
    formData.append("file", file)

    startTransition(async () => {
      if (mode === "sync") {
        const response = await validateDailyBalanceSync(formData)
        if (response.ok) {
          setSyncSummary(response.summary)
          setStep("preview")
          toast.success("Balance analysis complete")
        } else {
          toast.error(response.error)
        }
      } else {
        const response = await validateDailyCollectionImport(formData)
        if (response.ok) {
          setSummary(response.summary)
          setStep("preview")
          toast.success("Validation complete")
        } else {
          toast.error(response.error)
        }
      }
    })
  }

  async function handleConfirm() {
    startTransition(async () => {
      if (mode === "sync") {
        if (!syncSummary) return
        const response = await commitDailyBalanceSync(syncSummary)
        if (response.ok) {
          setStep("complete")
          toast.success("Balances synced successfully")
          router.refresh()
        } else {
          toast.error(response.error)
        }
      } else {
        if (!summary) return
        const response = await commitDailyCollectionImport(summary)
        if (response.ok) {
          setStep("complete")
          toast.success("Import processed successfully")
          router.refresh()
        } else {
          toast.error(response.error)
        }
      }
    })
  }

  const renderProgress = () => {
    const steps: { key: Step; label: string }[] = [
      { key: "setup", label: "Select" },
      { key: "preview", label: "Preview" },
      { key: "confirm", label: "Confirm" },
      { key: "complete", label: "Done" },
    ]

    return (
      <div className="flex items-center justify-center mb-6">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center">
            <div className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-colors",
              step === s.key ? "bg-primary text-primary-foreground" :
              steps.findIndex(x => x.key === step) > i ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
            )}>
              {steps.findIndex(x => x.key === step) > i ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
            </div>
            {i < steps.length - 1 && <div className="h-px w-6 bg-muted mx-2" />}
          </div>
        ))}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => {
      setOpen(v)
      if (!v) { setStep("setup"); setFile(null); setSummary(null); }
    }}>
      <DialogTrigger asChild>
        <Button className="h-11">
          <Upload className="mr-2 h-4 w-4" /> Import Daily Collection
        </Button>
      </DialogTrigger>
      <DialogContent className={cn("transition-all duration-300", step === "preview" ? "sm:max-w-4xl" : "sm:max-w-md")}>
        <DialogHeader>
          <DialogTitle>Import Daily Collection Report</DialogTitle>
          <DialogDescription>
            Upload confirmed payment exports from the External Billing System.
          </DialogDescription>
        </DialogHeader>

        {renderProgress()}

        {step === "setup" && (
          <div className="space-y-6 py-4">
             <div className="flex bg-muted p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setMode("sync")}
                  className={cn("flex-1 text-[10px] font-bold py-2 rounded-md transition-all", mode === 'sync' ? "bg-white shadow-sm text-primary" : "text-muted-foreground")}
                >
                  BALANCE SYNC (2 COLUMNS)
                </button>
                <button
                  type="button"
                  onClick={() => setMode("standard")}
                  className={cn("flex-1 text-[10px] font-bold py-2 rounded-md transition-all", mode === 'standard' ? "bg-white shadow-sm text-primary" : "text-muted-foreground")}
                >
                  FULL REPORT (6 COLUMNS)
                </button>
             </div>

             <div className="p-4 bg-muted/50 rounded-lg border border-dashed flex flex-col items-center gap-2">
                <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                <Label htmlFor="daily-file" className="cursor-pointer text-primary hover:underline">
                  Click to select file (.xlsx or .csv)
                </Label>
                <Input
                  id="daily-file"
                  type="file"
                  className="hidden"
                  accept=".csv,.xlsx"
                  onChange={handleFileChange}
                />
                {file && <p className="text-xs font-medium">{file.name}</p>}
             </div>

             <div className="bg-primary/5 p-3 rounded-lg border border-primary/20">
                <p className="text-[10px] font-bold text-primary mb-1 uppercase">Expected Columns ({mode === 'sync' ? '2' : '6'}):</p>
                <p className="text-[10px] text-muted-foreground">
                   {mode === 'sync' ? 'AccountNumber, TotalAmountDue' : 'Account Number, Customer Name, Amount Paid, Payment Date, External Reference, Payment Channel'}
                </p>
             </div>

             <div className="flex items-center justify-between px-1">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Need a template?</span>
                <div className="flex gap-2">
                   <button
                      type="button"
                      onClick={() => handleDownloadTemplate("xlsx")}
                      className="text-[10px] text-primary hover:underline font-medium"
                   >
                      Excel (.xlsx)
                   </button>
                   <span className="text-[10px] text-muted-foreground">|</span>
                   <button
                      type="button"
                      onClick={() => handleDownloadTemplate("csv")}
                      className="text-[10px] text-primary hover:underline font-medium"
                   >
                      CSV (.csv)
                   </button>
                </div>
             </div>

             <Button className="w-full h-11" disabled={!file || isProcessing} onClick={handleValidate}>
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Analyze File"}
             </Button>
          </div>
        )}

        {step === "preview" && (summary || syncSummary) && (
          <div className="space-y-4 py-2">
             <StatCardGrid className="sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                   label={mode === 'sync' ? "Sync Records" : "Business Date"}
                   value={mode === 'sync' ? syncSummary?.totalRecords : formatDate(summary?.businessDate || "")}
                />
                <StatCard
                   label="Valid Records"
                   value={<span className="text-green-600">{mode === 'sync' ? syncSummary?.validRecords : summary?.validRecords}</span>}
                />
                <StatCard
                   label="Errors"
                   value={<span className="text-destructive">{mode === 'sync' ? syncSummary?.failedRecords : summary?.failedRecords}</span>}
                />
                <StatCard
                   label="Total Collection"
                   value={<span className="text-primary">{formatUGX(mode === 'sync' ? syncSummary?.totalCollection || 0 : summary?.totalAmount || 0)}</span>}
                />
             </StatCardGrid>

             <ScrollableTableContainer className="max-h-[300px]">
                <Table>
                   <TableHeader className="sticky top-0 bg-white">
                      <TableRow>
                         <TableHead>Account #</TableHead>
                         <TableHead>{mode === 'sync' ? "New Balance" : "Amount"}</TableHead>
                         {mode === 'sync' && <TableHead>Reduction</TableHead>}
                         <TableHead>Status</TableHead>
                         <TableHead>Issues</TableHead>
                      </TableRow>
                   </TableHeader>
                   <TableBody>
                      {(mode === 'sync' ? syncSummary?.rows : summary?.rows)?.slice(0, 50).map((row, i) => (
                        <TableRow key={i} className={cn(!row.valid && "bg-destructive/5")}>
                           <TableCell className="text-xs font-mono">{row.data.accountNumber}</TableCell>
                           <TableCell className="text-xs">{formatUGX(mode === 'sync' ? (row.data as any).totalDue : (row.data as any).amountPaid)}</TableCell>
                           {mode === 'sync' && <TableCell className="text-xs text-green-600 font-bold">{(row as any).collection > 0 ? `+${formatUGX((row as any).collection)}` : '—'}</TableCell>}
                           <TableCell>
                              {row.valid ? <Badge variant="outline" className="text-green-600 bg-green-50">Valid</Badge> : <Badge variant="destructive">Error</Badge>}
                           </TableCell>
                           <TableCell className="text-[10px] text-destructive italic">
                              {row.errors.join(", ")}
                           </TableCell>
                        </TableRow>
                      ))}
                   </TableBody>
                </Table>
             </ScrollableTableContainer>

             <div className="flex justify-between gap-3 pt-4">
                <Button variant="outline" className="h-11" onClick={() => setStep("setup")}>Back</Button>
                <Button className="h-11" disabled={((mode === 'sync' ? syncSummary?.validRecords : summary?.validRecords) || 0) === 0 || isProcessing} onClick={() => setStep("confirm")}>
                   Confirm Totals <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
             </div>
          </div>
        )}

        {step === "confirm" && (summary || syncSummary) && (
          <div className="space-y-6 py-6">
             <div className="text-center space-y-2">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-2">
                   <AlertCircle className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold">Ready to Sync?</h3>
                <p className="text-sm text-muted-foreground">
                  You are about to process <strong>{mode === 'sync' ? syncSummary?.validRecords : summary?.validRecords}</strong> records.
                  {mode === 'sync' ? ' Customer balances will be updated and' : ''} <strong>{formatUGX(mode === 'sync' ? syncSummary?.totalCollection || 0 : summary?.totalAmount || 0)}</strong> will be registered as confirmed bank collections.
                </p>
             </div>

             <div className="flex flex-col gap-2">
                <Button className="w-full h-12 text-lg" disabled={isProcessing} onClick={handleConfirm}>
                   {isProcessing ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : "Process Sync Now"}
                </Button>
                <Button variant="ghost" className="h-11" disabled={isProcessing} onClick={() => setStep("preview")}>
                   Review Records Again
                </Button>
             </div>
          </div>
        )}

        {step === "complete" && (summary || syncSummary) && (
          <div className="space-y-6 py-6 text-center">
             <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 mb-2">
                <CheckCircle2 className="h-10 w-10" />
             </div>
             <div className="space-y-1">
                <h3 className="text-xl font-bold">{mode === 'sync' ? 'Balance Sync' : 'Import'} Successful</h3>
                <p className="text-sm text-muted-foreground">{mode === 'sync' ? 'Account balances have been updated and daily totals updated.' : 'The daily collection report has been recorded in the audit trail.'}</p>
             </div>

             <div className="bg-muted/50 p-4 rounded-xl space-y-2 text-left">
                <div className="flex justify-between text-xs">
                   <span className="text-muted-foreground">{mode === 'sync' ? 'Records Synced:' : 'Business Date:'}</span>
                   <span className="font-bold">{mode === 'sync' ? syncSummary?.totalRecords : formatDate(summary?.businessDate || "")}</span>
                </div>
                <div className="flex justify-between text-xs">
                   <span className="text-muted-foreground">Confirmed Collection:</span>
                   <span className="font-bold text-primary">{formatUGX(mode === 'sync' ? syncSummary?.totalCollection || 0 : summary?.totalAmount || 0)}</span>
                </div>
             </div>

             <Button className="w-full h-11" onClick={() => setOpen(false)}>Close Wizard</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
