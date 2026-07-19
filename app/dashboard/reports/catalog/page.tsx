import { requireUser } from "@/lib/session"
import { canViewReports } from "@/lib/permissions"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  FileText,
  BarChart3,
  ShieldAlert,
  CheckSquare,
  History,
  Activity,
  FileDown,
  Printer
} from "lucide-react"
import Link from "next/link"

const REPORT_CATEGORIES = [
  {
    name: "Operations",
    icon: Activity,
    reports: [
      { id: "receipt-activity", title: "Receipt Activity Report", description: "Detailed log of all receipts issued, including collector and reconciliation status." },
      { id: "daily-collection", title: "Daily Collection Summary", description: "Summary of receipts vs confirmed EBS collections for a specific business date." }
    ]
  },
  {
    name: "Reconciliation",
    icon: CheckSquare,
    reports: [
      { id: "recon-report", title: "Daily Reconciliation Report", description: "Technical breakdown of matching results, confidence scores, and processing duration." },
      { id: "import-history", title: "Import History Report", description: "Audit log of all external billing report uploads and their processing status." }
    ]
  },
  {
    name: "Governance",
    icon: ShieldAlert,
    reports: [
      { id: "exception-register", title: "Exception Register", description: "Case-by-case log of all reconciliation mismatches, investigation notes, and resolutions." },
      { id: "approval-register", title: "Approval Register", description: "Formal history of batch sign-offs, re-openings, and management audit comments." }
    ]
  },
  {
    name: "Audit",
    icon: History,
    reports: [
      { id: "audit-activity", title: "Audit Activity Report", description: "Immutable record of system activity, user logins, and data modifications." }
    ]
  }
]

export default async function ReportCatalogPage() {
  const current = await requireUser()
  if (!canViewReports(current)) throw new Error("Forbidden")

  return (
    <div className="space-y-8 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Executive Reporting</h1>
        <p className="text-muted-foreground text-sm max-w-2xl">
          Generate standardized operational and financial reports for management reviews,
          internal audits, and ministry reporting requirements.
        </p>
      </div>

      <div className="grid gap-8">
        {REPORT_CATEGORIES.map((cat) => (
          <section key={cat.name} className="space-y-4">
             <div className="flex items-center gap-2 border-b pb-2">
                <cat.icon className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold">{cat.name}</h2>
             </div>
             <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {cat.reports.map((report) => (
                  <Card key={report.id} className="group hover:border-primary/50 transition-colors">
                    <CardHeader className="pb-2">
                       <CardTitle className="text-sm font-bold group-hover:text-primary transition-colors">
                          {report.title}
                       </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                       <p className="text-xs text-muted-foreground leading-relaxed">
                          {report.description}
                       </p>
                       <div className="flex items-center gap-2 pt-2">
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0">PDF</Badge>
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0">EXCEL</Badge>
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0">HTML</Badge>
                       </div>
                    </CardContent>
                    <div className="p-4 border-t bg-muted/10 flex justify-end">
                       <Link
                         href={`/dashboard/reports/catalog/${report.id}`}
                         className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
                       >
                         Configure & Generate <FileDown className="h-3 w-3" />
                       </Link>
                    </div>
                  </Card>
                ))}
             </div>
          </section>
        ))}
      </div>

      <Card className="bg-primary/5 border-primary/20">
         <CardContent className="p-6 flex items-center gap-4">
            <div className="bg-primary/10 p-3 rounded-full">
               <Printer className="h-6 w-6 text-primary" />
            </div>
            <div>
               <h3 className="font-bold">Need a custom audit pack?</h3>
               <p className="text-sm text-muted-foreground">Select multiple reports to bundle them into a single PDF document for external auditors.</p>
            </div>
            <Badge variant="secondary" className="ml-auto">BETA</Badge>
         </CardContent>
      </Card>
    </div>
  )
}
