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
    if (!confirm("Queue bill reminders for this import? The list will wait in CRM SMS for an approver before any message is sent.")) return

    startTransition(async () => {
      try {
        const res = await generateRemindersFromImport(runId)
        if (res.ok) {
          toast.success("Reminder list saved as a draft in CRM SMS. An approver must release it before sending.")
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
      Queue reminders
    </Button>
  )
}
