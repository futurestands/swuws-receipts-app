"use client"

import { useState } from "react"
import { StructuredFinding, FindingStatus } from "@/lib/intelligence/types"
import { updateFindingStatus } from "@/app/actions/intelligence"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { AlertCircle, CheckCircle2, ShieldAlert, FileText, UserCheck, Clock } from "lucide-react"
import { formatUGX } from "@/lib/format"

interface InvestigationDrawerProps {
  finding: StructuredFinding | null
  open: boolean
  onClose: () => void
  onUpdated?: () => void
}

export function InvestigationDrawer({
  finding,
  open,
  onClose,
  onUpdated,
}: InvestigationDrawerProps) {
  const [status, setStatus] = useState<FindingStatus>(finding?.status || "OPEN")
  const [resolutionNotes, setResolutionNotes] = useState(finding?.resolutionNotes || "")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (!finding) return null

  const handleUpdate = async (newStatus: FindingStatus) => {
    setIsSubmitting(true)
    setMessage(null)
    try {
      await updateFindingStatus({
        findingId: finding.id,
        status: newStatus,
        resolutionNotes,
      })
      setStatus(newStatus)
      setMessage(`Investigation updated to ${newStatus}`)
      if (onUpdated) onUpdated()
    } catch (err: any) {
      setMessage(`Error: ${err.message || "Failed to update"}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const severityBadgeColor =
    finding.severity === "critical"
      ? "bg-red-500 text-white"
      : finding.severity === "high"
      ? "bg-amber-500 text-white"
      : finding.severity === "watch"
      ? "bg-blue-500 text-white"
      : "bg-slate-500 text-white"

  const confidenceBadgeColor =
    finding.confidence === "HIGH"
      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
      : finding.confidence === "MEDIUM"
      ? "bg-amber-100 text-amber-800 border-amber-300"
      : "bg-slate-100 text-slate-800 border-slate-300"

  return (
    <Sheet open={open} onOpenChange={(val) => !val && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-4 border-b">
          <div className="flex items-center gap-2">
            <Badge className={severityBadgeColor}>{finding.severity.toUpperCase()}</Badge>
            <Badge variant="outline" className={confidenceBadgeColor}>
              {finding.confidence} CONFIDENCE
            </Badge>
          </div>
          <SheetTitle className="text-xl font-bold mt-2">{finding.title}</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Scheme: <span className="font-semibold text-foreground">{finding.schemeName || "General"}</span> · Period: {finding.reportingPeriod || "Current"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6 text-sm">
          {/* WHAT HAPPENED */}
          <div>
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">What Happened</h4>
            <p className="text-foreground bg-muted/30 p-3 rounded-lg border">{finding.description}</p>
          </div>

          {/* STRUCTURED EVIDENCE */}
          <div>
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Evidence & Data Record</h4>
            <div className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-xs space-y-1">
              <div><span className="text-slate-400">Metric:</span> {finding.evidence.metric}</div>
              <div><span className="text-slate-400">Actual Value:</span> {finding.evidence.actual} {finding.evidence.unit || ""}</div>
              {finding.evidence.baseline !== undefined && (
                <div><span className="text-slate-400">Baseline Benchmark:</span> {finding.evidence.baseline} {finding.evidence.unit || ""}</div>
              )}
              {finding.evidence.expected !== undefined && (
                <div><span className="text-slate-400">Target Expected:</span> {finding.evidence.expected} {finding.evidence.unit || ""}</div>
              )}
              {finding.evidence.variance !== undefined && (
                <div><span className="text-slate-400">Variance:</span> {finding.evidence.variance} {finding.evidence.unit || ""}</div>
              )}
              {finding.evidence.dataCompletenessPercent !== undefined && (
                <div><span className="text-slate-400">Data Completeness:</span> {finding.evidence.dataCompletenessPercent}%</div>
              )}
            </div>
          </div>

          {/* OBSERVATION / WHY IT MATTERS */}
          {finding.observation && (
            <div>
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Why It Matters</h4>
              <p className="text-muted-foreground bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 p-3 rounded-lg text-amber-900 dark:text-amber-200">
                {finding.observation}
              </p>
            </div>
          )}

          {/* RECOMMENDED CHECKS */}
          {finding.recommendation && (
            <div>
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Recommended Investigation</h4>
              <p className="text-foreground bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/50 p-3 rounded-lg text-emerald-900 dark:text-emerald-200">
                {finding.recommendation}
              </p>
            </div>
          )}

          {/* RESOLUTION & NOTES FORM */}
          <div className="pt-4 border-t space-y-3">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Investigation Workflow</h4>
            <div className="space-y-2">
              <Label htmlFor="resolutionNotes">Officer Investigation Notes</Label>
              <Textarea
                id="resolutionNotes"
                placeholder="Enter field checks, findings, bulk meter serial verification, or resolution steps..."
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                rows={3}
              />
            </div>

            {message && (
              <p className={`text-xs font-medium ${message.startsWith("Error") ? "text-destructive" : "text-emerald-600"}`}>
                {message}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                variant={status === "UNDER_INVESTIGATION" ? "default" : "outline"}
                size="sm"
                disabled={isSubmitting}
                onClick={() => handleUpdate("UNDER_INVESTIGATION")}
              >
                Mark Under Investigation
              </Button>
              <Button
                variant={status === "RESOLVED" ? "default" : "outline"}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={isSubmitting}
                onClick={() => handleUpdate("RESOLVED")}
              >
                Mark Resolved
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={isSubmitting}
                onClick={() => handleUpdate("DISMISSED")}
              >
                Dismiss Finding
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
