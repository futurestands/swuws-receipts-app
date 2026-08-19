import { requireUser } from "@/lib/session"
import { canViewCrm } from "@/lib/permissions"
import { listComplaints, listCrmDepartments, listCrmComplaintCategories } from "@/app/actions/crm"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"

export default async function ComplaintsPage() {
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  const [complaintData, departments, categories] = await Promise.all([
    listComplaints({ page: 1, limit: 25 }),
    listCrmDepartments(),
    listCrmComplaintCategories()
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Complaints Center"
        description="Capture and resolve customer technical and financial issues."
        actions={
          <Button className="h-11">
            <Plus className="mr-2 h-4 w-4" /> Register Complaint
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Recent Complaints</CardTitle>
          <CardDescription>A real-time list of customer feedback and service requests.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Ref #</TableHead>
                  <TableHead>Customer / Complainant</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {complaintData.complaints.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground italic">
                      No complaints found.
                    </TableCell>
                  </TableRow>
                ) : (
                  complaintData.complaints.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-[11px] font-bold">{c.complaintNumber}</TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{c.complainantName}</div>
                        <div className="text-[10px] text-muted-foreground">{c.complainantPhone}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] capitalize">{(c as any).categoryName || 'Unknown'}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            "text-[10px] uppercase",
                            c.status === 'open' ? 'bg-amber-100 text-amber-700 hover:bg-amber-100' :
                            c.status === 'resolved' ? 'bg-green-100 text-green-700 hover:bg-green-100' :
                            'bg-blue-100 text-blue-700 hover:bg-blue-100'
                          )}
                        >
                          {c.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="ghost" className="text-[10px] font-bold uppercase">
                          {c.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">{(c as any).departmentName || 'Not Assigned'}</div>
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
  )
}
