"use client"

import { Button } from "@/components/ui/button"
import { recordReceiptPrint, getReceiptById } from "@/app/actions/receipts"
import { useState } from "react"
import { toast } from "sonner"
import { isNative } from "@/lib/mobile-hardware"
import { printerManager } from "@/lib/offline/printer-manager"

export function PrintButton({ receiptId }: { receiptId: string }) {
  const [loading, setLoading] = useState(false)

  const handlePrint = async () => {
    setLoading(true)
    try {
      const result = await recordReceiptPrint(receiptId)
      if (result.ok) {
        if (isNative()) {
          const r = await getReceiptById(receiptId)
          if (r) {
            await printerManager.print({
              orgName: r.orgNameSnapshot || undefined,
              orgPhone: r.orgPhoneSnapshot || undefined,
              receiptNumber: r.receiptNumber,
              customerName: r.customerName,
              customerAccount: r.customerAccount || undefined,
              amount: Number(r.amount),
              paymentMethod: r.paymentMethod,
              paymentDate: r.paymentDate.toISOString(),
              agentName: r.agentName,
              isProvisional: false
            })
            toast.success("Receipt sent to printer")
          }
        } else {
          // Small delay to ensure any server-side revalidation updates have
          // propagated to the DOM before the print preview takes a snapshot.
          setTimeout(() => window.print(), 200)
        }
      } else {
        toast.error("Failed to record print event.")
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to record print event.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      onClick={handlePrint}
      className="no-print h-11"
      disabled={loading}
    >
      {loading ? "Preparing..." : "Print / Save as PDF"}
    </Button>
  )
}
