"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { requestReceiptVoid } from "@/app/actions/receipts"
import { toast } from "sonner"
import { Ban } from "lucide-react"
import { cn } from "@/lib/utils"

export function VoidReceiptButton({
  receiptId,
  disabled,
  isVoided,
  variant = "large"
}: {
  receiptId: string
  disabled?: boolean
  isVoided?: boolean
  variant?: "small" | "large"
}) {
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const router = useRouter()

  if (isVoided) return null

  function handleVoid() {
    if (!reason.trim()) {
      toast.error("A reason is required to void a receipt.")
      return
    }

    startTransition(async () => {
      try {
        const result = await requestReceiptVoid(receiptId, reason)
        if (result.ok) {
          toast.success("Receipt successfully voided. Customer balance restored.")
          setOpen(false)
          router.refresh()
        } else {
          toast.error(result.error)
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "An error occurred"
        toast.error(message)
      }
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {variant === "small" ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:bg-destructive/10"
            disabled={disabled}
            title="Void Receipt"
          >
            <Ban className="size-4" />
          </Button>
        ) : (
          <Button
            variant="outline"
            className="text-destructive hover:bg-destructive/5 gap-2"
            disabled={disabled}
          >
            <Ban className="size-4" /> Void Receipt
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Void Receipt?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently reverse the payment and restore the customer&apos;s balance.
            This action cannot be undone and will be recorded in the audit trail.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-4">
          <Label htmlFor="void-reason" className="text-xs font-bold uppercase">Reason for voiding</Label>
          <Textarea
            id="void-reason"
            placeholder="e.g. Error in amount entered, customer changed mind..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={pending}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              handleVoid()
            }}
            className="bg-destructive hover:bg-destructive/90"
            disabled={pending || !reason.trim()}
          >
            {pending ? "Processing..." : "Confirm Void"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
