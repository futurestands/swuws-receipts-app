"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Send, Loader2, Info } from "lucide-react"
import { processSmsBatch } from "@/app/actions/crm"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

export function SmsBatchActions({ batchId, status }: { batchId: string, status: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSend() {
    if (!confirm("Are you sure you want to start sending this SMS batch?")) return

    startTransition(async () => {
      try {
        const res = await processSmsBatch(batchId)
        if (res.ok) {
          toast.success("SMS batch processed successfully.")
          router.refresh()
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to process batch")
      }
    })
  }

  return (
    <div className="flex justify-end gap-2">
      {status === 'pending' && (
        <Button
          size="sm"
          className="h-7 text-[10px] font-black bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
          onClick={handleSend}
          disabled={isPending}
        >
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          SEND NOW
        </Button>
      )}
      <Button variant="outline" size="sm" className="h-7 text-[10px] font-bold bg-sky-50 text-sky-700 border-sky-100 hover:bg-sky-100 hover:text-sky-800 gap-1.5">
        <Info className="h-3 w-3" /> Details
      </Button>
    </div>
  )
}
