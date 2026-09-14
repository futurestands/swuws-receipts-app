"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Send, Loader2, Info, RefreshCw } from "lucide-react"
import { processSmsBatch } from "@/app/actions/crm"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { SmsBatchDetailsSheet } from "./sms-batch-details-sheet"

export function SmsBatchActions({
  batchId,
  batchName,
  status,
}: {
  batchId: string
  batchName: string
  status: string
}) {
  const [isPending, startTransition] = useTransition()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const router = useRouter()

  function handleSend() {
    if (!confirm("Are you sure you want to start sending this SMS batch?")) return

    startTransition(async () => {
      try {
        const res = await processSmsBatch(batchId)
        if (res.ok) {
          // A run can end with messages still queued: sending is bounded per
          // call so a large batch cannot outrun the request timeout. Say so
          // rather than implying the whole batch went out.
          const remaining = "remaining" in res ? res.remaining : 0
          if (remaining && remaining > 0) {
            toast.success(`Sent ${res.sent}, ${remaining} still queued — press Send again to continue.`)
          } else if ("failed" in res && res.failed > 0) {
            toast.warning(`Batch finished with ${res.sent} sent and ${res.failed} failed. Open Details to see why.`)
          } else {
            toast.success("SMS batch sent.")
          }
          router.refresh()
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to process batch")
      }
    })
  }

  // "processing" is claimable too: a crash or redeploy mid-send used to leave
  // a batch in that state permanently, with no route to resume it.
  const canSend = status === "pending" || status === "processing" || status === "failed"
  const isRetry = status === "processing" || status === "failed"

  return (
    <>
      <div className="flex justify-end gap-2">
        {canSend && (
          <Button
            size="sm"
            className="h-7 text-[10px] font-black bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            onClick={handleSend}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isRetry ? (
              <RefreshCw className="h-3 w-3" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            {isRetry ? "RESUME" : "SEND NOW"}
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

      <SmsBatchDetailsSheet
        batchId={batchId}
        batchName={batchName}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
    </>
  )
}
