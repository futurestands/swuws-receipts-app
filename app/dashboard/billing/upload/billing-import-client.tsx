"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import {
  Download,
  Upload,
  CheckCircle2,
  Loader2,
  ChevronRight,
} from "lucide-react"
import {
  validateBillingImport,
  importBilling,
  downloadBillingTemplate,
  BillingImportSummary,
} from "@/app/actions/billing"
import { cn } from "@/lib/utils"
import { formatUGX } from "@/lib/format"
import { FormField } from "@/components/ui/form-layout"
import { StatCard, StatCardGrid } from "@/components/ui/stat-card"
import { ScrollableTableContainer } from "@/components/ui/responsive-table"

type Step = "setup" | "preview" | "confirm" | "complete"

interface Props {
  schemes: { id: string; name: string }[]
  periods: { id: string; periodName: string; status: string }[]
}

export function BillingImportClient({ schemes, periods }: Props) {
  const [step, setStep] = useState<Step>("setup")
  const [schemeId, setSchemeId] = useState("")
  const [periodId, setPeriodId] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [summary, setSummary] = useState<BillingImportSummary | null>(null)
  const [isValidating, startValidating] = useTransition()
  const [isImporting, startImporting] = useTransition()
  const [result, setResult] = useState<{ imported: number; failed: number; report: string } | null>(null)

  async function handleDownloadTemplate() {
    const base64 = await downloadBillingTemplate()
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
    a.download = `monthly-billing-template.xlsx`
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
    if (!file || !schemeId || !periodId) {
      toast.error("Please select a scheme, period and file")
      return
    }

    const formData = new FormData()
    formData.append("file", file)
    formData.append("schemeId", schemeId)
    formData.append("billingPeriodId", periodId)

    startValidating(async () => {
      const response = await validateBillingImport(formData)
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
    if (!summary || !file) return

    startImporting(async () => {
      const response = await importBilling(summary, file.name)
      if (response.ok) {
        setResult({ imported: response.imported, failed: response.failed, report: response.report })
        setStep("complete")
        toast.success(`Import complete: ${response.imported} records created.`)
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
    a.download = "billing-import-report.csv"
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const renderProgress = () => {
    const steps: { key: Step; label: string }[] = [
      { key: "setup", label: "Setup" },
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
              <CardDescription>Use the standardized template for external billing data.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full h-11" onClick={handleDownloadTemplate}>
                Download Excel (.xlsx)
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4" /> 2. Configure & Import
              </CardTitle>
              <CardDescription>Select scheme and a <strong>Draft</strong> collection period.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField label="Water Scheme" htmlFor="schemeSelectTrigger">
                <Select value={schemeId} onValueChange={(v) => setSchemeId(v ?? "")}>
                  <SelectTrigger id="schemeSelectTrigger" className="h-11">
                    <SelectValue placeholder="Select scheme" />
                  </SelectTrigger>
                  <SelectContent>
                    {schemes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Billing Period" htmlFor="periodSelectTrigger">
                <Select value={periodId} onValueChange={(v) => setPeriodId(v ?? "")}>
                  <SelectTrigger id="periodSelectTrigger" className="h-11">
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.map((p) => (
                      <SelectItem key={p.id} value={p.id} disabled={p.status === 'closed' || p.status === 'archived'}>
                        {p.periodName} {p.status !== 'active' && p.status !== 'draft' ? `(${p.status})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Monthly Billing File" htmlFor="billingFileInput">
                <Input id="billingFileInput" type="file" accept=".csv, .xlsx" onChange={handleFileChange} className="h-11" />
              </FormField>
            </CardContent>
            <CardFooter>
              <Button className="w-full h-11" onClick={handleValidate} disabled={!file || !schemeId || !periodId || isValidating}>
                {isValidating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Validate & Preview Import"}
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
              <CardDescription>Check for any errors in the data.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="h-11" onClick={() => setStep("setup")}>Back</Button>
              <Button size="sm" className="h-11" onClick={() => setStep("confirm")} disabled={summary.validRows === 0}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <StatCardGrid className="sm:grid-cols-3">
              <StatCard label="Total Rows" value={summary.totalRows} />
              <StatCard label="Valid" value={<span className="text-green-600">{summary.validRows}</span>} />
              <StatCard label="Errors" value={<span className="text-destructive">{summary.errorRows}</span>} />
            </StatCardGrid>

            <ScrollableTableContainer className="max-h-[400px]">
              <Table>
                <TableHeader className="sticky top-0 bg-white">
                  <TableRow>
                    <TableHead>Account #</TableHead>
                    <TableHead>Total Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.rows.map((row, i) => (
                    <TableRow key={i} className={cn(!row.valid && "bg-destructive/5")}>
                      <TableCell className="font-medium text-xs">{row.data.accountNumber}</TableCell>
                      <TableCell className="text-xs">{formatUGX(row.data.totalDue)}</TableCell>
                      <TableCell>
                        {row.valid ? (
                          <Badge variant="outline" className="text-green-600 border-green-200">Valid</Badge>
                        ) : (
                          <Badge variant="destructive">Error</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.errors.map((err, j) => (
                          <p key={j} className="text-[10px] text-destructive">{err}</p>
                        ))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollableTableContainer>
          </CardContent>
        </Card>
      )}

      {step === "confirm" && summary && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>Confirm Import</CardTitle>
            <CardDescription>Review the final totals before processing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
             <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                   <span className="text-muted-foreground">Scheme:</span>
                   <span className="font-medium">{schemes.find(s => s.id === schemeId)?.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                   <span className="text-muted-foreground">Period:</span>
                   <span className="font-medium">{periods.find(p => p.id === periodId)?.periodName}</span>
                </div>
                <div className="flex justify-between text-sm border-t pt-2 mt-2">
                   <span className="text-muted-foreground">Total Records:</span>
                   <span className="font-bold text-primary">{summary.validRows}</span>
                </div>
             </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="ghost" className="h-11" onClick={() => setStep("preview")}>Back</Button>
            <Button className="h-11" onClick={handleConfirm} disabled={isImporting}>
              {isImporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Start Import"}
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === "complete" && result && (
        <Card className="border-green-200 bg-green-50/20">
          <CardHeader className="text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-600 mb-2" />
            <CardTitle>Monthly Billing Imported</CardTitle>
            <CardDescription>The external billing data has been successfully processed.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatCardGrid className="sm:grid-cols-2">
              <StatCard label="Imported" value={<span className="text-2xl text-green-600">{result.imported}</span>} />
              <StatCard label="Errors" value={<span className="text-2xl text-destructive">{result.failed}</span>} />
            </StatCardGrid>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button variant="outline" onClick={handleDownloadReport} className="w-full sm:w-auto h-11">
              Download Report
            </Button>
            <Button asChild className="w-full sm:w-auto h-11">
              <Link href="/dashboard/billing">Back to Dashboard</Link>
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}
