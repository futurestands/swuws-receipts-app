"use client"

import { useState, useEffect, useTransition, useCallback } from "react"
import { getSchemeIntelligence } from "@/app/actions/intelligence"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Activity, AlertTriangle, CheckCircle2, Droplets, Info } from "lucide-react"

export function SchemeDecisionSupportView({ schemeId }: { schemeId: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getSchemeIntelligence>> | null>(null)
  const [, startTransition] = useTransition()

  const loadData = useCallback(() => {
    startTransition(async () => {
      try {
        const res = await getSchemeIntelligence(schemeId)
        setData(res)
      } catch (err) {
        console.error("Failed to load scheme decision support view:", err)
      }
    })
  }, [schemeId])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Activity className="h-8 w-8 text-primary animate-pulse" />
      </div>
    )
  }

  const { scheme, sources, findings, productionLogs } = data

  return (
    <div className="space-y-6">
      {/* SCHEME ENGINEERING BENCHMARKS OVERVIEW */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Scheme Name & Area</CardDescription>
            <CardTitle className="text-lg font-bold">{scheme.name}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-1">
            <div>Code: <strong className="text-foreground">{scheme.code}</strong></div>
            <div>Cluster / Branch: <strong className="text-foreground">{scheme.serviceArea || "Standard"}</strong></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Configured Sources & Capacity</CardDescription>
            <CardTitle className="text-lg font-bold">{sources?.length ?? 0} Active Sources</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-1">
            <div>
              Total Monthly Reference:{" "}
              <strong className="text-primary font-bold">
                {sources && sources.length > 0
                  ? `${sources.reduce((a, b) => a + (Number(b.practicalCapacityM3Month) || 0), 0).toLocaleString()} m³/month`
                  : "Unavailable — Sources Unlogged"}
              </strong>
            </div>
            <div>
              Total Daily Assessment:{" "}
              <strong className="text-foreground">
                {sources && sources.length > 0
                  ? `${sources.reduce((a, b) => a + (Number(b.currentCapacityM3Day) || 0), 0).toLocaleString()} m³/day`
                  : "Unavailable"}
              </strong>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Production Logs & Verification</CardDescription>
            <CardTitle className="text-lg font-bold">{productionLogs?.length ?? 0} Recorded Logs</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-1">
            <div>
              Verified Logs:{" "}
              <strong className="text-emerald-600 font-bold">
                {productionLogs?.filter((l) => l.status === "verified").length ?? 0}
              </strong>
            </div>
            <div>
              Pending Verification:{" "}
              <strong className="text-amber-600 font-bold">
                {productionLogs?.filter((l) => l.status === "entered").length ?? 0}
              </strong>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CONFIGURATED SOURCES BREAKDOWN */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Droplets className="h-5 w-5 text-primary" /> Configured Scheme Water Sources
          </CardTitle>
          <CardDescription className="text-xs">
            Gravity springs, boreholes, and solar/grid pumping stations associated with this scheme.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sources && sources.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-3">
              {sources.map((src) => (
                <div key={src.id} className="p-4 rounded-lg border bg-muted/20 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm">{src.sourceName}</span>
                    <Badge variant="outline" className="uppercase text-[10px]">{src.technology}</Badge>
                  </div>
                  <div>Pump Capacity: <strong className="text-foreground">{src.installedPumpCapacityM3Hr} m³/hr</strong></div>
                  <div>Daily Capacity: <strong className="text-foreground">{src.currentCapacityM3Day} m³/day</strong></div>
                  <div>Practical Monthly Capacity: <strong className="text-primary font-bold">{src.practicalCapacityM3Month} m³/month</strong></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 space-y-2 border rounded-lg bg-muted/10">
              <Info className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-xs font-semibold text-foreground">No water sources registered for this scheme yet.</p>
              <p className="text-xs text-muted-foreground">Use the &quot;Water Production Workspace&quot; tab to configure sources and daily logs.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ACTIVE DECISION SUPPORT ANOMALY FINDINGS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" /> Active Decision Support Findings
          </CardTitle>
          <CardDescription className="text-xs">
            Evidence-based operational and commercial anomalies flagged for this scheme.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {findings && findings.length > 0 ? (
            <div className="space-y-3">
              {findings.map((f) => (
                <div key={f.id} className="p-3 rounded-lg border bg-amber-50/20 border-amber-200 text-xs space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm text-foreground">{f.title}</span>
                    <Badge className={f.severity === "critical" ? "bg-red-600" : "bg-amber-600"}>{f.severity.toUpperCase()}</Badge>
                  </div>
                  <p className="text-muted-foreground">{f.description}</p>
                  <p className="font-medium text-foreground">Recommendation: {f.recommendation}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 space-y-1 border rounded-lg bg-emerald-50/20 border-emerald-200">
              <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
              <p className="text-xs font-bold text-foreground">No active decision support findings for this scheme.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
