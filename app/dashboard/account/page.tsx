import { requireUser } from "@/lib/session"
import { AccountClient } from "./account-client"
import { PageHeader } from "@/components/ui/page-header"
import { getSettings } from "@/app/actions/settings"

export default async function AccountPage() {
  const [user, settings] = await Promise.all([
    requireUser(),
    getSettings(),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Account"
        description="Manage your profile settings and security."
      />
      <AccountClient user={user} settings={settings} />
    </div>
  )
}
