"use client"

import { useState, useEffect, useTransition } from "react"
import Link from "next/link"
import {
  getDecisionSupportOverviewAction,
  generateBoardPackPptxAction,
  generateManagementReportAction,
  createManagementActionAction,
  updateManagementActionStatusAction,
} from "@/app/actions/decision-support"
import {
  TrustedPerformanceDataset,
  ManagementActionItem,
} from "@/lib/decision-support/types"
import { StructuredFinding } from "@/lib/intelligence/types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formatUGX } from "@/lib/format"
import {
  Activity,
  AlertTriangle,
  FileText,
  Presentation,
  CheckCircle2,
  Download,
  ListTodo,
  ExternalLink,
  Printer,
  ShieldCheck,
  TrendingUp,
  Info,
} from "lucide-react"

export default function DecisionSupportPage() {
  const [dataset, setDataset] = useState<TrustedPerformanceDataset | null>(null)
  const [attentionItems, setAttentionItems] = useState<StructuredFinding[]>([])
  const [actions, setActions] = useState<ManagementActionItem[]>([])
  const [activeTab, setActiveTab] = useState("overview")

  const [isLoading, startTransition] = useTransition()
  const [isGeneratingPptx, setIsGeneratingPptx] = useState(false)
  const [reportOutput, setReportOutput] = useState<any>(null)

  // Action modal state
  const [showActionModal, setShowActionModal] = useState(false)
  const [actionTitle, setActionTitle] = useState("")
  const [actionDescription, setActionDescription] = useState("")
  const [actionDueDate, setActionDueDate] = useState(new Date().toISOString().split("T")[0])

  const loadData = () => {
    startTransition(async () => {
      try {
        const res = await getDecisionSupportOverviewAction()
        setDataset(res.dataset)
        setAttentionItems(res.attentionItems)
        setActions(res.actions as any)
      } catch (err) {
        console.error("Failed to load decision support overview:", err)
      }
    })
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleDownloadPptx = async () => {
    setIsGeneratingPptx(true)
    try {
      const res = await generateBoardPackPptxAction()
      if (res.base64Pptx) {
        const byteCharacters = atob(res.base64Pptx)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        const blob = new Blob([byteArray], {
          type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = res.filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error("Failed to generate Board Pack PPTX:", err)
    } finally {
      setIsGeneratingPptx(false)
    }
  }

  const handleGenerateReport = async (type: any) => {
    try {
      const rep = await generateManagementReportAction(type)
      setReportOutput(rep)
    } catch (err) {
      console.error("Failed to generate management report:", err)
    }
  }

  const handleCreateAction = async (e: React.FormEvent) => {
    e.preventDefault()
    await createManagementActionAction({
      title: actionTitle,
      description: actionDescription,
      dueDate: actionDueDate,
    })
    setShowActionModal(false)
    setActionTitle("")
    setActionDescription("")
    loadData()
  }

  const handleUpdateActionStatus = async (actionId: string, status: any) => {
    await updateManagementActionStatusAction({ actionId, status })
    loadData()
  }

  if (!dataset) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Activity className="h-8 w-8 text-primary animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight">Decision Support</h1>
            <Badge variant="secondary" className="bg-primary/10 text-primary font-bold">
              MANAGEMENT
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Automated operational & commercial data consolidation, performance benchmarking, and Board Pack presentation generator.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleDownloadPptx} disabled={isGeneratingPptx} className="bg-brand-blue hover:bg-brand-blue/90 text-white">
            <Presentation className="h-4 w-4 mr-2" />
            {isGeneratingPptx ? "Generating PPTX..." : "Download Board Presentation (.pptx)"}
          </Button>
        </div>
      </div>

      {/* MANAGEMENT TABS */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full md:w-auto">
          <TabsTrigger value="overview">Overview & Performance</TabsTrigger>
          <TabsTrigger value="reports">Management Reports</TabsTrigger>
          <TabsTrigger value="boardpack">Board Pack (.pptx)</TabsTrigger>
          <TabsTrigger value="actions">Action Register ({actions.filter((a) => a.status !== "CLOSED").length})</TabsTrigger>
        </TabsList>

        {/* TAB 1: OVERVIEW & PERFORMANCE */}
        <TabsContent value="overview" className="space-y-6">
          {/* EXECUTIVE KPIS */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="card-accent-blue">
              <CardHeader className="p-4 pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Water Produced</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                <div className="text-2xl font-black text-brand-blue">{dataset.kpis.waterProducedM3.toLocaleString()} m³</div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Capacity Utilisation: <strong className="text-foreground">{dataset.kpis.capacityUtilizationPercent}%</strong>
                </p>
              </CardContent>
            </Card>

            <Card className="card-accent-green">
              <CardHeader className="p-4 pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Water Sold (Billed)</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                <div className="text-2xl font-black text-emerald-600">{dataset.kpis.waterSoldM3.toLocaleString()} m³</div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Loss Indicator: <strong className="text-foreground">{dataset.kpis.displayLossIndicator}</strong>
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Current Billed Demand</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                <div className="text-2xl font-bold">{formatUGX(dataset.kpis.currentBilledUgx)}</div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Collections: <strong className="text-emerald-600">{formatUGX(dataset.kpis.totalCashCollectedUgx)}</strong> ({dataset.kpis.collectionEfficiencyPercent}%)
                </p>
              </CardContent>
            </Card>

            <Card className="card-accent-red">
              <CardHeader className="p-4 pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Total Live Arrears</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                <div className="text-2xl font-black text-destructive">{formatUGX(dataset.kpis.totalArrearsUgx)}</div>
                <p className="text-[10px] text-muted-foreground mt-1">Live customer EBS database debt</p>
              </CardContent>
            </Card>
          </div>

          {/* DYNAMIC SCHEME PERFORMANCE MATRIX */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-bold">Dynamic Scheme Performance Matrix</CardTitle>
              <CardDescription>
                Consolidated operational and commercial indicators across all active schemes in scope ({dataset.schemesMatrix.length} schemes).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted text-muted-foreground uppercase font-semibold">
                    <tr>
                      <th className="p-3">Scheme</th>
                      <th className="p-3 text-right">Produced (m³)</th>
                      <th className="p-3 text-right">Utilisation %</th>
                      <th className="p-3 text-right">Sold (m³)</th>
                      <th className="p-3 text-right">Loss Indicator</th>
                      <th className="p-3 text-right">Billed (UGX)</th>
                      <th className="p-3 text-right">Collections (UGX)</th>
                      <th className="p-3 text-right">Coll %</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {dataset.schemesMatrix.map((s) => (
                      <tr key={s.schemeId} className="hover:bg-muted/30">
                        <td className="p-3 font-bold text-foreground">
                          <Link href={`/decision-support/schemes/${s.schemeId}`} className="hover:underline flex items-center gap-1">
                            {s.schemeName} <ExternalLink className="h-3 w-3 text-muted-foreground" />
                          </Link>
                        </td>
                        <td className="p-3 text-right font-mono">{s.producedM3.toLocaleString()}</td>
                        <td className="p-3 text-right font-mono font-bold">{s.utilizationPercent}%</td>
                        <td className="p-3 text-right font-mono">{s.soldM3.toLocaleString()}</td>
                        <td className="p-3 text-right font-mono font-bold text-amber-600">{s.displayLoss}</td>
                        <td className="p-3 text-right font-mono">{formatUGX(s.currentBilledUgx)}</td>
                        <td className="p-3 text-right font-mono text-emerald-600 font-bold">{formatUGX(s.cashCollectedUgx)}</td>
                        <td className="p-3 text-right font-mono">{s.collectionEfficiencyPercent}%</td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-[10px]">
                            {s.statusLabel}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* TRACEABILITY & METHODOLOGY FOOTNOTES */}
          <Card className="bg-muted/20">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-brand-blue" />
                <CardTitle className="text-sm font-bold">Metric Traceability Pipeline</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              {dataset.traceability.map((tr, idx) => (
                <div key={idx} className="p-2 rounded border bg-background text-[11px]">
                  <span className="font-bold text-foreground">{tr.metricName}</span>: <code className="text-slate-600 dark:text-slate-400">{tr.formulaDescription}</code> = <strong className="text-foreground">{tr.displayedResult}</strong> [{tr.sourceRecordsSummary}]
                </div>
              ))}
            </CardContent>
          </Card>

          {/* MANAGEMENT ATTENTION ITEMS */}
          {attentionItems.length > 0 && (
            <Card className="border-amber-200">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <CardTitle className="text-lg font-bold">Management Attention Items</CardTitle>
                </div>
                <CardDescription>
                  Validated operational & commercial exceptions requiring management review.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {attentionItems.map((att) => (
                  <div key={att.id} className="p-3 rounded-lg border bg-amber-50/20 border-amber-200 space-y-1 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-sm text-foreground">{att.title}</span>
                      <Badge className="bg-amber-600 text-white">{att.severity.toUpperCase()}</Badge>
                    </div>
                    <p className="text-muted-foreground">{att.description}</p>
                    <p className="text-foreground font-medium"><span className="text-muted-foreground font-normal">Recommended Action:</span> {att.recommendation}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TAB 2: MANAGEMENT REPORTS */}
        <TabsContent value="reports" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-bold">Executive Management Reports</CardTitle>
              <CardDescription>Generate narrative and tabular management reports derived from the trusted performance engine.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => handleGenerateReport("monthly_management")}>
                  Monthly Management Performance Report
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleGenerateReport("production_capacity")}>
                  Production & Capacity Report
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleGenerateReport("nrw_loss")}>
                  NRW / Water Loss Report
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleGenerateReport("commercial_performance")}>
                  Commercial Performance Report
                </Button>
              </div>

              {reportOutput && (
                <div className="p-6 border rounded-lg bg-background space-y-6 text-sm">
                  <div className="flex justify-between items-start border-b pb-4">
                    <div>
                      <h2 className="text-2xl font-bold">{reportOutput.title}</h2>
                      <p className="text-xs text-muted-foreground">{reportOutput.subtitle}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => window.print()}>
                      <Printer className="h-4 w-4 mr-1" /> Print Report
                    </Button>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wider mb-2">Executive Summary Narrative</h3>
                    <p className="text-foreground leading-relaxed bg-muted/20 p-4 rounded-lg border">{reportOutput.summaryNarrative}</p>
                  </div>

                  {reportOutput.sections.map((sec: any, idx: number) => (
                    <div key={idx} className="space-y-3">
                      <h3 className="text-sm font-bold border-b pb-1">{sec.heading}</h3>
                      <p className="text-xs text-muted-foreground">{sec.content}</p>
                      {sec.metricsTable && (
                        <div className="border rounded overflow-x-auto">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-muted uppercase font-semibold">
                              <tr>
                                {sec.metricsTable.headers.map((h: string, i: number) => (
                                  <th key={i} className="p-2">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {sec.metricsTable.rows.map((r: any[], i: number) => (
                                <tr key={i}>
                                  {r.map((c, j) => (
                                    <td key={j} className="p-2 font-mono">{String(c)}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: BOARD PACK (.PPTX) */}
        <TabsContent value="boardpack" className="space-y-6">
          <Card className="border-brand-blue/30 bg-brand-blue/5">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Presentation className="h-6 w-6 text-brand-blue" />
                <CardTitle className="text-xl font-bold">Board Presentation Generator (.pptx)</CardTitle>
              </div>
              <CardDescription>
                Generate a 14-slide downloadable PowerPoint deck (`.pptx`) for Board and Senior Management meetings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-background p-4 rounded-lg border space-y-2 text-xs">
                <h4 className="font-bold text-sm">Included Slide Deck Structure:</h4>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-1 text-muted-foreground list-disc list-inside">
                  <li>1. SWUWS Board Cover Slide</li>
                  <li>2. Executive Summary</li>
                  <li>3. Overall Performance Dashboard</li>
                  <li>4. Production Performance vs Target</li>
                  <li>5. Capacity Utilisation & System Health</li>
                  <li>6. Water Supply, Sales & Loss Indicator</li>
                  <li>7. Commercial Performance (Billing & Cash)</li>
                  <li>8. Customer Arrears Position</li>
                  <li>9. Dynamic Scheme Performance Matrix</li>
                  <li>10. What Changed? Period Deltas</li>
                  <li>11. Management Attention Items</li>
                  <li>12. Open Action Register Summary</li>
                  <li>13. Data Quality Limitations</li>
                  <li>14. Governance Conclusion</li>
                </ul>
              </div>

              <Button onClick={handleDownloadPptx} disabled={isGeneratingPptx} size="lg" className="w-full sm:w-auto bg-brand-blue hover:bg-brand-blue/90 text-white font-bold">
                <Download className="h-5 w-5 mr-2" />
                {isGeneratingPptx ? "Generating PowerPoint Deck..." : "Download Board Presentation (.pptx)"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: ACTION REGISTER */}
        <TabsContent value="actions" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold tracking-tight">Management Action Register</h2>
            <Button size="sm" onClick={() => setShowActionModal(true)}>
              <ListTodo className="h-4 w-4 mr-1" /> New Action Item
            </Button>
          </div>

          <Card>
            <CardContent className="pt-4">
              {actions.length > 0 ? (
                <div className="space-y-3">
                  {actions.map((act) => (
                    <div key={act.id} className="p-3 rounded-lg border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{act.title}</span>
                          <Badge variant="outline" className="uppercase text-[10px]">{act.status}</Badge>
                        </div>
                        <p className="text-muted-foreground">{act.description}</p>
                        <p className="text-[10px] text-muted-foreground">Due Date: {new Date(act.dueDate).toLocaleDateString()}</p>
                      </div>

                      <div className="flex gap-2 self-end sm:self-center">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleUpdateActionStatus(act.id, "IN_PROGRESS")}>
                          In Progress
                        </Button>
                        <Button size="sm" variant="default" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleUpdateActionStatus(act.id, "CLOSED")}>
                          Close Item
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-6">No management action items recorded yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* NEW ACTION MODAL */}
      <Dialog open={showActionModal} onOpenChange={setShowActionModal}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>New Management Action Item</DialogTitle>
          <DialogDescription className="text-xs">Assign a follow-up action from decision support findings.</DialogDescription>
          <form onSubmit={handleCreateAction} className="space-y-4 text-xs pt-2">
            <div className="space-y-1">
              <Label>Action Title</Label>
              <Input placeholder="e.g. Conduct zonal leak audit at Katuna" value={actionTitle} onChange={(e) => setActionTitle(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea placeholder="Required verification and field checks..." value={actionDescription} onChange={(e) => setActionDescription(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Due Date</Label>
              <Input type="date" value={actionDueDate} onChange={(e) => setActionDueDate(e.target.value)} required />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowActionModal(false)}>Cancel</Button>
              <Button type="submit" size="sm">Create Action Item</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
