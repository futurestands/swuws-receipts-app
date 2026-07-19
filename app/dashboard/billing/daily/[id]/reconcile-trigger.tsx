"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { runReconciliation } from "@/app/actions/reconciliation"
import { Button } from "@/components/ui/button"
import { CheckCircle2, PlayCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"

export function ReconcileTrigger({ batchId, isDone }: { batchId: string, isDone: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  async function handleReconcile() {
    startTransition(async () => {
      try {
        const result = await runReconciliation(batchId)
        if (result.ok) {
          toast.success(`Reconciliation complete: ${result.matched} matches found.`)
          router.refresh()
        } else {
          toast.error(result.error)
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to run reconciliation")
      }
    })
  }

  return (
    <Button
      className="w-full"
      onClick={handleReconcile}
      disabled={isPending || isDone}
      variant={isDone ? "outline" : "default"}
    >
      {isPending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Processing...
        </>
      ) : isDone ? (
        <>
          <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
          Reconciliation Complete
        </>
      ) : (
        <>
          <PlayCircle className="mr-2 h-4 w-4" />
          Run Automated Matching
        </>
      )}
    </Button>
  )
}
