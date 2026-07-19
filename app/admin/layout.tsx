import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/session"
import { AppHeader } from "@/components/app-header"
import { canAccessAdminConsole } from "@/lib/permissions"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Re-syncing route tree
  const current = await getCurrentUser()
  if (!current) redirect("/login")
  if (!canAccessAdminConsole(current)) redirect("/dashboard")

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}
