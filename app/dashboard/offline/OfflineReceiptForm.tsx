"use client"

import { useState, useEffect } from "react"
import { sqliteService } from "@/lib/offline/sqlite-service"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"
import { formatUGX } from "@/lib/format"
import { randomUUID } from "crypto"

export function OfflineReceiptForm({
  customerId,
  onSuccess,
  onCancel
}: {
  customerId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [data, setData] = useState<any>(null)
  const [amount, setAmount] = useState("")
  const [method, setPaymentMethod] = useState("cash")
  const [ref, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    sqliteService.getCustomerWithBill(customerId).then(setData)
  }, [customerId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount")
      return
    }

    setPending(true)
    try {
      const id = window.crypto.randomUUID()
      await sqliteService.enqueueReceipt({
        id,
        customerId,
        billingRecordId: data?.bill?.id,
        amount: parseFloat(amount),
        paymentMethod: method,
        paymentReference: ref,
        notes,
        paymentDate: new Date().toISOString()
      })
      toast.success("Receipt queued for sync")
      onSuccess()
    } catch (err) {
      console.error(err)
      toast.error("Failed to queue receipt locally")
    } finally {
      setPending(false)
    }
  }

  if (!data) return <div className="p-4 text-center">Loading customer data...</div>

  const { customer, bill } = data

  return (
    <Card className="border-primary/20 shadow-lg">
      <CardHeader className="bg-primary/5">
        <CardTitle className="text-lg">Record Offline Payment</CardTitle>
        <CardDescription>
          Issuing for: <span className="font-bold text-foreground">{customer.name}</span> ({customer.customerAccount})
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {bill && (
            <div className="p-3 bg-muted rounded-lg text-sm mb-4">
              <p className="font-bold uppercase text-[10px] text-muted-foreground mb-1">Active Bill Detected</p>
              <p>Amount Due: <span className="font-bold">{formatUGX(Number(bill.totalDue))}</span></p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="offline-amount">Amount Collected (UGX)</Label>
            <Input
              id="offline-amount"
              type="number"
              placeholder="e.g. 50000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-lg font-bold h-12"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={method} onValueChange={(v) => setPaymentMethod(v || "cash")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="offline-ref">Ref (Optional)</Label>
              <Input
                id="offline-ref"
                value={ref}
                onChange={(e) => setReference(e.target.value)}
                placeholder="External Ref"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="offline-notes">Notes</Label>
            <Textarea
              id="offline-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional details..."
              rows={2}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onCancel} className="flex-1" disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={pending}>
              {pending ? "Saving..." : "Save Offline"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
