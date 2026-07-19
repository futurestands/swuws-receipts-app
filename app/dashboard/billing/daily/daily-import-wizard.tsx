"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
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
  ChevronLeft,
  XCircle,
  FileSpreadsheet,
  Calendar,
  ShieldAlert,
} from "lucide-react"
import {
  validateDailyCollectionImport,
  commitDailyCollectionImport,
  DailyValidationSummary,
} from "@/app/actions/daily-collections"
import { cn } from "@/lib/utils"
import { formatUGX, formatDate } from "@/lib/format"
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
  const [file, setFile] = useState<File | null>(null)
  const [summary, setSummary] = useState<DailyValidationSummary | null>(null)
  const [isProcessing, startTransition] = useTransition()

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
      const response = await validateDailyCollectionImport(formData)
      if (response.ok) {
        setSummary(response.summary)
        setStep("preview")
        toast.success("Validation complete")
      } else {
        toast.error(response.error)
      }
    })
  }

  async function handleConfirm() {
    if (!summary) return
    startTransition(async () => {
      const response = await commitDailyCollectionImport(summary)
      if (response.ok) {
        setStep("complete")
        toast.success("Import processed successfully")
        router.refresh()
      } else {
        toast.error(response.error)
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
        <Button>
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
          <div className="space-y-4 py-4">
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
             <Button className="w-full" disabled={!file || isProcessing} onClick={handleValidate}>
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Analyze File"}
             </Button>
          </div>
        )}

        {step === "preview" && summary && (
          <div className="space-y-4 py-2">
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 border rounded-lg">
                   <p className="text-[10px] uppercase font-bold text-muted-foreground">Business Date</p>
                   <p className="text-sm font-semibold">{formatDate(summary.businessDate)}</p>
                </div>
                <div className="p-3 border rounded-lg">
                   <p className="text-[10px] uppercase font-bold text-muted-foreground">Valid Records</p>
                   <p className="text-sm font-semibold text-green-600">{summary.validRecords}</p>
                </div>
                <div className="p-3 border rounded-lg">
                   <p className="text-[10px] uppercase font-bold text-muted-foreground">Errors</p>
                   <p className="text-sm font-semibold text-destructive">{summary.failedRecords}</p>
                </div>
                <div className="p-3 border rounded-lg">
                   <p className="text-[10px] uppercase font-bold text-muted-foreground">Total Amount</p>
                   <p className="text-sm font-semibold text-primary">{formatUGX(summary.totalAmount)}</p>
                </div>
             </div>

             {(summary.isDuplicateFile || summary.isDuplicateDate) && (
               <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-3 text-amber-800 text-xs">
                  <ShieldAlert className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-bold">Duplicate Detected</p>
                    <p>{summary.isDuplicateFile ? "This exact file has already been imported." : "An import already exists for this business date."}</p>
                  </div>
               </div>
             )}

             <div className="border rounded-md max-h-[300px] overflow-auto">
                <Table>
                   <TableHeader className="sticky top-0 bg-white">
                      <TableRow>
                         <TableHead>Account #</TableHead>
                         <TableHead>Amount</TableHead>
                         <TableHead>Status</TableHead>
                         <TableHead>Issues</TableHead>
                      </TableRow>
                   </TableHeader>
                   <TableBody>
                      {summary.rows.slice(0, 50).map((row, i) => (
                        <TableRow key={i} className={cn(!row.valid && "bg-destructive/5")}>
                           <TableCell className="text-xs font-mono">{row.data.accountNumber}</TableCell>
                           <TableCell className="text-xs">{formatUGX(row.data.amountPaid)}</TableCell>
                           <TableCell>
                              {row.valid ? <Badge variant="outline" className="text-green-600 bg-green-50">Valid</Badge> : <Badge variant="destructive">Error</Badge>}
                           </TableCell>
                           <TableCell className="text-[10px] text-destructive italic">
                              {row.errors.join(", ")}
                           </TableCell>
                        </TableRow>
                      ))}
                      {summary.totalRecords > 50 && (
                        <TableRow>
                           <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-4">
                              Showing first 50 of {summary.totalRecords} records...
                           </TableCell>
                        </TableRow>
                      )}
                   </TableBody>
                </Table>
             </div>

             <div className="flex justify-between gap-3 pt-4">
                <Button variant="outline" onClick={() => setStep("setup")}>Back</Button>
                <Button disabled={summary.validRecords === 0 || isProcessing} onClick={() => setStep("confirm")}>
                   Confirm Totals <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
             </div>
          </div>
        )}

        {step === "confirm" && summary && (
          <div className="space-y-6 py-6">
             <div className="text-center space-y-2">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-2">
                   <AlertCircle className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold">Ready to Import?</h3>
                <p className="text-sm text-muted-foreground">
                  You are about to import <strong>{summary.validRecords}</strong> confirmed payments for <strong>{formatDate(summary.businessDate)}</strong> totaling <strong>{formatUGX(summary.totalAmount)}</strong>.
                </p>
             </div>

             <div className="flex flex-col gap-2">
                <Button className="w-full h-12 text-lg" disabled={isProcessing} onClick={handleConfirm}>
                   {isProcessing ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : "Process Import Now"}
                </Button>
                <Button variant="ghost" disabled={isProcessing} onClick={() => setStep("preview")}>
                   Review Records Again
                </Button>
             </div>
          </div>
        )}

        {step === "complete" && summary && (
          <div className="space-y-6 py-6 text-center">
             <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 mb-2">
                <CheckCircle2 className="h-10 w-10" />
             </div>
             <div className="space-y-1">
                <h3 className="text-xl font-bold">Import Successful</h3>
                <p className="text-sm text-muted-foreground">The daily collection report has been recorded in the audit trail.</p>
             </div>

             <div className="bg-muted/50 p-4 rounded-xl space-y-2 text-left">
                <div className="flex justify-between text-xs">
                   <span className="text-muted-foreground">Business Date:</span>
                   <span className="font-bold">{formatDate(summary.businessDate)}</span>
                </div>
                <div className="flex justify-between text-xs">
                   <span className="text-muted-foreground">Total Records:</span>
                   <span className="font-bold">{summary.totalRecords}</span>
                </div>
                <div className="flex justify-between text-xs">
                   <span className="text-muted-foreground">Total Amount:</span>
                   <span className="font-bold text-primary">{formatUGX(summary.totalAmount)}</span>
                </div>
             </div>

             <Button className="w-full" onClick={() => setOpen(false)}>Close Wizard</Button>
             <p className="text-[10px] text-muted-foreground">This import is now available for future reconciliation.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
