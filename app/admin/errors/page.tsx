import { requireUser } from "@/lib/session"
import { canAudit } from "@/lib/permissions"
import { listSystemErrors } from "@/app/actions/system-errors"
import { PageHeader } from "@/components/ui/page-header"
import { ErrorQueue } from "@/app/admin/errors/error-queue"

export default async function SystemErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const current = await requireUser()
  if (!canAudit(current)) throw new Error("Forbidden")

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
