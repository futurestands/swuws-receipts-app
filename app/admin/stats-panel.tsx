import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatUGX } from "@/lib/format"

export function StatsPanel({
  stats,
  collections,
}: {
  stats: { agentCount: number; receiptCount: number; receiptTotal: number }
  collections: {
    perAgent: { agentId: string; agentName: string; count: number; total: number }[]
    totalCount: number
    totalAmount: number
  }
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Agents</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.agentCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total receipts issued
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.receiptCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total collected (all time)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatUGX(stats.receiptTotal)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s collections by agent</CardTitle>
        </CardHeader>
        <CardContent>
          {collections.perAgent.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No receipts today yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Receipts</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {collections.perAgent.map((row) => (
                  <TableRow key={row.agentId}>
                    <TableCell>{row.agentName}</TableCell>
                    <TableCell>{row.count}</TableCell>
                    <TableCell>{formatUGX(row.total)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-medium">Total</TableCell>
                  <TableCell className="font-medium">{collections.totalCount}</TableCell>
                  <TableCell className="font-medium">{formatUGX(collections.totalAmount)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
