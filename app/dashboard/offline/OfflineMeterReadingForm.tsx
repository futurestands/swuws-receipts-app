"use client"

import { useState, useEffect } from "react"
import { sqliteService } from "@/lib/offline/sqlite-service"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"
import { Calculator, AlertCircle } from "lucide-react"

export function OfflineMeterReadingForm({
  customerId,
  onSuccess,
  onCancel
}: {
  customerId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [data, setData] = useState<any>(null)
  const [syncMeta, setSyncMeta] = useState<any>(null)
  const [currentReading, setCurrentReading] = useState("")
  const [notes, setNotes] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    Promise.all([
      sqliteService.getCustomerWithBill(customerId),
      sqliteService.getSyncMeta()
    ]).then(([custData, meta]) => {
      setData(custData)
      setSyncMeta(meta)
    })
  }, [customerId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!syncMeta?.lastSuccessfulPullAt) {
      toast.error("Sync meta not found. Please sync cache first.")
      return
    }

    const current = parseInt(currentReading)
    if (isNaN(current) || current < 0) {
      toast.error("Please enter a valid reading")
      return
    }

    const previous = data?.customer?.lastReading || 0
    if (current < previous) {
      toast.error(`Invalid reading: ${current} is lower than the previous reading of ${previous}`)
      return
    }

    setPending(true)
    try {
      const id = window.crypto.randomUUID()
      await sqliteService.enqueueMeterReading({
        id,
        customerId,
        billingPeriodId: syncMeta.activePeriodId || 'unknown', // We should ensure activePeriodId is in sync_meta
        previousReading: previous,
        currentReading: current,
        notes
      })
      toast.success("Meter reading queued for sync")
      onSuccess()
    } catch (err) {
      console.error(err)
      toast.error("Failed to queue reading locally")
    } finally {
      setPending(false)
    }
  }

  if (!data) return <div className="p-4 text-center">Loading customer data...</div>

  const { customer } = data

  return (
    <Card className="border-blue-200 shadow-lg">
      <CardHeader className="bg-blue-50/50">
        <CardTitle className="text-lg flex items-center gap-2">
          <Calculator className="h-5 w-5 text-blue-600" />
          Capture Offline Reading
        </CardTitle>
        <CardDescription>
          Customer: <span className="font-bold text-foreground">{customer.name}</span> ({customer.customerAccount})
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground uppercase text-[10px] font-bold">Previous Reading</Label>
              <div className="h-12 flex items-center px-3 bg-muted rounded-md font-mono text-lg font-bold">
                {customer.lastReading || 0}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="current-reading">Current Reading</Label>
              <Input
                id="current-reading"
                type="number"
                placeholder="Enter reading"
                value={currentReading}
                onChange={(e) => setCurrentReading(e.target.value)}
                className="h-12 font-mono text-lg font-bold"
                required
                autoFocus
              />
            </div>
          </div>

          {currentReading && !isNaN(parseInt(currentReading)) && (
            <div className={`p-3 rounded-lg text-sm flex items-center gap-3 ${parseInt(currentReading) >= (customer.lastReading || 0) ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p>
                Consumption: <span className="font-bold">{Math.max(0, parseInt(currentReading) - (customer.lastReading || 0))} m³</span>
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reading-notes">Notes (Optional)</Label>
            <Textarea
              id="reading-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Broken meter, leak detected, etc..."
              rows={2}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onCancel} className="flex-1" disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={pending}>
              {pending ? "Saving..." : "Save Offline"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
