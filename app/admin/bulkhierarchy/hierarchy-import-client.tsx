"use client"

import { useState, useTransition } from "react"
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
  validateHierarchy,
  importHierarchy,
  downloadHierarchyTemplate,
  HierarchyImportSummary,
} from "@/app/actions/hierarchy-import"
import { importUnifiedHierarchy, downloadUnifiedHierarchyTemplate } from "@/app/actions/hierarchy-engine"
import { cn } from "@/lib/utils"

type Step = "setup" | "preview" | "confirm" | "complete"

export function HierarchyImportClient() {
  const [step, setStep] = useState<Step>("setup")
  const [file, setFile] = useState<File | null>(null)
  const [formData, setFormData] = useState<FormData | null>(null)
  const [summary, setSummary] = useState<HierarchyImportSummary | null>(null)
  const [isValidating, startValidating] = useTransition()
  const [isImporting, startImporting] = useTransition()
  const [result, setResult] = useState<{ imported: number; failed: number; report: string } | null>(null)

  async function handleDownloadTemplate() {
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
    const fd = new FormData()
    fd.append("file", file)
    setFormData(fd)

    startValidating(async () => {
      const response = await validateHierarchy(fd)
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
    if (!summary || !formData) return
    startImporting(async () => {
      const response = await importUnifiedHierarchy(formData)
      if (response.ok) {
        setResult({ imported: response.imported, failed: 0, report: "" })
        setStep("complete")
        toast.success(`Import complete: ${response.imported} items created.`)
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
    a.download = "hierarchy-import-report.csv"
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
            <div className={cn("flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors", step === s.key ? "bg-primary text-primary-foreground" : steps.findIndex((x) => x.key === step) > i ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground")}>
              {steps.findIndex((x) => x.key === step) > i ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn("ml-2 mr-4 text-xs font-medium hidden sm:inline", step === s.key ? "text-primary" : "text-muted-foreground")}>{s.label}</span>
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
              <CardTitle className="text-base flex items-center gap-2"><Download className="h-4 w-4" /> 1. Download Template</CardTitle>
              <CardDescription>Start with our official template to ensure data compatibility.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" onClick={handleDownloadTemplate}>Excel (.xlsx)</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4" /> 2. Upload File</CardTitle>
              <CardDescription>Select your filled template for validation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="file">Spreadsheet</Label>
                <Input id="file" type="file" accept=".csv, .xlsx" onChange={handleFileChange} />
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
              <CardDescription>Review hierarchy items before proceeding.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep("setup")}>Back</Button>
              <Button size="sm" onClick={() => setStep("confirm")} disabled={summary.validRows === 0}>Next <ChevronRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-4 gap-4 py-4 px-4 bg-muted/50 rounded-lg text-center">
              <div><p className="text-xs text-muted-foreground uppercase">Total</p><p className="text-lg font-bold">{summary.totalRows}</p></div>
              <div><p className="text-xs text-green-600 uppercase">Valid</p><p className="text-lg font-bold text-green-600">{summary.validRows}</p></div>
              <div><p className="text-xs text-amber-600 uppercase">Warnings</p><p className="text-lg font-bold text-amber-600">{summary.warningRows}</p></div>
              <div><p className="text-xs text-destructive uppercase">Errors</p><p className="text-lg font-bold text-destructive">{summary.errorRows}</p></div>
            </div>
            <div className="border rounded-md overflow-auto max-h-[400px]">
              <Table>
                <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Type</TableHead><TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Parent</TableHead><TableHead>Issues</TableHead></TableRow></TableHeader>
                <TableBody>
                  {summary.rows.map((row, i) => (
                    <TableRow key={i} className={cn(!row.valid && "bg-destructive/5")}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell><Badge variant="outline">{row.data.type}</Badge></TableCell>
                      <TableCell className="font-medium text-xs">{row.data.name}</TableCell>
                      <TableCell className="text-xs font-mono">{row.data.code}</TableCell>
                      <TableCell className="text-xs">{row.data.parentName || "—"}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {row.errors.map((err, j) => (
                            <p key={j} className="text-[10px] text-destructive flex items-start gap-1">
                              <XCircle className="h-3 w-3 mt-0.5 shrink-0" /> {err}
                            </p>
                          ))}
                          {row.warnings.map((warn, j) => (
                            <p key={j} className="text-[10px] text-amber-600 flex items-start gap-1">
                              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {warn}
                            </p>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "confirm" && summary && (
        <Card className="border-primary">
          <CardHeader><CardTitle>Final Confirmation</CardTitle><CardDescription>Create organizational hierarchy items.</CardDescription></CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <AlertCircle className="h-6 w-6 text-primary" />
              <div><p className="font-medium">You are about to create {summary.validRows} hierarchy items.</p></div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep("preview")}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("setup")}>Cancel</Button>
              <Button onClick={handleConfirm} disabled={isImporting}>{isImporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Confirm Import"}</Button>
            </div>
          </CardFooter>
        </Card>
      )}

      {step === "complete" && result && (
        <Card className="border-green-200 bg-green-50/20">
          <CardHeader className="text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-600 mb-2" />
            <CardTitle>Import Finished</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-lg border text-center"><p className="text-3xl font-bold text-green-600">{result.imported}</p><p className="text-xs text-muted-foreground uppercase">Imported</p></div>
              <div className="bg-white p-4 rounded-lg border text-center"><p className="text-3xl font-bold text-destructive">{result.failed}</p><p className="text-xs text-muted-foreground uppercase">Failed</p></div>
            </div>
          </CardContent>
          <CardFooter className="flex gap-2 justify-center">
            <Button variant="outline" onClick={handleDownloadReport}><Download className="h-4 w-4 mr-2" /> Download Report</Button>
            <Button asChild><a href="/admin">Return to Admin</a></Button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}
