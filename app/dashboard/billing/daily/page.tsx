import { requireUser } from "@/lib/session"
import { canUploadBilling } from "@/lib/permissions"
import { listDailyImports } from "@/app/actions/daily-collections"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatUGX, formatDate, formatDateTime } from "@/lib/format"
import { Info, History } from "lucide-react"
import { DailyImportWizard } from "./daily-import-wizard"
import Link from "next/link"
import { PageHeader } from "@/components/ui/page-header"
import { ScrollableTableContainer } from "@/components/ui/responsive-table"
import { EmptyState } from "@/components/ui/empty-state"

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
      <PageHeader
        title="Daily Collection Import"
        description="Manage daily payment reports confirmed by the External Billing System."
        actions={<DailyImportWizard />}
      />

      {history.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-4">
            <EmptyState
              icon={History}
              title="No Daily Collection Imports Found"
              description="Daily Collection reports imported from the External Billing System will appear here. This will be the official source for confirmed daily totals."
              action={
                <div className="flex flex-col items-center gap-4">
                  <DailyImportWizard />
                </div>
              }
            />
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
            <ScrollableTableContainer className="border-0">
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
            </ScrollableTableContainer>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
