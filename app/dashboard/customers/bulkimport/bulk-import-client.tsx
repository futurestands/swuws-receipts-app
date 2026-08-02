"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import {
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  FileSpreadsheet,
  Loader2,
  ChevronRight,
  ChevronLeft,
  XCircle,
  RefreshCw,
} from "lucide-react"
import {
  validateCustomerImport,
  importCustomers,
  downloadCustomerTemplate,
  CustomerImportSummary,
} from "@/app/actions/customer-import"
import { cn } from "@/lib/utils"

type Step = "setup" | "preview" | "confirm" | "complete"

export function CustomerBulkImportClient() {
  const [step, setStep] = useState<Step>("setup")
  const [file, setFile] = useState<File | null>(null)
  const [allowUpdates, setAllowUpdates] = useState(false)
  const [summary, setSummary] = useState<CustomerImportSummary | null>(null)
  const [isValidating, startValidating] = useTransition()
  const [isImporting, startImporting] = useTransition()
  const [result, setResult] = useState<{ imported: number; updated: number; failed: number; report: string } | null>(null)

  async function handleDownloadTemplate() {
    const base64 = await downloadCustomerTemplate()
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
    a.download = `customer-import-template.xlsx`
    a.click()
    window.URL.revokeObjectURL(url)
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
    formData.append("allowUpdates", allowUpdates.toString())

    startValidating(async () => {
      const response = await validateCustomerImport(formData)
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

    startImporting(async () => {
      const response = await importCustomers(summary)
      if (response.ok) {
        setResult({
          imported: response.imported,
          updated: response.updated,
          failed: response.failed,
          report: response.report
        })
        setStep("complete")
        toast.success(`Import complete: ${response.imported} new, ${response.updated} updated.`)
      } else {
        toast.error(response.error)
      }
    })
  }

  function handleDownloadReport() {
    if (!result?.report) return
    const blob = new Blob([result.report], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "customer-import-report.csv"
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const renderProgress = () => {
    const steps: { key: Step; label: string }[] = [
      { key: "setup", label: "Upload" },
      { key: "preview", label: "Preview" },
      { key: "confirm", label: "Confirm" },
      { key: "complete", label: "Complete" },
    ]

    return (
      <div className="flex items-center justify-center mb-8">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors",
                step === s.key
                  ? "bg-primary text-primary-foreground"
                  : steps.findIndex((x) => x.key === step) > i
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {steps.findIndex((x) => x.key === step) > i ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            <span
              className={cn(
                "ml-2 mr-4 text-xs font-medium hidden sm:inline",
                step === s.key ? "text-primary" : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && <div className="h-px w-8 bg-muted mr-4 hidden sm:block" />}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {renderProgress()}

      {step === "setup" && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Download className="h-4 w-4" /> 1. Download Template
              </CardTitle>
              <CardDescription>Start with our official template to ensure data compatibility.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button variant="outline" onClick={handleDownloadTemplate}>
                Excel (.xlsx)
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4" /> 2. Upload File
              </CardTitle>
              <CardDescription>Select your filled template for validation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="file">Spreadsheet</Label>
                <Input id="file" type="file" accept=".csv, .xlsx" onChange={handleFileChange} />
              </div>

              <div className="flex items-center space-x-2 p-3 bg-primary/5 border rounded-lg">
                <input
                  type="checkbox"
                  id="upsert"
                  checked={allowUpdates}
                  onChange={(e) => setAllowUpdates(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <Label htmlFor="upsert" className="text-sm font-medium leading-none cursor-pointer">
                  Smart Sync: Update existing customers if found
                </Label>
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onClick={handleValidate} disabled={!file || isValidating}>
                {isValidating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Validate & Preview"}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {step === "preview" && summary && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Validation Results</CardTitle>
              <CardDescription>Review detected issues before proceeding.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep("setup")}>
                Back
              </Button>
              <Button size="sm" onClick={() => setStep("confirm")} disabled={summary.validRows === 0}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 px-4 bg-muted/50 rounded-lg">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase">Total Rows</span>
                <span className="text-lg font-bold">{summary.totalRows}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-green-600 uppercase">Valid</span>
                <span className="text-lg font-bold text-green-600">{summary.validRows}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-amber-600 uppercase">Warnings</span>
                <span className="text-lg font-bold text-amber-600">{summary.warningRows}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-destructive uppercase">Errors</span>
                <span className="text-lg font-bold text-destructive">{summary.errorRows}</span>
              </div>
            </div>

            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Account #</TableHead>
                    <TableHead>Scheme</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.rows.slice(0, 100).map((row, i) => (
                    <TableRow key={i} className={cn(!row.valid ? "bg-destructive/5" : "hover:bg-muted/50")}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>
                        {row.valid ? (
                          <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                            Valid
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Error</Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-xs">{row.data.name}</TableCell>
                      <TableCell className="text-xs">{row.data.customerAccount}</TableCell>
                      <TableCell className="text-xs">{row.data.schemeName}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {row.errors.map((err, j) => (
                            <p key={j} className="text-[10px] text-destructive flex items-start gap-1">
                              <XCircle className="h-3 w-3 mt-0.5 shrink-0" /> {err}
                            </p>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {summary.rows.length > 100 && (
              <p className="text-center text-xs text-muted-foreground italic py-2 border-t">
                Showing first 100 of {summary.rows.length} rows. Full validation is being processed in the background.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {step === "confirm" && summary && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>Final Confirmation</CardTitle>
            <CardDescription>Please confirm you want to proceed with the import.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <p className="font-medium">You are about to create {summary.validRows} customer records.</p>
                <p className="text-sm text-muted-foreground">
                  The records will be associated with your current user account as the creator.
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep("preview")}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back to Preview
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("setup")}>
                Cancel
              </Button>
              <Button onClick={handleConfirm} disabled={isImporting}>
                {isImporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Confirm Import"}
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}

      {step === "complete" && result && (
        <Card className="border-green-200 bg-green-50/20">
          <CardHeader className="text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-green-100 flex items-center justify-center text-green-600 mb-2">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <CardTitle>Import Finished</CardTitle>
            <CardDescription>The bulk customer import process has completed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-lg border text-center">
                <p className="text-3xl font-bold text-green-600">{result.imported}</p>
                <p className="text-xs text-muted-foreground uppercase">New Records Created</p>
              </div>
              <div className="bg-white p-4 rounded-lg border text-center">
                <p className="text-3xl font-bold text-primary">{result.updated}</p>
                <p className="text-xs text-muted-foreground uppercase">Existing Records Updated</p>
              </div>
              <div className="bg-white p-4 rounded-lg border text-center col-span-2">
                <p className="text-3xl font-bold text-destructive">{result.failed}</p>
                <p className="text-xs text-muted-foreground uppercase">Failed / Skipped</p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button variant="outline" onClick={handleDownloadReport} className="w-full sm:w-auto">
              <Download className="h-4 w-4 mr-2" /> Download Import Report
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setStep("setup")
                setFile(null)
                setSummary(null)
                setResult(null)
              }}
              className="w-full sm:w-auto"
            >
              <RefreshCw className="h-4 w-4 mr-2" /> Import Another File
            </Button>
            <Button asChild className="w-full sm:w-auto">
              <Link href="/dashboard/customers">Return to Customers</Link>
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}
