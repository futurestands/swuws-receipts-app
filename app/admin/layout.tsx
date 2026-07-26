import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/session"
import { AppShell } from "@/components/layout/app-shell"
import { getNavSections } from "@/lib/nav-config"
import { ROLE_LABELS, type Role } from "@/lib/permissions/roles"
import { canAccessAdminConsole } from "@/lib/permissions"

export const dynamic = "force-dynamic"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Re-syncing route tree
  const current = await getCurrentUser()
  if (!current) redirect("/login")
  if (!canAccessAdminConsole(current)) redirect("/dashboard")

  return (
    <AppShell
      sections={getNavSections(current)}
      userName={current.name}
      userRoleLabel={ROLE_LABELS[current.role as Role] || current.role}
    >
      {children}
    </AppShell>
  )
}
