import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { ReportGeneratorClient } from "./report-generator-client"

const TITLES: Record<string, string> = {
  "receipt-activity": "Receipt Activity Report",
  "daily-collection": "Daily Collection Summary",
  "recon-report": "Daily Reconciliation Report",
  "import-history": "Import History Report",
  "exception-register": "Exception Register",
  "approval-register": "Approval Register",
  "audit-activity": "Audit Activity Report",
}

export default async function ReportConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const title = TITLES[id]

  if (!title) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/reports/catalog" className="hover:bg-muted p-2 rounded-full transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground text-sm">Configure and generate official documentation.</p>
        </div>
      </div>

      <ReportGeneratorClient reportId={id} title={title} />
    </div>
  )
}
