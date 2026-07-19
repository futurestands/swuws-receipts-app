import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/session"
import { AppHeader } from "@/components/app-header"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser()
  if (!current) redirect("/login")

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}
