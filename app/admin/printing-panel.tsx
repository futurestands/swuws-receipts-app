"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Printer } from "lucide-react"

export type PrintingStats = {
  mostReprinted: { id: string; receiptNumber: string; customerName: string; printCount: number }[]
  byUser: { userId: string; userName: string; count: number }[]
  byBranch: { branchId: string | null; branchName: string | null; count: number }[]
  byScheme: { schemeId: string | null; schemeName: string | null; count: number }[]
  dailySummary: { date: string; count: number }[]
  recentPrints: {
    id: string
    receiptNumber: string
    customerName: string
    printedByName: string
    isReprint: boolean
    printNumber: number
    printedAt: Date
    ipAddress: string | null
  }[]
}

export function PrintingPanel({ stats }: { stats: PrintingStats }) {
  return (
    <div className="space-y-6">
      <div className="flex justify-end no-print">
        <Button onClick={() => window.print()} variant="outline" size="sm">
          <Printer className="mr-2 h-4 w-4" /> Print Reports
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Most Reprinted Receipts</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Prints</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.mostReprinted.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.receiptNumber}</TableCell>
                    <TableCell className="text-xs truncate max-w-[120px]">{r.customerName}</TableCell>
                    <TableCell className="text-right font-medium">{r.printCount}</TableCell>
                  </TableRow>
                ))}
                {stats.mostReprinted.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-4">No reprints recorded</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Print Activity by User</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="text-right">Total Prints</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.byUser.map((u) => (
                  <TableRow key={u.userId}>
                    <TableCell className="text-xs">{u.userName}</TableCell>
                    <TableCell className="text-right font-medium">{u.count}</TableCell>
                  </TableRow>
                ))}
                {stats.byUser.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground py-4">No activity recorded</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Print Activity by Branch</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Total Prints</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.byBranch.map((b, i) => (
                  <TableRow key={b.branchId || i}>
                    <TableCell className="text-xs">{b.branchName || "Unknown"}</TableCell>
                    <TableCell className="text-right font-medium">{b.count}</TableCell>
                  </TableRow>
                ))}
                {stats.byBranch.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground py-4">No activity recorded</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Print Activity by Scheme</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scheme</TableHead>
                  <TableHead className="text-right">Total Prints</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.byScheme.map((s, i) => (
                  <TableRow key={s.schemeId || i}>
                    <TableCell className="text-xs">{s.schemeName || "Unknown"}</TableCell>
                    <TableCell className="text-right font-medium">{s.count}</TableCell>
                  </TableRow>
                ))}
                {stats.byScheme.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground py-4">No activity recorded</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Daily Printing Summary (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total Prints</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.dailySummary.map((d) => (
                  <TableRow key={d.date}>
                    <TableCell className="text-xs">{d.date}</TableCell>
                    <TableCell className="text-right font-medium">{d.count}</TableCell>
                  </TableRow>
                ))}
                {stats.dailySummary.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground py-4">No activity recorded</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Receipt Print History (Recent 100)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>IP Address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.recentPrints.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.receiptNumber}</TableCell>
                  <TableCell className="text-xs truncate max-w-[150px]">{p.customerName}</TableCell>
                  <TableCell className="text-xs">{p.printedByName}</TableCell>
                  <TableCell className="text-xs">
                    {p.isReprint ? `Reprint #${p.printNumber}` : "Original"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {new Date(p.printedAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-[10px]">{p.ipAddress}</TableCell>
                </TableRow>
              ))}
              {stats.recentPrints.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-4">
                    No print history recorded
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
