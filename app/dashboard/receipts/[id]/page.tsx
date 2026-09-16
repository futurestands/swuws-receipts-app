import { notFound } from "next/navigation"
import { getReceiptById, getReceiptAttachments, getPrintHistory } from "@/app/actions/receipts"
import { getSettings } from "@/app/actions/settings"
import { PrintButton } from "@/app/dashboard/receipts/[id]/print-button"
import { VoidReceiptButton } from "@/components/receipts/void-receipt-button"
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
  const [receipt, attachments, printHistory, current, settings] = await Promise.all([
    getReceiptById(id),
    getReceiptAttachments(id),
    getPrintHistory(id),
    getCurrentUser(),
    getSettings()
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

  const isCredit = Number(newBalance) < 0
  const absBalance = Math.abs(Number(newBalance))
  const remainingOutstanding = Number(receipt.outstandingBalance ?? 0)

  return (
    <div className="w-full max-w-full space-y-4 overflow-x-hidden print-page">
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-4" /> Back to dashboard
        </Link>
        <div className="flex flex-wrap items-center gap-2">
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

      <Card className="relative w-full max-w-full overflow-hidden shadow-none border-none md:border md:shadow-sm">
        <CardContent className="print-area relative w-full max-w-full overflow-x-hidden p-4 sm:p-8">
          {/* Voided Watermark */}
          {receipt.isVoided && (
            <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center overflow-hidden opacity-[0.15] rotate-[-25deg] select-none">
              <span className="text-5xl sm:text-[140px] font-black tracking-tighter text-destructive border-4 sm:border-[12px] border-destructive px-3 sm:px-8 rounded-3xl">
                VOIDED
              </span>
            </div>
          )}

          {/* Reprint Watermark */}
          {!receipt.isVoided && receipt.printCount > 0 && (
            <div className="absolute inset-0 pointer-events-none hidden print:flex items-center justify-center overflow-hidden opacity-[0.08] rotate-[-35deg] select-none">
              <span className="text-4xl sm:text-[120px] font-black tracking-tighter">
                REPRINT {receipt.printCount > 1 && `#${receipt.printCount}`}
              </span>
            </div>
          )}

          <div className="flex flex-col gap-3 border-b pb-4 mb-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              {receipt.logoUrlSnapshot && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={receipt.logoUrlSnapshot} alt="" className="h-10 w-10 sm:h-12 sm:w-12 shrink-0 object-contain" />
              )}
              <div className="min-w-0">
                <p className="font-semibold text-base sm:text-lg break-words">{receipt.orgNameSnapshot}</p>
                <div className="text-[10px] text-muted-foreground leading-tight break-words">
                  {receipt.orgAddressSnapshot && <p>{receipt.orgAddressSnapshot}</p>}
                  {receipt.orgPhoneSnapshot && <p>Tel: {receipt.orgPhoneSnapshot}</p>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Official Payment Receipt</p>
              </div>
            </div>
            <div className="sm:text-right shrink-0">
              <div className="flex flex-col sm:items-end gap-1 mb-1">
                <p className="font-mono font-semibold text-sm break-all">{receipt.receiptNumber}</p>
                {receipt.isVoided && (
                  <Badge variant="destructive" className="animate-pulse flex gap-1 w-fit">
                    <Ban className="size-3" /> VOIDED
                  </Badge>
                )}
                {!receipt.customerId && (
                  <Badge variant="destructive" className="flex gap-1 border-2 border-destructive bg-destructive/10 text-destructive font-black w-fit">
                    <AlertCircle className="size-3" /> UNLINKED TRANSACTION
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{formatDateTime(receipt.createdAt)}</p>
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-y-3 text-sm mb-6">
            {rows.map(([label, value]) => (
              <div key={label} className="flex flex-col min-w-0">
                <dt className="text-muted-foreground text-[10px] uppercase font-bold">{label}</dt>
                <dd className="font-medium break-words">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="space-y-2 mb-6 border rounded-lg p-3 sm:p-4 bg-muted/20">
            <h3 className="text-xs font-bold uppercase text-muted-foreground mb-4 border-b pb-2">Financial Breakdown</h3>

            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
              <span className="text-muted-foreground">Previous Arrears</span>
              <span className="font-mono break-all">{formatUGX(Number(prevBalance))}</span>
            </div>

            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm font-semibold border-t pt-2">
              <span>Amount Collected</span>
              <span className="font-mono text-primary break-all">{formatUGX(Number(amountCollected))}</span>
            </div>

            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-base font-bold text-primary mt-4 pt-2 border-t border-double">
              <span className="min-w-0">{isCredit ? "New Credit Balance" : "New Account Arrears"}</span>
              <span className="font-mono break-all">{formatUGX(absBalance)}</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground border-t pt-4 break-words">
            {receipt.disclaimerSnapshot}
          </p>
          <div className="flex flex-col gap-3 mt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground break-words">{receipt.footerSnapshot}</p>
              {receipt.printCount > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1 break-words">
                  Printed {receipt.printCount} time{receipt.printCount > 1 ? "s" : ""}.
                  Last: {formatDateTime(receipt.lastPrintedAt!)} by {receipt.lastPrintedBy}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-left sm:text-right">
                <p className="text-[10px] text-muted-foreground">Scan to verify</p>
                <p className="text-[10px] text-muted-foreground font-mono break-all">{receipt.receiptNumber}</p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrSrc} alt="Scan to verify this receipt" width={56} height={56} className="h-14 w-14" />
            </div>
          </div>
          {settings.developerCredit && (
            <div className="mt-8 pt-4 border-t border-dashed text-center">
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-medium">
                &copy; {new Date().getFullYear()} {settings.developerCredit}
              </p>
            </div>
          )}
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
