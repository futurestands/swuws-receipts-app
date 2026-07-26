"use client"

import { useCallback, useEffect, useState } from "react"
import { verifyReceipt, type VerifyResult } from "@/app/actions/verify"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { formatUGX, formatDateTime } from "@/lib/format"
import { CheckCircle2, XCircle } from "lucide-react"

export function VerifyForm({ initialReceiptNumber }: { initialReceiptNumber?: string }) {
  const [receiptNumber, setReceiptNumber] = useState(initialReceiptNumber ?? "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<VerifyResult | null>(null)

  const runVerify = useCallback(async (value: string) => {
    setLoading(true)
    setError(null)
    setResult(null)
    const outcome = await verifyReceipt(value)
    setLoading(false)
    if (!outcome.ok) {
      setError(outcome.error)
      return
    }
    setResult(outcome.result)
  }, [])

  useEffect(() => {
    // A QR code encodes /verify?number=..., so a scan should show the
    // result immediately without an extra tap.
    if (initialReceiptNumber) {
      runVerify(initialReceiptNumber)
    }
  }, [initialReceiptNumber, runVerify])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!receiptNumber.trim()) return
    runVerify(receiptNumber)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Check a receipt</CardTitle>
          <CardDescription>Enter the receipt number exactly as printed, e.g. SWUWS-2026-000123.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor="receiptNumber" className="sr-only">
                Receipt number
              </Label>
              <Input
                id="receiptNumber"
                placeholder="SWUWS-2026-000123"
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "Checking…" : "Verify"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="pt-6 flex items-start gap-3">
            <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Not verified</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="border-green-600/40">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3 mb-4">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Valid receipt</p>
                <p className="text-sm text-muted-foreground">
                  Issued by {result.orgName}
                  {result.branchName ? ` · ${result.branchName} branch` : ""}
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-y-2 text-sm border-t pt-4">
              <dt className="text-muted-foreground">Receipt number</dt>
              <dd className="font-mono font-medium">{result.receiptNumber}</dd>
              <dt className="text-muted-foreground">Customer</dt>
              <dd className="font-medium">{result.customerName}</dd>
              <dt className="text-muted-foreground">Amount</dt>
              <dd className="font-medium">{formatUGX(result.amount)}</dd>
              <dt className="text-muted-foreground">Date</dt>
              <dd className="font-medium">{formatDateTime(result.paymentDate)}</dd>
              <dt className="text-muted-foreground">Print count</dt>
              <dd className="font-medium">{result.printCount}</dd>
              {result.lastPrintedAt && (
                <>
                  <dt className="text-muted-foreground">Last printed</dt>
                  <dd className="font-medium">{formatDateTime(result.lastPrintedAt)}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Verified at</dt>
              <dd className="font-medium">{formatDateTime(result.verifiedAt)}</dd>
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
