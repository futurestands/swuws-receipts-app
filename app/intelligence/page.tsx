"use client"

import { useState, useEffect, useTransition } from "react"
import Link from "next/link"
import {
  getIntelligenceDashboard,
} from "@/app/actions/intelligence"
import {
  StructuredFinding,
  IntelligenceFilters,
  IntelligenceSummaryKPIs,
  PeriodChangeItem,
  PriorityInvestigationItem,
} from "@/lib/intelligence/types"
import { InvestigationDrawer } from "./investigation-drawer"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { formatUGX } from "@/lib/format"
import {
  AlertCircle,
  AlertTriangle,
  Activity,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Search,
  SlidersHorizontal,
  Lightbulb,
  Gauge,
  ArrowRight,
  ExternalLink,
} from "lucide-react"

export default function IntelligencePage() {
  const [data, setData] = useState<{
    findings: StructuredFinding[]
    kpis: IntelligenceSummaryKPIs
    periodChanges: PeriodChangeItem[]
    priorityInvestigations: PriorityInvestigationItem[]
  } | null>(null)

  const [filters, setFilters] = useState<IntelligenceFilters>({
    category: "all",
    severity: "all",
    status: "all",
  })

  const [isLoading, startTransition] = useTransition()
  const [selectedFinding, setSelectedFinding] = useState<StructuredFinding | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const loadData = () => {
    startTransition(async () => {
      try {
        const res = await getIntelligenceDashboard(filters)
        setData(res)
      } catch (err) {
        console.error("Failed to load intelligence dashboard:", err)
      }
    })
  }

  useEffect(() => {
    loadData()
  }, [filters.category, filters.severity, filters.status])

  const openInvestigation = (finding: StructuredFinding) => {
    setSelectedFinding(finding)
    setDrawerOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* EXECUTIVE INTELLIGENCE HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight">Decision Support</h1>
            <Badge variant="secondary" className="bg-primary/10 text-primary font-bold">
              BETA
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Turning operational data into actionable insight for water schemes, production, NRW, and commercial performance.
          </p>
        </div>

        <Button onClick={loadData} variant="outline" size="sm" disabled={isLoading}>
          <Activity className="h-4 w-4 mr-2 animate-pulse" />
          Refresh Intelligence
        </Button>
      </div>

      {/* FILTER BAR */}
      <Card className="bg-muted/30">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase mr-2">
            <SlidersHorizontal className="h-4 w-4" /> Filters:
          </div>

          <Select
            value={filters.category || "all"}
            onValueChange={(val) => setFilters((prev) => ({ ...prev, category: val }))}
          >
            <SelectTrigger className="w-[160px] h-9 text-xs">
              <SelectValue placeholder="Domain Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Domains</SelectItem>
              <SelectItem value="data_quality">Data Quality</SelectItem>
              <SelectItem value="production">Production</SelectItem>
              <SelectItem value="capacity">Capacity</SelectItem>
              <SelectItem value="nrw">NRW / Loss</SelectItem>
              <SelectItem value="commercial">Commercial</SelectItem>
              <SelectItem value="target">Targets</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.severity || "all"}
            onValueChange={(val) => setFilters((prev) => ({ ...prev, severity: val }))}
          >
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High Priority</SelectItem>
              <SelectItem value="watch">Watch</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.status || "all"}
            onValueChange={(val) => setFilters((prev) => ({ ...prev, status: val }))}
          >
            <SelectTrigger className="w-[150px] h-9 text-xs">
              <SelectValue placeholder="Finding Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="UNDER_INVESTIGATION">Under Investigation</SelectItem>
              <SelectItem value="RESOLVED">Resolved</SelectItem>
              <SelectItem value="DISMISSED">Dismissed</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* TOP KPI CARDS */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card className="border-red-200 bg-red-50/20 dark:bg-red-950/20">
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-xs font-medium text-red-700 uppercase">Critical</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-2xl font-black text-red-600">{data?.kpis.criticalCount ?? 0}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Requires immediate review</p>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50/20 dark:bg-amber-950/20">
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-xs font-medium text-amber-700 uppercase">High Priority</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-2xl font-black text-amber-600">{data?.kpis.highPriorityCount ?? 0}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Operational deviations</p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/20 dark:bg-blue-950/20">
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-xs font-medium text-blue-700 uppercase">Watch</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-2xl font-black text-blue-600">{data?.kpis.watchCount ?? 0}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Monitor trends</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Data Quality</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-2xl font-black">{data?.kpis.dataQualityCount ?? 0}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Incomplete or missing logs</p>
          </CardContent>
        </Card>

        <Card className="border-purple-200 bg-purple-50/20 dark:bg-purple-950/20">
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-xs font-medium text-purple-700 uppercase">Schemes Needing Attention</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-2xl font-black text-purple-600">{data?.kpis.schemesNeedingAttentionCount ?? 0}</div>
            <p className="text-[10px] text-muted-foreground mt-1">With 1+ major findings</p>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 bg-emerald-50/20 dark:bg-emerald-950/20">
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-xs font-medium text-emerald-700 uppercase">Potential Impact</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-lg font-black text-emerald-600">
              {data?.kpis.potentialFinancialImpactUgx
                ? formatUGX(data.kpis.potentialFinancialImpactUgx)
                : "Calculated"}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Uncollected demand risk</p>
          </CardContent>
        </Card>
      </div>

      {/* SECTION: WHAT SHOULD I INVESTIGATE? (RANKED PRIORITY) */}
      {data?.priorityInvestigations && data.priorityInvestigations.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/10">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-lg font-bold">What Should I Investigate First?</CardTitle>
            </div>
            <CardDescription>
              Ranked management priority checklist based on operational impact, severity, and evidence confidence.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            {data.priorityInvestigations.slice(0, 4).map((prio, idx) => (
              <div
                key={prio.id}
                className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 rounded-lg border bg-background gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700">#{idx + 1}</span>
                    <span className="font-extrabold text-sm">{prio.schemeName}</span>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {prio.category}
                    </Badge>
                  </div>
                  <p className="text-xs font-medium text-foreground">{prio.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-semibold">Check:</span> {prio.whatShouldBeChecked}
                  </p>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8"
                    onClick={() => {
                      const found = data.findings.find((f) => f.id === prio.findingId)
                      if (found) openInvestigation(found)
                    }}
                  >
                    Investigate
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* SECTION: ATTENTION REQUIRED FINDINGS FEED */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold tracking-tight">Attention Required</h2>
          <span className="text-xs text-muted-foreground">Showing {data?.findings.length ?? 0} active finding(s)</span>
        </div>

        {data?.findings && data.findings.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {data.findings.map((f) => (
              <Card key={f.id} className="flex flex-col justify-between border-l-4 border-l-amber-500">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-extrabold text-sm uppercase tracking-wider text-foreground">
                          {f.schemeName}
                        </span>
                        <Badge variant="secondary" className="text-[10px] uppercase">
                          {f.category}
                        </Badge>
                      </div>
                      <CardTitle className="text-base font-bold">{f.title}</CardTitle>
                    </div>

                    <Badge
                      className={
                        f.severity === "critical"
                          ? "bg-red-600 text-white"
                          : f.severity === "high"
                          ? "bg-amber-600 text-white"
                          : "bg-blue-600 text-white"
                      }
                    >
                      {f.severity.toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 text-xs pt-1">
                  <div>
                    <span className="font-semibold text-muted-foreground uppercase text-[10px] block mb-0.5">
                      Evidence
                    </span>
                    <p className="bg-muted/40 p-2 rounded border font-mono">
                      {f.evidence.metric}: {String(f.evidence.actual)} {f.evidence.unit || ""}{" "}
                      {f.evidence.baseline ? `(Baseline: ${f.evidence.baseline})` : ""}
                    </p>
                  </div>

                  {f.observation && (
                    <div>
                      <span className="font-semibold text-muted-foreground uppercase text-[10px] block mb-0.5">
                        Observation
                      </span>
                      <p className="text-muted-foreground">{f.observation}</p>
                    </div>
                  )}

                  {f.recommendation && (
                    <div>
                      <span className="font-semibold text-muted-foreground uppercase text-[10px] block mb-0.5">
                        Recommended Investigation
                      </span>
                      <p className="text-foreground font-medium">{f.recommendation}</p>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-2 border-t text-[10px] text-muted-foreground">
                    <span>Confidence: <strong className="text-foreground">{f.confidence}</strong></span>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" asChild>
                        <Link href={`/intelligence/schemes/${f.schemeId}`}>
                          View Scheme <ExternalLink className="h-3 w-3 ml-1" />
                        </Link>
                      </Button>
                      <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => openInvestigation(f)}>
                        Investigate
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="text-center py-12">
            <CardContent className="space-y-2">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
              <h3 className="text-base font-bold">No High Priority Attention Items</h3>
              <p className="text-xs text-muted-foreground">
                All water scheme indicators and data records match normal operating parameters for the selected filters.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* SECTION: WHAT CHANGED? (PERIOD COMPARISONS) */}
      {data?.periodChanges && data.periodChanges.length > 0 && (
        <Card className="pt-2">
          <CardHeader>
            <CardTitle className="text-lg font-bold">What Changed?</CardTitle>
            <CardDescription>
              Period-over-period comparative deltas calculated from actual production and billing data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.periodChanges.map((item) => (
              <div key={item.id} className="flex justify-between items-center p-3 rounded-lg border bg-muted/20 text-xs">
                <div className="flex items-center gap-2">
                  {item.direction === "increased" ? (
                    <TrendingUp className={`h-4 w-4 ${item.significance === "positive" ? "text-emerald-500" : "text-amber-500"}`} />
                  ) : (
                    <TrendingDown className={`h-4 w-4 ${item.significance === "positive" ? "text-emerald-500" : "text-amber-500"}`} />
                  )}
                  <span>{item.summary}</span>
                </div>
                <Badge variant={item.significance === "positive" ? "outline" : "secondary"}>
                  {item.direction === "increased" ? "+" : ""}{item.deltaPercent}%
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* INVESTIGATION DRAWER */}
      <InvestigationDrawer
        finding={selectedFinding}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onUpdated={loadData}
      />
    </div>
  )
}
