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
} from "@/app/actions/daily-collections"
import { cn } from "@/lib/utils"
import { formatUGX, formatDate } from "@/lib/format"
import { StatCard, StatCardGrid } from "@/components/ui/stat-card"
import { ScrollableTableContainer } from "@/components/ui/responsive-table"
import { DynamicIcon } from "@/components/layout/icons"
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

  // Unified summary state to prevent logic mismatches
  const [summary, setSummary] = useState<any | null>(null)
  const [isProcessing, startTransition] = useTransition()

  async function handleDownloadTemplate(format: "xlsx" | "csv") {
    if (mode === "sync") {
       const headers = ["MeterRef", "AccountBalance"]
       const sample = [{ MeterRef: "6000000000", AccountBalance: "50000" }]
       const ws = XLSX.utils.json_to_sheet(sample, { header: headers })
       const wb = XLSX.utils.book_new()
       XLSX.utils.book_append_sheet(wb, ws, "BalanceSync")
       XLSX.writeFile(wb, `daily_sync_template.${format}`)
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
        type: format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv"
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

  async function handleValidate() {
    if (!file) return
    const formData = new FormData()
    formData.append("file", file)

    startTransition(async () => {
      const response = mode === "sync"
        ? await validateDailyBalanceSync(formData)
        : await validateDailyCollectionImport(formData)

      if (response.ok) {
        setSummary(response.summary)
        setStep("preview")
        toast.success("File analyzed successfully")
      } else {
        toast.error(response.error)
      }
    })
  }

  async function handleConfirm() {
    if (!summary) return
    startTransition(async () => {
      const response = mode === "sync"
        ? await commitDailyBalanceSync(summary)
        : await commitDailyCollectionImport(summary)

      if (response.ok) {
        setStep("complete")
        toast.success("Success!")
        router.refresh()
      } else {
        toast.error("Import failed. Please check the file for duplicates or errors.")
      }
    })
  }

  const renderProgress = () => {
    const steps: { key: Step; label: string }[] = [
      { key: "setup", label: "Upload" },
      { key: "preview", label: "Analyze" },
      { key: "confirm", label: "Verify" },
      { key: "complete", label: "Finish" },
    ]

    return (
      <div className="flex items-center justify-center mb-6">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center">
            <div className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-200",
              step === s.key ? "bg-primary text-primary-foreground ring-4 ring-primary/10" :
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

      <DialogContent className={cn("transition-all duration-300 max-h-[90vh] flex flex-col p-0 overflow-hidden", step === "preview" ? "sm:max-w-4xl" : "sm:max-w-md")}>
        <div className="p-6 pb-0">
          <DialogHeader>
            <DialogTitle>Import Daily Collection Report</DialogTitle>
            <DialogDescription>
              Align your portal with the External Billing System.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {renderProgress()}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-2">
          {step === "setup" && (
            <div className="space-y-6">
               <div className="flex bg-muted p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setMode("sync")}
                    className={cn("flex-1 text-[10px] font-bold py-2 rounded-md transition-all", mode === 'sync' ? "bg-white shadow-sm text-primary" : "text-muted-foreground")}
                  >
                    BALANCE SYNC (2 COL)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("standard")}
                    className={cn("flex-1 text-[10px] font-bold py-2 rounded-md transition-all", mode === 'standard' ? "bg-white shadow-sm text-primary" : "text-muted-foreground")}
                  >
                    FULL REPORT (6 COL)
                  </button>
               </div>

               <div className="p-8 bg-muted/30 rounded-2xl border-2 border-dashed border-muted flex flex-col items-center gap-3 hover:bg-muted/50 transition-colors cursor-pointer group relative">
                  <FileSpreadsheet className="h-10 w-10 text-muted-foreground group-hover:text-primary transition-colors" />
                  <div className="text-center">
                    <p className="text-sm font-bold text-foreground">Select {mode === 'sync' ? 'Sync' : 'Report'} File</p>
                    <p className="text-xs text-muted-foreground">CSV or Excel format</p>
                  </div>
                  <input
                    id="daily-file"
                    type="file"
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    accept=".csv,.xlsx"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if(f) setFile(f);
                    }}
                  />
               </div>
               {file && (
                 <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/10">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-xs font-medium truncate flex-1">{file.name}</span>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setFile(null)}>Clear</Button>
                 </div>
               )}

               <div className="bg-primary/5 p-4 rounded-xl border border-primary/20 space-y-1">
                  <p className="text-[10px] font-bold text-primary uppercase">Required Columns:</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                     {mode === 'sync' ? 'MeterRef, AccountBalance' : 'Account Number, Customer Name, Amount Paid, Payment Date, External Reference, Payment Channel'}
                  </p>
               </div>
            </div>
          )}

          {step === "preview" && summary && (
            <div className="space-y-6 pb-4">
               <StatCardGrid className="sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  <StatCard
                    label={mode === 'sync' ? "Sync Records" : "Report Date"}
                    value={mode === 'sync' ? summary.totalRecords : formatDate(summary.businessDate)}
                  />
                  <StatCard label="Valid" value={<span className="text-green-600">{summary.validRecords}</span>} />
                  <StatCard label="Errors" value={<span className="text-destructive">{summary.failedRecords}</span>} />
                  <StatCard label="Total Recovery" value={<span className="text-primary">{formatUGX(mode === 'sync' ? summary.totalCollection : summary.totalAmount)}</span>} />
               </StatCardGrid>

               <div className="border rounded-xl overflow-hidden shadow-sm">
                  <ScrollableTableContainer className="max-h-[350px]">
                     <Table>
                        <TableHeader className="sticky top-0 bg-white z-10">
                           <TableRow>
                              <TableHead className="text-[10px] font-bold">ACCOUNT #</TableHead>
                              <TableHead className="text-[10px] font-bold">{mode === 'sync' ? "NEW BALANCE" : "AMOUNT"}</TableHead>
                              {mode === 'sync' && <TableHead className="text-[10px] font-bold">REDUCTION</TableHead>}
                              <TableHead className="text-[10px] font-bold">STATUS</TableHead>
                           </TableRow>
                        </TableHeader>
                        <TableBody>
                           {summary.rows?.slice(0, 50).map((row: any, i: number) => (
                             <TableRow key={i} className={cn(!row.valid && "bg-destructive/5")}>
                                <TableCell className="text-[11px] font-mono font-medium">{row.data.accountNumber}</TableCell>
                                <TableCell className="text-[11px] font-medium">{formatUGX(mode === 'sync' ? row.data.totalDue : row.data.amountPaid)}</TableCell>
                                {mode === 'sync' && <TableCell className="text-[11px] text-green-600 font-bold">{(row as any).collection > 0 ? `+${formatUGX((row as any).collection)}` : '—'}</TableCell>}
                                <TableCell>
                                   {row.valid ? <Badge variant="outline" className="text-[10px] text-green-600 bg-green-50 border-green-200">Valid</Badge> : <Badge variant="destructive" className="text-[10px]">Error</Badge>}
                                </TableCell>
                             </TableRow>
                           ))}
                        </TableBody>
                     </Table>
                  </ScrollableTableContainer>
               </div>
            </div>
          )}

          {step === "confirm" && summary && (
            <div className="space-y-8 py-12 text-center animate-in zoom-in-95 duration-300">
               <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary relative">
                  <div className="absolute inset-0 bg-primary/5 rounded-full animate-ping"></div>
                  <AlertCircle className="h-10 w-10 relative z-10" />
               </div>
               <div className="space-y-2">
                  <h3 className="text-2xl font-black tracking-tight">Ready to Process?</h3>
                  <p className="text-sm text-muted-foreground px-6 leading-relaxed">
                    You are about to process <strong>{summary.validRecords}</strong> records.
                    {mode === 'sync' ? ' Customer balances will be updated to the latest EBS values and ' : ''}
                    <strong>{formatUGX(mode === 'sync' ? summary.totalCollection : summary.totalAmount)}</strong> will be added to today&apos;s collections.
                  </p>
               </div>
            </div>
          )}

          {step === "complete" && summary && (
            <div className="space-y-8 py-12 text-center animate-in slide-in-from-bottom-4">
               <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-600">
                  <CheckCircle2 className="h-12 w-10" />
               </div>
               <div className="space-y-1">
                  <h3 className="text-2xl font-black tracking-tight">Alignment Complete</h3>
                  <p className="text-sm text-muted-foreground">The portal and EBS are now in sync.</p>
               </div>
               <div className="bg-muted/30 p-6 rounded-3xl space-y-3 max-w-[280px] mx-auto text-left border border-border">
                  <div className="flex justify-between text-[10px] font-bold text-muted-foreground uppercase">
                     <span>Records:</span>
                     <span className="text-foreground">{summary.totalRecords}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-muted-foreground uppercase">
                     <span>New Recovery:</span>
                     <span className="text-primary">{formatUGX(mode === 'sync' ? summary.totalCollection : summary.totalAmount)}</span>
                  </div>
               </div>
            </div>
          )}
        </div>

        <div className="p-6 pt-4 border-t bg-white relative z-[100] shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.05)]">
           {step === "setup" && (
             <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                   <span className="text-[10px] text-muted-foreground uppercase font-black">Templates:</span>
                   <div className="flex gap-4">
                      <Button variant="ghost" size="sm" className="h-7 text-[10px] text-primary font-bold hover:bg-primary/5" onClick={() => handleDownloadTemplate("xlsx")}>XLSX</Button>
                      <Button variant="ghost" size="sm" className="h-7 text-[10px] text-primary font-bold hover:bg-primary/5" onClick={() => handleDownloadTemplate("csv")}>CSV</Button>
                   </div>
                </div>
                <Button className="w-full h-12 text-base font-bold shadow-lg" disabled={!file || isProcessing} onClick={handleValidate}>
                   {isProcessing ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <ChevronRight className="h-5 w-5 mr-2" />}
                   Analyze File
                </Button>
             </div>
           )}

           {step === "preview" && (
             <div className="flex gap-3">
                <Button variant="outline" className="flex-1 h-12 font-bold" onClick={() => setStep("setup")}>Back</Button>
                <Button
                  className="flex-[2] h-12 font-bold shadow-lg"
                  disabled={isProcessing}
                  onClick={() => setStep("confirm")}
                >
                   Verify Totals <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
             </div>
           )}

           {step === "confirm" && (
             <div className="flex flex-col gap-3">
                <Button className="w-full h-14 text-xl font-black shadow-xl" disabled={isProcessing} onClick={handleConfirm}>
                   {isProcessing ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : "PROCEED TO SYNC"}
                </Button>
                <Button variant="ghost" className="w-full h-11 font-bold text-muted-foreground" disabled={isProcessing} onClick={() => setStep("preview")}>
                   Go Back & Review
                </Button>
             </div>
           )}

           {step === "complete" && (
             <Button className="w-full h-12 font-bold" onClick={() => setOpen(false)}>Done</Button>
           )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
