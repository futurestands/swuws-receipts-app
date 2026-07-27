import { requireUser } from "@/lib/session"
import { AccountClient } from "./account-client"
import { PageHeader } from "@/components/ui/page-header"

export default async function AccountPage() {
  const user = await requireUser()

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Account"
        description="Manage your profile settings and security."
      />
      <AccountClient user={user} />
    </div>
  )
}
