import { notFound } from "next/navigation"
import Link from "next/link"
import { getDailyImportDetails, getDailyImportRecords } from "@/app/actions/daily-collections"
import { getReconciliationSummary } from "@/app/actions/reconciliation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { formatUGX, formatDate, formatDateTime } from "@/lib/format"
import { ArrowLeft, FileText, Database, Calendar, User, CheckCircle2, AlertCircle } from "lucide-react"
import { DailyRecordTable } from "./daily-record-table"
import { ReconcileTrigger } from "./reconcile-trigger"
import { getBatchApprovalStatus } from "@/app/actions/approval"
import { ApprovalActions } from "./approval-actions"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

/**
 * DAILY COLLECTION BATCH DETAILS (Phase 2C Repository)
 *
 * Provides a granular view of every payment record within a specific
 * import batch, supporting search and audit investigations.
 */
export default async function DailyImportDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const batch = await getDailyImportDetails(id)

  if (!batch) notFound()

  const [initialRecords, summary, approval] = await Promise.all([
    getDailyImportRecords({ batchId: id, page: 1, limit: 25 }),
    getReconciliationSummary(id),
    getBatchApprovalStatus(id)
  ])

  const matchProgress = summary.total > 0 ? (summary.matched / summary.total) * 100 : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/billing/daily" className="hover:bg-muted p-2 rounded-full transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Import Batch Details</h1>
          <p className="text-muted-foreground text-sm">Review individual payment records from EBS report.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
         {/* ... cards ... */}
         <Card>
            <CardHeader className="pb-2 px-4">
               <CardTitle className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" /> Business Date
               </CardTitle>
            </CardHeader>
            <CardContent className="px-4">
               <p className="text-lg font-bold">{formatDate(batch.businessDate)}</p>
            </CardContent>
         </Card>
         <Card>
            <CardHeader className="pb-2 px-4">
               <CardTitle className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
                  <Database className="h-3 w-3" /> Total Amount
               </CardTitle>
            </CardHeader>
            <CardContent className="px-4">
               <p className="text-lg font-bold text-primary">{formatUGX(batch.totalAmount)}</p>
            </CardContent>
         </Card>
         <Card>
            <CardHeader className="pb-2 px-4">
               <CardTitle className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
                  <FileText className="h-3 w-3" /> Total Records
               </CardTitle>
            </CardHeader>
            <CardContent className="px-4">
               <p className="text-lg font-bold">{batch.totalRecords.toLocaleString()}</p>
            </CardContent>
         </Card>
         <Card>
            <CardHeader className="pb-2 px-4">
               <CardTitle className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
                  <User className="h-3 w-3" /> Imported By
               </CardTitle>
            </CardHeader>
            <CardContent className="px-4">
               <p className="text-lg font-bold truncate" title={batch.uploadedByName}>{batch.uploadedByName}</p>
            </CardContent>
         </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
         <Card className="lg:col-span-1 border-primary/20 bg-primary/5">
            <CardHeader>
               <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Reconciliation Summary
               </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
               <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                     <span className="text-muted-foreground">Match Progress</span>
                     <span className="font-bold">{matchProgress.toFixed(1)}%</span>
                  </div>
                  <Progress value={matchProgress} className="h-1.5" />
               </div>

               <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-white rounded border flex flex-col">
                     <span className="text-[9px] uppercase font-bold text-muted-foreground">Matched</span>
                     <span className="text-sm font-bold text-green-600">{summary.matched}</span>
                  </div>
                  <div className="p-2 bg-white rounded border flex flex-col">
                     <span className="text-[9px] uppercase font-bold text-muted-foreground">Unmatched</span>
                     <span className="text-sm font-bold text-amber-600">{summary.unmatched}</span>
                  </div>
               </div>

               <div className="pt-2">
                  <ReconcileTrigger batchId={id} isDone={summary.unmatched === 0} />
               </div>

               {summary.total > 0 && (
                 <div className="pt-4 border-t mt-4">
                    <ApprovalActions
                      batchId={id}
                      currentStage={approval?.stage || 'draft'}
                      approvalData={approval}
                    />
                 </div>
               )}
            </CardContent>
         </Card>

         <Card className="lg:col-span-2">
            <CardHeader>
               <CardTitle className="text-sm">Matching Confidence</CardTitle>
               <CardDescription>Confidence distribution for automated matches.</CardDescription>
            </CardHeader>
            <CardContent>
               <div className="space-y-3">
                  {summary.methods.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-muted-foreground text-xs italic">
                       <AlertCircle className="h-8 w-8 mb-2 opacity-20" />
                       No matches processed yet.
                    </div>
                  ) : (
                    summary.methods.map(m => (
                      <div key={m.method} className="flex items-center justify-between">
                         <div className="flex flex-col">
                            <span className="text-xs font-medium capitalize">{m.method.replace(/_/g, ' ')}</span>
                            <span className="text-[10px] text-muted-foreground">
                               {m.method === 'exact_reference' ? '100% confidence' : m.method === 'account_amount_date' ? '95% confidence' : '90% confidence'}
                            </span>
                         </div>
                         <Badge variant="secondary" className="h-5">{m.count} rows</Badge>
                      </div>
                    ))
                  )}
               </div>
            </CardContent>
         </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Granular Payment Repository</CardTitle>
          <CardDescription>Search and filter official payment records associated with this batch.</CardDescription>
        </CardHeader>
        <CardContent>
           <DailyRecordTable
             batchId={id}
             initialData={initialRecords}
           />
        </CardContent>
      </Card>
    </div>
  )
}
