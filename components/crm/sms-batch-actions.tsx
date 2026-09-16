"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Send, Loader2, Info, RefreshCw, CheckCircle2, ClipboardCheck } from "lucide-react"
import { processSmsBatch, submitSmsBatch, approveSmsBatch, rejectSmsBatch } from "@/app/actions/crm"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { SmsBatchDetailsSheet } from "./sms-batch-details-sheet"

export function SmsBatchActions({
  batchId,
  batchName,
  status,
  canSubmit = false,
  canApprove = false,
  rejectionReason,
}: {
  batchId: string
  batchName: string
  status: string
  canSubmit?: boolean
  canApprove?: boolean
  rejectionReason?: string | null
}) {
  const [isPending, startTransition] = useTransition()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const router = useRouter()

  function run(action: () => Promise<{ ok?: boolean; sent?: number; failed?: number; remaining?: number }>, busyLabel: string) {
    startTransition(async () => {
      try {
        const res = await action()
        if (res && "remaining" in res && res.remaining && res.remaining > 0) {
          toast.success(`Sent ${res.sent}, ${res.remaining} still queued — press Resume to continue.`)
        } else if (res && "failed" in res && res.failed && res.failed > 0) {
          toast.warning(`Finished with ${res.sent} sent and ${res.failed} failed. Open Details to see why.`)
        } else {
          toast.success(busyLabel)
        }
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not update this list")
      }
    })
  }

  function handleSubmit() {
    if (!confirm("Submit this list for approval? It will not send until an approver releases it.")) return
    run(() => submitSmsBatch(batchId), "Submitted for approval.")
  }

  function handleApprove() {
    if (!confirm(`Approve and send “${batchName}”? Messages will start going out now.`)) return
    run(() => approveSmsBatch(batchId), "Approved. Sending has started.")
  }

  function handleReject() {
    const reason = window.prompt("Why is this list being sent back?")
    if (reason == null) return
    if (!reason.trim()) {
      toast.error("Give a short reason so the submitter can fix the list")
      return
    }
    run(() => rejectSmsBatch(batchId, reason.trim()), "List sent back to the submitter.")
  }

  function handleResume() {
    if (!confirm("Resume sending the remaining messages on this approved list?")) return
    run(() => processSmsBatch(batchId), "Sending resumed.")
  }

  const showSubmit = canSubmit && (status === "draft" || status === "rejected")
  const showApprove = canApprove && (status === "pending_approval" || status === "draft")
  const showReject = canApprove && status === "pending_approval"
  const showResume = canApprove && (status === "processing" || status === "failed" || status === "approved")

  return (
    <>
      <div className="flex justify-end gap-2 flex-wrap">
        {showSubmit && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[10px] font-black gap-1.5"
            onClick={handleSubmit}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ClipboardCheck className="h-3 w-3" />}
            Submit for approval
          </Button>
        )}
        {showReject && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[10px] font-black text-rose-700 border-rose-200 gap-1.5"
            onClick={handleReject}
            disabled={isPending}
          >
            Send back
          </Button>
        )}
        {showApprove && (
          <Button
            size="sm"
            className="h-7 text-[10px] font-black bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            onClick={handleApprove}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Approve & send
          </Button>
        )}
        {showResume && (
          <Button
            size="sm"
            className="h-7 text-[10px] font-black bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            onClick={handleResume}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : status === "approved" ? <Send className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
            {status === "approved" ? "SEND" : "RESUME"}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[10px] font-bold bg-sky-50 text-sky-700 border-sky-100 hover:bg-sky-100 hover:text-sky-800 gap-1.5"
          onClick={() => setDetailsOpen(true)}
        >
          <Info className="h-3 w-3" /> Details
        </Button>
      </div>
      {status === "rejected" && rejectionReason && (
        <p className="text-[9px] text-rose-600 font-medium mt-1 text-right max-w-[240px] ml-auto">{rejectionReason}</p>
      )}

      <SmsBatchDetailsSheet
        batchId={batchId}
        batchName={batchName}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
    </>
  )
}
