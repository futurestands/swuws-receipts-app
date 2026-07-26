import { notFound } from "next/navigation"
import Link from "next/link"
import { getExceptionDetails } from "@/app/actions/reconciliation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatUGX, formatDate, formatDateTime } from "@/lib/format"
import { ArrowLeft, FileText, Search, User, CreditCard, CheckCircle2 } from "lucide-react"
import { ExceptionInvestigationClient } from "./exception-investigation-client"
import { PageHeader } from "@/components/ui/page-header"

export default async function ExceptionDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getExceptionDetails(id)

  if (!data) notFound()

  const { exception, receipt, record } = data

  return (
    <div className="space-y-6 pb-20">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Investigation Workspace
            <Badge variant="outline" className="capitalize px-2 py-0 text-sm font-normal">{exception.priority} priority</Badge>
          </span>
        }
        description={`Investigating ID: ${exception.id.split('-')[0]}`}
        actions={
          <Link
            href="/dashboard/reconciliation/exceptions"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            <ArrowLeft className="size-4" /> Back to queue
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Comparison View */}
          <div className="grid gap-6 md:grid-cols-2">
             {/* Receipt Side */}
             <Card className={!receipt ? "opacity-40 grayscale border-dashed bg-muted/20" : "border-l-4 border-l-blue-500"}>
                <CardHeader className="pb-2">
                   <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                         <FileText className="h-4 w-4 text-blue-500" /> SWUWS Receipt
                      </CardTitle>
                      {receipt && <Badge variant="secondary" className="text-[10px] h-4">OPERATIONAL</Badge>}
                   </div>
                </CardHeader>
                <CardContent className="space-y-4">
                   {receipt ? (
                      <div className="space-y-3">
                         <div>
                            <p className="text-[10px] uppercase font-bold text-muted-foreground">Receipt Number</p>
                            <p className="text-sm font-bold font-mono">{receipt.receiptNumber}</p>
                         </div>
                         <div>
                            <p className="text-[10px] uppercase font-bold text-muted-foreground">Customer</p>
                            <p className="text-sm font-medium">{receipt.customerName}</p>
                            <p className="text-[10px] text-muted-foreground">Account: {receipt.customerAccount || "—"}</p>
                         </div>
                         <div className="grid grid-cols-2 gap-2">
                            <div>
                               <p className="text-[10px] uppercase font-bold text-muted-foreground">Amount</p>
                               <p className="text-sm font-bold text-primary">{formatUGX(receipt.amount)}</p>
                            </div>
                            <div>
                               <p className="text-[10px] uppercase font-bold text-muted-foreground">Date</p>
                               <p className="text-sm">{formatDate(receipt.paymentDate)}</p>
                            </div>
                         </div>
                         <div>
                            <p className="text-[10px] uppercase font-bold text-muted-foreground">Collector</p>
                            <p className="text-xs">{receipt.agentName}</p>
                         </div>
                         <div className="pt-2">
                            <Link href={`/dashboard/receipts/${receipt.id}`} className="text-[10px] text-primary hover:underline flex items-center gap-1">
                               View full receipt record <ArrowLeft className="h-2 w-2 rotate-180" />
                            </Link>
                         </div>
                      </div>
                   ) : (
                      <div className="py-8 text-center text-muted-foreground italic text-xs">
                         No corresponding receipt record found in this exception.
                      </div>
                   )}
                </CardContent>
             </Card>

             {/* External Side */}
             <Card className={!record ? "opacity-40 grayscale border-dashed bg-muted/20" : "border-l-4 border-l-orange-500"}>
                <CardHeader className="pb-2">
                   <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                         <CreditCard className="h-4 w-4 text-orange-500" /> EBS External Record
                      </CardTitle>
                      {record && <Badge variant="secondary" className="text-[10px] h-4 uppercase">Financial Truth</Badge>}
                   </div>
                </CardHeader>
                <CardContent className="space-y-4">
                   {record ? (
                      <div className="space-y-3">
                         <div>
                            <p className="text-[10px] uppercase font-bold text-muted-foreground">External Reference</p>
                            <p className="text-sm font-bold font-mono">{record.externalReference}</p>
                         </div>
                         <div>
                            <p className="text-[10px] uppercase font-bold text-muted-foreground">Reported Customer</p>
                            <p className="text-sm font-medium">{record.customerName}</p>
                            <p className="text-[10px] text-muted-foreground">Account: {record.accountNumber}</p>
                         </div>
                         <div className="grid grid-cols-2 gap-2">
                            <div>
                               <p className="text-[10px] uppercase font-bold text-muted-foreground">Confirmed Amount</p>
                               <p className="text-sm font-bold text-orange-600">{formatUGX(record.amount)}</p>
                            </div>
                            <div>
                               <p className="text-[10px] uppercase font-bold text-muted-foreground">Bank Date</p>
                               <p className="text-sm">{formatDate(record.paymentDate)}</p>
                            </div>
                         </div>
                         <div>
                            <p className="text-[10px] uppercase font-bold text-muted-foreground">Channel</p>
                            <p className="text-xs">{record.paymentChannel}</p>
                         </div>
                         <div className="pt-2 text-[10px] text-muted-foreground italic">
                            Origin: Batch #{record.batchId.split('-')[0]}
                         </div>
                      </div>
                   ) : (
                      <div className="py-8 text-center text-muted-foreground italic text-xs">
                         No corresponding external billing record found in this exception.
                      </div>
                   )}
                </CardContent>
             </Card>
          </div>

          <Card>
            <CardHeader>
               <CardTitle className="text-sm flex items-center gap-2">
                  <Search className="h-4 w-4" /> Root Cause Analysis
               </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
               <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Mismatch Reason</p>
                  <p className="text-sm">{exception.reason}</p>
               </div>

               <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1">
                     <p className="text-[10px] uppercase font-bold text-muted-foreground">Exception Type</p>
                     <p className="text-xs font-medium capitalize">{exception.exceptionType.replace(/_/g, ' ')}</p>
                  </div>
                  <div className="space-y-1">
                     <p className="text-[10px] uppercase font-bold text-muted-foreground">Detected On</p>
                     <p className="text-xs">{formatDateTime(exception.createdAt)}</p>
                  </div>
                  <div className="space-y-1">
                     <p className="text-[10px] uppercase font-bold text-muted-foreground">Status</p>
                     <Badge variant="outline" className="h-5 capitalize text-[10px]">{exception.status.replace(/_/g, ' ')}</Badge>
                  </div>
               </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1 space-y-6">
           <ExceptionInvestigationClient
              exceptionId={exception.id}
              initialStatus={exception.status}
              initialNotes={exception.reviewNotes}
              initialResolution={exception.resolution}
           />

           <Card>
              <CardHeader className="pb-2">
                 <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Audit Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                 <div className="flex items-center gap-2 text-xs">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <span>Assigned: <span className="font-medium text-foreground">Unassigned</span></span>
                 </div>
                 {exception.resolvedAt && (
                   <div className="flex items-center gap-2 text-xs text-green-600">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Resolved: {formatDateTime(exception.resolvedAt)}</span>
                   </div>
                 )}
              </CardContent>
           </Card>
        </div>
      </div>
    </div>
  )
}
