import { notFound } from "next/navigation"
import { getReceiptById, getReceiptAttachments, getPrintHistory } from "@/app/actions/receipts"
import { PrintButton } from "@/app/dashboard/receipts/[id]/print-button"
import { VoidReceiptButton } from "@/app/dashboard/receipts/[id]/void-receipt-button"
import { AttachmentUpload } from "@/app/dashboard/receipts/[id]/attachment-upload"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatUGX, formatDateTime } from "@/lib/format"
import { getSiteUrl } from "@/lib/site-url"
import { getCurrentUser } from "@/lib/session"
import { hasPermission } from "@/lib/iam"
import Link from "next/link"
import { ArrowLeft, History, Ban, AlertCircle } from "lucide-react"
import { SectionHeader } from "@/components/ui/page-header"
import { ScrollableTableContainer } from "@/components/ui/responsive-table"
import { EmptyState } from "@/components/ui/empty-state"
import { Badge } from "@/components/ui/badge"

export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [receipt, attachments, printHistory, current] = await Promise.all([
    getReceiptById(id),
    getReceiptAttachments(id),
    getPrintHistory(id),
    getCurrentUser()
  ])

  if (!receipt) notFound()

  const canVoid = current ? await hasPermission(current, "receipts.void") : false
  const isMatched = receipt.reconciliationStatus === "matched"

  const siteUrl = await getSiteUrl()
  const verifyUrl = `${siteUrl}/verify?number=${encodeURIComponent(receipt.receiptNumber)}`
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(verifyUrl)}`

  const rows: Array<readonly [string, string]> = [
    ["Customer", receipt.customerName],
    ...(receipt.customerAccount ? ([["Account number", receipt.customerAccount]] as const) : []),
    ...(receipt.customerPhone ? ([["Phone", receipt.customerPhone]] as const) : []),
    ...(receipt.customerAddress ? ([["Address", receipt.customerAddress]] as const) : []),
    ...(receipt.schemeNameSnapshot
      ? ([["Water Scheme", receipt.schemeNameSnapshot]] as const)
      : []),
    ...(receipt.billingPeriodSnapshot
      ? ([["Billing Period", receipt.billingPeriodSnapshot]] as const)
      : []),
    ["Payment method", receipt.paymentMethod.replace(/_/g, " ")],
    ["Payment reference", receipt.paymentReference],
    ["Collection date", formatDateTime(receipt.paymentDate)],
    ...(receipt.branchName ? ([["Branch", receipt.branchName]] as const) : []),
    ["Collected by", `${receipt.agentName} (${receipt.agentEmail})`],
    ...(receipt.notes ? ([["Notes", receipt.notes]] as const) : []),
  ]

  // Financial Breakdown Logic
  const amountCollected = receipt.amount
  const prevBalance = receipt.previousAccountBalanceSnapshot
  const newBalance = receipt.newAccountBalanceSnapshot

  const isCredit = newBalance < 0
  const absBalance = Math.abs(newBalance)
  const remainingOutstanding = receipt.outstandingBalance ?? 0

  return (
    <div className="space-y-4 print-page">
      <div className="flex items-center justify-between no-print">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-4" /> Back to dashboard
        </Link>
        <div className="flex items-center gap-2">
          {canVoid && (
            <VoidReceiptButton
              receiptId={receipt.id}
              isVoided={receipt.isVoided}
              disabled={isMatched}
            />
          )}
          <PrintButton receiptId={receipt.id} />
        </div>
      </div>

      <Card className="relative !overflow-visible shadow-none border-none md:border md:shadow-sm">
        <CardContent className="print-area p-8 relative !overflow-visible">
          {/* Voided Watermark */}
          {receipt.isVoided && (
            <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center opacity-[0.15] rotate-[-25deg] select-none">
              <span className="text-[140px] font-black tracking-tighter text-destructive border-[12px] border-destructive px-8 rounded-3xl">
                VOIDED
              </span>
            </div>
          )}

          {/* Reprint Watermark */}
          {!receipt.isVoided && receipt.printCount > 0 && (
            <div className="absolute inset-0 pointer-events-none hidden print:flex items-center justify-center opacity-[0.08] rotate-[-35deg] select-none">
              <span className="text-[120px] font-black tracking-tighter">
                REPRINT {receipt.printCount > 1 && `#${receipt.printCount}`}
              </span>
            </div>
          )}

          <div className="flex items-start justify-between border-b pb-4 mb-6">
            <div className="flex items-center gap-3">
              {receipt.logoUrlSnapshot && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={receipt.logoUrlSnapshot} alt="" className="h-12 w-12 object-contain" />
              )}
              <div>
                <p className="font-semibold text-lg">{receipt.orgNameSnapshot}</p>
                <div className="text-[10px] text-muted-foreground leading-tight">
                  {receipt.orgAddressSnapshot && <p>{receipt.orgAddressSnapshot}</p>}
                  {receipt.orgPhoneSnapshot && <p>Tel: {receipt.orgPhoneSnapshot}</p>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Official Payment Receipt</p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex flex-col items-end gap-1 mb-1">
                <p className="font-mono font-semibold">{receipt.receiptNumber}</p>
                {receipt.isVoided && (
                  <Badge variant="destructive" className="animate-pulse flex gap-1">
                    <Ban className="size-3" /> VOIDED
                  </Badge>
                )}
                {!receipt.customerId && (
                  <Badge variant="destructive" className="flex gap-1 border-2 border-destructive bg-destructive/10 text-destructive font-black">
                    <AlertCircle className="size-3" /> UNLINKED TRANSACTION
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{formatDateTime(receipt.createdAt)}</p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm mb-6">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="space-y-2 mb-6 border rounded-lg p-4 bg-muted/20">
            <h3 className="text-xs font-bold uppercase text-muted-foreground mb-4 border-b pb-2">Financial Breakdown</h3>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Previous Arrears</span>
              <span className="font-mono">{formatUGX(prevBalance)}</span>
            </div>

            <div className="flex items-center justify-between text-sm font-semibold border-t pt-2">
              <span className="">Amount Collected</span>
              <span className="font-mono text-primary">{formatUGX(amountCollected)}</span>
            </div>

            <div className="flex items-center justify-between text-base font-bold text-primary mt-4 pt-2 border-t border-double">
              <span>{isCredit ? "New Credit Balance" : "New Account Arrears"}</span>
              <span className="font-mono">{formatUGX(absBalance)}</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground border-t pt-4">
            {receipt.disclaimerSnapshot}
          </p>
          <div className="flex items-center justify-between mt-4">
            <div>
              <p className="text-xs text-muted-foreground">{receipt.footerSnapshot}</p>
              {receipt.printCount > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Printed {receipt.printCount} time{receipt.printCount > 1 ? "s" : ""}.
                  Last: {formatDateTime(receipt.lastPrintedAt!)} by {receipt.lastPrintedBy}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">Scan to verify</p>
                <p className="text-[10px] text-muted-foreground font-mono">{receipt.receiptNumber}</p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrSrc} alt="Scan to verify this receipt" width={70} height={70} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Print History Section */}
      <Card className="no-print">
        <CardContent className="p-6">
          <SectionHeader title="Print History" />
          {printHistory.length === 0 ? (
            <EmptyState
              icon={History}
              title="No print history recorded"
              description="A record is created each time this receipt is printed or reprinted."
            />
          ) : (
            <ScrollableTableContainer className="border-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>IP Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {printHistory.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-sm">
                        {entry.isReprint ? `Reprint #${entry.printNumber}` : "Original Print"}
                      </TableCell>
                      <TableCell className="text-sm">{formatDateTime(entry.printedAt)}</TableCell>
                      <TableCell className="text-sm">{entry.printedByName}</TableCell>
                      <TableCell className="text-sm font-mono text-xs">{entry.ipAddress}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollableTableContainer>
          )}
        </CardContent>
      </Card>

      <Card className="no-print">
        <CardContent className="p-6">
          <SectionHeader title="Attachments" />
          <AttachmentUpload key={receipt.id} receiptId={receipt.id} initialAttachments={attachments} />
        </CardContent>
      </Card>
    </div>
  )
}
