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

export function DiscrepancyResolutionCell({ id, customerName }: { id: string, customerName: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [notes, setNotes] = useState("")
  const [isPending, startTransition] = useTransition()

  async function handleResolve(action: 'accept' | 'reject') {
    if (action === 'reject' && !notes.trim()) {
      toast.error("Please provide a reason for rejecting the field report.")
      return
    }

    startTransition(async () => {
      const res = await resolveBillingDiscrepancy(id, action, notes)
      if (res.ok) {
        toast.success(`Discrepancy for ${customerName} ${action === 'accept' ? 'resolved' : 'ignored'}`)
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
           Resolve Conflict
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Resolve Billing Discrepancy</DialogTitle>
          <DialogDescription>
            Choose how to handle the conflict reported by the field agent for <strong>{customerName}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="notes">Resolution Notes</Label>
            <Textarea
              id="notes"
              placeholder="e.g. Verified meter physically, Excel import was outdated."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[100px]"
            />
          </div>

          <div className="p-3 bg-amber-50 rounded-lg border border-amber-100 text-[10px] text-amber-800 space-y-1">
             <p className="font-bold uppercase">Accepting (OVERWRITE):</p>
             <p>This will permanently update the customer's portal balance to match what the agent saw in the field.</p>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="destructive"
            className="w-full sm:w-auto gap-2"
            onClick={() => handleResolve('reject')}
            disabled={isPending}
          >
            <X className="h-4 w-4" /> Reject Report
          </Button>
          <Button
            className="w-full sm:w-auto gap-2 bg-green-600 hover:bg-green-700"
            onClick={() => handleResolve('accept')}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Accept Field Value
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
