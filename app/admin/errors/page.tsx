import { getCurrentUser } from "@/lib/session"
import { canAudit } from "@/lib/permissions"
import { listSystemErrors } from "@/app/actions/system-errors"
import { PageHeader } from "@/components/ui/page-header"
import { ErrorQueue } from "@/app/admin/errors/error-queue"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ShieldAlert } from "lucide-react"

export default async function SystemErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const current = await getCurrentUser()
  if (!current || !canAudit(current)) {
    return (
      <div className="space-y-6">
        <PageHeader title="System Errors" description="Error log access" backHref="/dashboard" />
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              <CardTitle className="text-base font-bold">Access Denied</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            You do not have permission to view or manage system error logs. Please contact your System Administrator.
          </CardContent>
        </Card>
      </div>
    )
  }

  const params = await searchParams
  const status = params.status || "open"
  const errors = await listSystemErrors(status)

  return (
    <div className="space-y-6">
      <PageHeader
        title="System errors"
        description="Crashes recorded from the portal. You are notified in the bell the first time a new fault appears — it does not send SMS."
        backHref="/admin"
      />
      <ErrorQueue errors={errors} status={status} />
    </div>
  )
}
