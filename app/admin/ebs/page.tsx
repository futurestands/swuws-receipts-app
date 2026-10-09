import { requireUser } from "@/lib/session"
import { canConfigureSystem } from "@/lib/permissions"
import { PageHeader } from "@/components/ui/page-header"
import { EbsConfigClient } from "./EbsConfigClient"
import { getSiteUrl } from "@/lib/site-url"

export default async function EbsSettingsPage() {
  const current = await requireUser()
  if (!canConfigureSystem(current)) {
    throw new Error("Access Denied: You do not have permission to configure system integrations.")
  }

  const siteUrl = await getSiteUrl()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pegasus EBS Integration"
        description="Configure hybrid connectivity with the Pegasus Enterprise Billing System. Default mode is manual (Excel/CSV)."
        backHref="/admin"
      />
      <EbsConfigClient siteUrl={siteUrl} />
    </div>
  )
}
