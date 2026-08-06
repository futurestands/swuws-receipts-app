"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import type { Receipt } from "@/lib/db/schema"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { formatUGX, formatDateTime } from "@/lib/format"
import { ResponsiveToolbar } from "@/components/ui/toolbar"
import { ResponsiveFilterBar } from "@/components/ui/filter-bar"
import { ScrollableTableContainer } from "@/components/ui/responsive-table"
import { EmptyState } from "@/components/ui/empty-state"
import { Receipt as ReceiptIcon, Search } from "lucide-react"
import { VoidReceiptButton } from "@/components/receipts/void-receipt-button"

export function ReceiptsTable({ receipts, isAdmin }: { receipts: Receipt[]; isAdmin: boolean }) {
  const [query, setQuery] = useState("")

  // Client-side filter over the already-fetched receipts - presentation-only,
  // does not call any server action or change what data is fetched.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return receipts
    return receipts.filter(
      (r) =>
        r.receiptNumber?.toLowerCase().includes(q) ||
        r.customerName?.toLowerCase().includes(q) ||
        (isAdmin && r.agentName?.toLowerCase().includes(q))
    )
  }, [receipts, query, isAdmin])

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <ResponsiveToolbar
          left={
            <div>
              <h2 className="text-base font-medium text-foreground">Recent receipts</h2>
              <p className="text-xs text-muted-foreground">
                Showing the latest {receipts.length} receipt{receipts.length === 1 ? "" : "s"}
                {isAdmin ? " org-wide" : ""}.
              </p>
            </div>
          }
        />

        {receipts.length > 0 && (
          <ResponsiveFilterBar>
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Filter latest receipts by #, customer…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-8 h-11"
                aria-label="Filter the latest receipts shown below"
              />
            </div>
          </ResponsiveFilterBar>
        )}

        {receipts.length === 0 ? (
          <EmptyState
            icon={ReceiptIcon}
            title="No receipts issued yet"
            description="Receipts you issue will appear here."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No matching receipts in the latest 50"
            description={`Nothing in the latest ${receipts.length} receipts matched "${query}". Older receipts aren't searched here - open Receipt Details directly if you have its receipt number, or narrow your collection period first.`}
          />
        ) : (
          <ScrollableTableContainer className="border-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Recon</TableHead>
                  {isAdmin && <TableHead>Agent</TableHead>}
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/receipts/${r.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {r.receiptNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{r.customerName}</TableCell>
                    <TableCell className="text-xs">
                      {r.billingPeriodSnapshot || "—"}
                    </TableCell>
                    <TableCell>{formatUGX(Number(r.amount))}</TableCell>
                    <TableCell>
                       <Badge variant="outline" className={`text-[10px] px-1.5 py-0 capitalize ${r.reconciliationStatus === 'matched' ? 'bg-green-50 text-green-600 border-green-200' : ''}`}>
                          {r.reconciliationStatus}
                       </Badge>
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <Badge variant="secondary">{r.agentName}</Badge>
                      </TableCell>
                    )}
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDateTime(r.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <VoidReceiptButton
                        receiptId={r.id}
                        isVoided={r.isVoided}
                        variant="small"
                        disabled={r.reconciliationStatus === 'matched'}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollableTableContainer>
        )}
      </CardContent>
    </Card>
  )
}
