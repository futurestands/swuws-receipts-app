import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/session"
import { AppShell } from "@/components/layout/app-shell"
import { getNavSections } from "@/lib/nav-config"
import { ROLE_LABELS, type Role, ROLES } from "@/lib/permissions/roles"
import { getSettings } from "@/app/actions/settings"

export const dynamic = "force-dynamic"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [current, settings] = await Promise.all([
    getCurrentUser(),
    getSettings()
  ])

  if (!current) redirect("/login")

  // SECURITY: Maintenance Mode enforcement
  if (settings.maintenanceMode && current.role !== ROLES.SYSTEM_ADMIN) {
    redirect("/maintenance")
  }

  return (
    <AppShell
      sections={getNavSections(current)}
      userName={current.name}
      userRoleLabel={ROLE_LABELS[current.role as Role] || current.role}
      developerCredit={settings.developerCredit}
      orgName={settings.orgName}
      logoUrl={settings.logoUrl}
      receiptPrefix={settings.receiptPrefix}
      agentId={current.id}
    >
      {children}
    </AppShell>
  )
}
