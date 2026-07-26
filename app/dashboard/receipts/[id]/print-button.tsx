"use client"

import { Button } from "@/components/ui/button"
import { recordReceiptPrint } from "@/app/actions/receipts"
import { useState } from "react"
import { toast } from "sonner"

export function PrintButton({ receiptId }: { receiptId: string }) {
  const [loading, setLoading] = useState(false)

  const handlePrint = async () => {
    setLoading(true)
    try {
      const result = await recordReceiptPrint(receiptId)
      if (result.ok) {
        window.print()
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
