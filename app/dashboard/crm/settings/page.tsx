import { requireUser } from "@/lib/session"
import { canConfigureCrm } from "@/lib/permissions"
import { listCrmDepartments, listCrmComplaintCategories } from "@/app/actions/crm"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Plus, Settings2, Building2, Tag } from "lucide-react"
import { DepartmentDialog } from "@/components/crm/department-dialog"
import { CategoryDialog } from "@/components/crm/category-dialog"

export default async function CrmSettingsPage() {
  const user = await requireUser()
  if (!canConfigureCrm(user)) throw new Error("Forbidden")

  const [departments, categories] = await Promise.all([
    listCrmDepartments(),
    listCrmComplaintCategories()
  ])

  return (
    <div className="space-y-8">
      <PageHeader
        title="CRM Configuration"
        description="Configure departments and complaint categories for the ticketing system."
        backHref="/dashboard/crm"
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* DEPARTMENTS */}
        <Card className="shadow-md border-none">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Departments
              </CardTitle>
              <CardDescription>Teams responsible for handling complaints.</CardDescription>
            </div>
            <DepartmentDialog />
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-[10px] uppercase font-bold">Name</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold">Status</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-bold">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-bold text-xs uppercase text-slate-700">{d.name}</TableCell>
                      <TableCell>
                         <Badge variant={d.active ? "default" : "secondary"} className="text-[8px] uppercase h-4 px-1.5">
                            {d.active ? 'Active' : 'Inactive'}
                         </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                         <DepartmentDialog
                           department={d}
                           trigger={<Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold">Update</Button>}
                         />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* CATEGORIES */}
        <Card className="shadow-md border-none">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5 text-emerald-500" />
                Complaint Categories
              </CardTitle>
              <CardDescription>Types of issues customers can report.</CardDescription>
            </div>
            <CategoryDialog departments={departments} />
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-[10px] uppercase font-bold">Category Name</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold">Handler</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-bold">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-bold text-xs uppercase text-slate-700">{c.name}</TableCell>
                      <TableCell>
                         <div className="text-[10px] font-bold text-slate-500 truncate max-w-[120px]">
                           {departments.find(d => d.id === c.defaultHandlerDepartmentId)?.name || 'None'}
                         </div>
                      </TableCell>
                      <TableCell className="text-right">
                         <CategoryDialog
                           category={c}
                           departments={departments}
                           trigger={<Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold">Update</Button>}
                         />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
