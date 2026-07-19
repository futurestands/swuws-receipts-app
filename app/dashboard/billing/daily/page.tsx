import { requireUser } from "@/lib/session"
import { canUploadBilling } from "@/lib/permissions"
import { listDailyImports } from "@/app/actions/daily-collections"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatUGX, formatDate, formatDateTime } from "@/lib/format"
import { FileUp, Info, History } from "lucide-react"
import { DailyImportWizard } from "./daily-import-wizard"
import Link from "next/link"

/**
 * DAILY COLLECTION IMPORT PAGE (Phase 2B Engine)
 *
 * This module provides the engine for importing confirmed payment reports
 * from the External Billing System.
 */
export default async function DailyCollectionImportPage() {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")

  const history = await listDailyImports()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Daily Collection Import</h1>
          <p className="text-muted-foreground">
            Manage daily payment reports confirmed by the External Billing System.
          </p>
        </div>
        <div className="flex gap-2">
          <DailyImportWizard />
        </div>
      </div>

      {history.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="bg-muted p-4 rounded-full">
              <History className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-lg">No Daily Collection Imports Found</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Daily Collection reports imported from the External Billing System will appear here.
                This will be the official source for confirmed daily totals.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-green-600 font-bold uppercase tracking-wider bg-green-50 px-3 py-1 rounded-full border border-green-100 mt-4">
              <Info className="h-3 w-3" />
              Import Engine Operational (Phase 2B)
            </div>
            <DailyImportWizard />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Import History</CardTitle>
            <CardDescription>
              Previously processed daily collection reports.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business Date</TableHead>
                  <TableHead>Filename</TableHead>
                  <TableHead className="text-right">Records</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uploaded By</TableHead>
                  <TableHead>Imported On</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                       <Link href={`/dashboard/billing/daily/${item.id}`} className="hover:underline text-primary">
                          {formatDate(item.businessDate)}
                       </Link>
                    </TableCell>
                    <TableCell className="text-sm font-mono">{item.filename}</TableCell>
                    <TableCell className="text-right">{item.totalRecords.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{formatUGX(item.totalAmount)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{item.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{item.uploadedByName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(item.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
