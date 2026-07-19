"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { resolveException } from "@/app/actions/reconciliation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { toast } from "sonner"
import { Loader2, CheckCircle2, ShieldAlert } from "lucide-react"

export function ExceptionInvestigationClient({
  exceptionId,
  initialStatus,
  initialNotes,
  initialResolution
}: {
  exceptionId: string
  initialStatus: string
  initialNotes?: string | null
  initialResolution?: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState(initialStatus)
  const [notes, setNotes] = useState(initialNotes || "")
  const [resolution, setResolution] = useState(initialResolution || "")

  function handleSave() {
    startTransition(async () => {
      try {
        const result = await resolveException(exceptionId, {
          status,
          notes,
          resolution
        })
        if (result.ok) {
          toast.success("Case updated successfully")
          router.refresh()
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to update case")
      }
    })
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-primary" /> Case Management
        </CardTitle>
        <CardDescription>Record your findings and resolve this mismatch.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Workflow Status</Label>
          <Select value={status} onValueChange={(v) => v && setStatus(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="under_review">Under Review</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="escalated">Escalated</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Investigation Notes</Label>
          <Textarea
            placeholder="Document your verification steps here..."
            className="min-h-[100px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Official Resolution</Label>
          <Select value={resolution} onValueChange={(v) => v && setResolution(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select outcome" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="verified_match">Verified Manual Match</SelectItem>
              <SelectItem value="duplicate_ignored">Ignore Duplicate</SelectItem>
              <SelectItem value="timing_difference">Timing Difference (OK)</SelectItem>
              <SelectItem value="error_confirmed">Data Entry Error Found</SelectItem>
              <SelectItem value="no_action">No Action Required</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button className="w-full mt-4" onClick={handleSave} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
          Update Case File
        </Button>
      </CardContent>
    </Card>
  )
}
