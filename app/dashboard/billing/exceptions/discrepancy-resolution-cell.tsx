"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Check, X, Loader2 } from "lucide-react"
import { resolveBillingDiscrepancy } from "@/app/actions/billing-engine"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

export function DiscrepancyResolutionCell({
  id,
  customerName,
  sourceType,
}: {
  id: string
  customerName: string
  sourceType?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [notes, setNotes] = useState("")
  const [isPending, startTransition] = useTransition()
  const isCrossPeriod = sourceType === "cross_period_payment"

  async function handleResolve(action: "accept" | "reject") {
    if (action === "reject" && !notes.trim()) {
      toast.error(
        isCrossPeriod
          ? "Please note why this late-payment flag does not apply."
          : "Please provide a reason for rejecting the field report.",
      )
      return
    }

    startTransition(async () => {
      const res = await resolveBillingDiscrepancy(id, action, notes)
      if (res.ok) {
        toast.success(
          isCrossPeriod
            ? `Late-payment flag for ${customerName} ${action === "accept" ? "acknowledged" : "dismissed"}`
            : `Discrepancy for ${customerName} ${action === "accept" ? "resolved" : "ignored"}`,
        )
        setIsOpen(false)
      } else {
        toast.error("Failed to update record")
      }
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          {isCrossPeriod ? "Review Flag" : "Resolve Conflict"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isCrossPeriod ? "Review Late Payment" : "Resolve Billing Discrepancy"}
          </DialogTitle>
          <DialogDescription>
            {isCrossPeriod ? (
              <>
                This payment for <strong>{customerName}</strong> landed shortly after a
                period closed. Attribution is unchanged — review only, no bill rewrite.
              </>
            ) : (
              <>
                Choose how to handle the conflict reported by the field agent for{" "}
                <strong>{customerName}</strong>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="notes">Resolution Notes</Label>
            <Textarea
              id="notes"
              placeholder={
                isCrossPeriod
                  ? "e.g. Confirmed this cash was for the new period, not the closed one."
                  : "e.g. Verified meter physically, Excel import was outdated."
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[100px]"
            />
          </div>

          <div className="p-3 bg-amber-50 rounded-lg border border-amber-100 text-[10px] text-amber-800 space-y-1">
            {isCrossPeriod ? (
              <>
                <p className="font-bold uppercase">Acknowledge (review only):</p>
                <p>
                  Marks this warning reviewed. It does not move the payment, change
                  recovery, or rewrite the customer&apos;s bill or live balance.
                </p>
              </>
            ) : (
              <>
                <p className="font-bold uppercase">Accepting (OVERWRITE):</p>
                <p>
                  This will permanently update the customer&apos;s billed total to match
                  what the agent saw in the field. Live account balance stays EBS-only.
                </p>
              </>
            )}
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="destructive"
            className="w-full sm:w-auto gap-2"
            onClick={() => handleResolve("reject")}
            disabled={isPending}
          >
            <X className="h-4 w-4" /> {isCrossPeriod ? "Dismiss Flag" : "Reject Report"}
          </Button>
          <Button
            className="w-full sm:w-auto gap-2 bg-green-600 hover:bg-green-700"
            onClick={() => handleResolve("accept")}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {isCrossPeriod ? "Acknowledge" : "Accept Field Value"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
