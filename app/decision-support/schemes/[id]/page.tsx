"use client"

import { useState, useEffect, useTransition, use } from "react"
import Link from "next/link"
import { getSchemeIntelligence, upsertWaterSchemeSource, logWaterProduction } from "@/app/actions/intelligence"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Droplets,
  Plus,
  ExternalLink,
} from "lucide-react"

export default function SchemeDecisionSupportPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const schemeId = resolvedParams.id

  const [data, setData] = useState<any>(null)
  const [isLoading, startTransition] = useTransition()
  const [showSourceModal, setShowSourceModal] = useState(false)
  const [showLogModal, setShowLogModal] = useState(false)

  // Source form state
  const [sourceName, setSourceName] = useState("")
  const [technology, setTechnology] = useState("gravity")
  const [installedCapacity, setInstalledCapacity] = useState("15")

  // Log form state
  const [logDate, setLogDate] = useState(new Date().toISOString().split("T")[0])
  const [waterProduced, setWaterProduced] = useState("")

  const loadData = () => {
    startTransition(async () => {
      try {
        const res = await getSchemeIntelligence(schemeId)
        setData(res)
      } catch (err) {
        console.error("Failed to load scheme decision support:", err)
      }
    })
  }

  useEffect(() => {
    loadData()
  }, [schemeId])

  const handleSaveSource = async (e: React.FormEvent) => {
    e.preventDefault()
    await upsertWaterSchemeSource({
      schemeId,
      sourceName,
      technology,
      installedPumpCapacityM3Hr: Number(installedCapacity) || 0,
    })
    setShowSourceModal(false)
    loadData()
  }

  const handleSaveLog = async (e: React.FormEvent) => {
    e.preventDefault()
    await logWaterProduction({
      schemeId,
      logDate,
      waterProducedM3: Number(waterProduced) || 0,
    })
    setShowLogModal(false)
    loadData()
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Activity className="h-8 w-8 text-primary animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 text-xs">
            <Link href="/decision-support">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Decision Support Dashboard
            </Link>
          </Button>
          <h1 className="text-3xl font-extrabold tracking-tight">{data.scheme.name}</h1>
          <p className="text-sm text-muted-foreground">Scheme Code: {data.scheme.code} · Service Area: {data.scheme.serviceArea || "Standard"}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSourceModal(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Water Source
          </Button>
          <Button size="sm" onClick={() => setShowLogModal(true)}>
            <Droplets className="h-4 w-4 mr-1" /> Log Daily Production
          </Button>
        </div>
      </div>

      {/* SOURCES BREAKDOWN */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold">Configured Scheme Water Sources</CardTitle>
          <CardDescription>Gravity springs, boreholes, and solar/grid pumping stations for this scheme.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.sources && data.sources.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-3">
              {data.sources.map((src: any) => (
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
            <p className="text-xs text-muted-foreground text-center py-6">
              No water sources registered for this scheme yet. Click "Add Water Source" to configure yield capacity.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ACTIVE FINDINGS FOR THIS SCHEME */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold">Scheme Decision Support Findings</CardTitle>
          <CardDescription>Evidence-based operational and commercial anomalies flagged for this scheme.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.findings && data.findings.length > 0 ? (
            <div className="space-y-3">
              {data.findings.map((f: any) => (
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
            <div className="text-center py-6 space-y-1">
              <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
              <p className="text-xs font-bold text-foreground">No active decision support findings for this scheme.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* RECENT PRODUCTION LOGS TABLE */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold">Water Production Log History</CardTitle>
        </CardHeader>
        <CardContent>
          {data.productionLogs && data.productionLogs.length > 0 ? (
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted text-muted-foreground uppercase font-semibold">
                  <tr>
                    <th className="p-3">Log Date</th>
                    <th className="p-3">Water Produced (m³)</th>
                    <th className="p-3">Water Supplied (m³)</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.productionLogs.map((log: any) => (
                    <tr key={log.id}>
                      <td className="p-3">{new Date(log.logDate).toLocaleDateString()}</td>
                      <td className="p-3 font-bold">{log.waterProducedM3} m³</td>
                      <td className="p-3">{log.waterSuppliedM3} m³</td>
                      <td className="p-3"><Badge variant="outline">{log.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-6">
              No production logs recorded yet. Use "Log Daily Production" to start recording bulk water yield.
            </p>
          )}
        </CardContent>
      </Card>

      {/* MODAL: ADD WATER SOURCE */}
      <Dialog open={showSourceModal} onOpenChange={setShowSourceModal}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Add Scheme Water Source</DialogTitle>
          <DialogDescription className="text-xs">Configure source technology and yield capacity parameters.</DialogDescription>
          <form onSubmit={handleSaveSource} className="space-y-4 text-xs pt-2">
            <div className="space-y-1">
              <Label>Source Name</Label>
              <Input placeholder="e.g. Kakamba Spring Source" value={sourceName} onChange={(e) => setSourceName(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Source Technology</Label>
              <Select value={technology} onValueChange={(val) => setTechnology(val || "gravity")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gravity">Gravity Spring</SelectItem>
                  <SelectItem value="pumped_grid">Pumped - Grid</SelectItem>
                  <SelectItem value="pumped_solar">Pumped - Solar</SelectItem>
                  <SelectItem value="pumped_generator">Pumped - Generator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Installed Pump / Yield Capacity (m³/hr)</Label>
              <Input type="number" step="0.1" value={installedCapacity} onChange={(e) => setInstalledCapacity(e.target.value)} required />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowSourceModal(false)}>Cancel</Button>
              <Button type="submit" size="sm">Save Source</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: LOG PRODUCTION */}
      <Dialog open={showLogModal} onOpenChange={setShowLogModal}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Log Daily Water Production</DialogTitle>
          <DialogDescription className="text-xs">Record bulk meter production for this scheme.</DialogDescription>
          <form onSubmit={handleSaveLog} className="space-y-4 text-xs pt-2">
            <div className="space-y-1">
              <Label>Log Date</Label>
              <Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Water Produced (m³)</Label>
              <Input type="number" step="1" placeholder="e.g. 250" value={waterProduced} onChange={(e) => setWaterProduced(e.target.value)} required />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowLogModal(false)}>Cancel</Button>
              <Button type="submit" size="sm">Save Log</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
