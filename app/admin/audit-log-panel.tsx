import type { AuditLog } from "@/lib/db/schema"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateTime } from "@/lib/format"

export function AuditLogPanel({ logs }: { logs: AuditLog[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No activity recorded yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDateTime(log.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {log.userName || "system"}
                    {log.userEmail && (
                      <span className="text-muted-foreground"> ({log.userEmail})</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm font-mono">{log.action}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {log.entityType ? `${log.entityType}${log.entityId ? `:${log.entityId.slice(0, 8)}` : ""}` : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {log.ipAddress || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
