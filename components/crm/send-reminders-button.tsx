"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Send, Loader2 } from "lucide-react"
import { generateRemindersFromImport } from "@/app/actions/crm"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

export function SendRemindersButton({ runId }: { runId: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSend() {
    if (!confirm("Are you sure you want to generate and queue SMS bill reminders for everyone in this import batch?")) return

    startTransition(async () => {
      try {
        const res = await generateRemindersFromImport(runId)
        if (res.ok) {
          toast.success("SMS reminders generated and queued in the CRM SMS Hub.")
          router.push("/dashboard/crm/sms")
        } else {
          const errorMessage = "error" in res ? res.error : "Failed to generate reminders"
          toast.error(errorMessage)
        }
      } catch (err) {
        toast.error("An unexpected error occurred")
      }
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 gap-1.5 text-emerald-700 border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100 transition-colors"
      onClick={handleSend}
      disabled={isPending}
    >
      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
      Reminders
    </Button>
  )
}
