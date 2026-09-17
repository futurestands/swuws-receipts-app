"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createCollectionPeriod } from "@/app/actions/billing"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { MONTH_NAMES, nextCollectionPeriodPlan } from "@/lib/billing/period-dates"

export function CollectionPeriodWizard() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const planned = nextCollectionPeriodPlan()
  const [formData, setFormData] = useState({
    month: String(planned.bill.month),
    year: String(planned.bill.year),
    start: planned.bounds.startDate.toISOString().slice(0, 10),
    end: planned.bounds.endDate.toISOString().slice(0, 10),
    description: "",
  })

  const periodName = `${MONTH_NAMES[Number(formData.month) - 1]} ${formData.year}`

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    startTransition(async () => {
      try {
        const result = await createCollectionPeriod({
          month: Number(formData.month),
          year: Number(formData.year),
          name: periodName,
          start: formData.start,
          end: formData.end,
          description: formData.description,
        })

        if (result.ok) {
          toast.success(`Billing period ${periodName} created`)
          setOpen(false)
          router.refresh()
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to create period"
        toast.error(message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> New Billing Period
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Billing Period</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bill month</Label>
                <Select
                  value={formData.month}
                  onValueChange={(v) => v && setFormData(prev => ({ ...prev, month: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Input
                  type="number"
                  value={formData.year}
                  onChange={(e) => setFormData(prev => ({ ...prev, year: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Generated Period Name</Label>
              <Input value={periodName} disabled className="bg-muted" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={formData.start}
                  onChange={(e) => setFormData(prev => ({ ...prev, start: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={formData.end}
                  onChange={(e) => setFormData(prev => ({ ...prev, end: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description (Optional)</Label>
              <Textarea
                placeholder="e.g. Standard monthly collection for July"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Draft Period"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
