"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { submitForReview, approveBatch, reopenBatch } from "@/app/actions/approval"
import { Button } from "@/components/ui/button"
import {
  ShieldCheck,
  Send,
  RotateCcw,
  Loader2,
  CheckCircle2
} from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { FormField, FormActions } from "@/components/ui/form-layout"
import type { getBatchApprovalStatus } from "@/app/actions/approval"

interface Props {
  batchId: string
  currentStage: string
  approvalData: Awaited<ReturnType<typeof getBatchApprovalStatus>>
}

export function ApprovalActions({ batchId, currentStage, approvalData }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [actionType, setActionType] = useState<"submit" | "approve" | "reopen" | null>(null)
  const [comments, setComments] = useState("")

  const STAGE_LABELS: Record<string, string> = {
    draft: "Draft",
    pending_review: "Pending Review",
    reviewed: "Reviewed",
    approved: "Approved",
    rejected: "Rejected",
    reopened: "Reopened"
  }

  function handleAction() {
    startTransition(async () => {
      try {
        let result
        if (actionType === "submit") result = await submitForReview(batchId, comments)
        else if (actionType === "approve") result = await approveBatch(batchId, comments)
        else if (actionType === "reopen") result = await reopenBatch(batchId, comments)

        if (result?.ok) {
          toast.success(`Batch successfully ${actionType}ed`)
          setIsDialogOpen(false)
          setComments("")
          router.refresh()
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Action failed")
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
         <span className="text-[10px] uppercase font-bold text-muted-foreground">Approval Status</span>
         <Badge variant="outline" className={cn(
           "capitalize text-[10px] px-1.5 py-0",
           currentStage === 'approved' ? "bg-green-50 text-green-700 border-green-200" :
           currentStage === 'pending_review' ? "bg-blue-50 text-blue-700 border-blue-200" : ""
         )}>
            {STAGE_LABELS[currentStage] || currentStage}
         </Badge>
      </div>

      {currentStage === 'approved' && (
        <div className="p-3 bg-green-50 rounded-lg border border-green-100 space-y-2">
           <div className="flex items-center gap-2 text-xs font-bold text-green-700">
              <CheckCircle2 className="h-4 w-4" /> Final Sign-off Complete
           </div>
           <p className="text-[10px] text-green-600 italic">
             Approved by {approvalData?.approvedByName} on {new Date(approvalData?.approvedAt).toLocaleDateString()}
           </p>
           <Button
             variant="ghost"
             size="sm"
             className="w-full text-xs h-11 text-green-700 hover:bg-green-100"
             onClick={() => { setActionType("reopen"); setIsDialogOpen(true); }}
           >
             <RotateCcw className="h-3 w-3 mr-2" /> Reopen for Correction
           </Button>
        </div>
      )}

      {currentStage !== 'approved' && (
        <div className="flex gap-2">
          {currentStage === 'draft' || currentStage === 'reopened' ? (
            <Button className="flex-1 text-xs h-11" onClick={() => { setActionType("submit"); setIsDialogOpen(true); }}>
              <Send className="h-3 w-3 mr-2" /> Submit for Review
            </Button>
          ) : (
            <Button className="flex-1 text-xs h-11 bg-green-600 hover:bg-green-700" onClick={() => { setActionType("approve"); setIsDialogOpen(true); }}>
              <ShieldCheck className="h-3 w-3 mr-2" /> Approve Batch
            </Button>
          )}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="capitalize">{actionType} Reconciliation Batch</DialogTitle>
            <DialogDescription>
              {actionType === "approve"
                ? "This will lock the reconciliation results. They will become read-only for audit purposes."
                : "Add any comments or observations for the audit trail."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <FormField label="Audit Comments" htmlFor="auditComments">
              <Textarea
                id="auditComments"
                placeholder="Enter notes..."
                value={comments}
                onChange={(e) => setComments(e.target.value)}
              />
            </FormField>
          </div>
          <FormActions>
            <Button variant="outline" className="h-11" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button className="h-11" onClick={handleAction} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm {actionType}
            </Button>
          </FormActions>
        </DialogContent>
      </Dialog>
    </div>
  )
}
