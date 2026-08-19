import { requireUser } from "@/lib/session"
import { canViewCrm } from "@/lib/permissions"
import { listSmsBatches } from "@/app/actions/crm"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatDateTime } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Send, Smartphone } from "lucide-react"

export default async function SmsHubPage() {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  const batches = await listSmsBatches()

  return (
    <div className="space-y-6">
      <PageHeader
        title="SMS Hub"
        description="Bulk communication engine for bill reminders and alerts."
        actions={
          <Button className="h-11 bg-emerald-600 hover:bg-emerald-700">
            <Send className="mr-2 h-4 w-4" /> Create Contact List
          </Button>
        }
      />

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm">Messaging Power</CardTitle>
            <CardDescription>Status of your communication infrastructure.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="p-4 bg-muted/50 rounded-xl space-y-1">
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Gateway Status</p>
                <div className="flex items-center gap-2">
                   <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                   <span className="font-bold text-sm">CONNECTED (EBS SYNC)</span>
                </div>
             </div>
             <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl space-y-1">
                <p className="text-[10px] uppercase font-bold text-primary">SMS Balance</p>
                <p className="text-xl font-black">Unlimited (Internal)</p>
             </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>SMS Batch History</CardTitle>
            <CardDescription>Track the delivery status of your recent mass communications.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Batch Name</TableHead>
                    <TableHead className="text-right">Sent</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground italic">
                        No SMS batches found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    batches.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="text-xs">{formatDateTime(b.createdAt)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] uppercase">{b.category}</Badge>
                        </TableCell>
                        <TableCell className="font-medium text-sm">{b.name}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{b.sentMessages}</TableCell>
                        <TableCell>
                           <Badge className="text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100 uppercase">
                             {b.status}
                           </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">Details</Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
