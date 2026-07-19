"use client"

import Link from "next/link"
import type { Receipt } from "@/lib/db/schema"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatUGX, formatDateTime } from "@/lib/format"

export function ReceiptsTable({ receipts, isAdmin }: { receipts: Receipt[]; isAdmin: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent receipts</CardTitle>
      </CardHeader>
      <CardContent>
        {receipts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No receipts issued yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((r) => (
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
                    <TableCell>{formatUGX(r.amount)}</TableCell>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
