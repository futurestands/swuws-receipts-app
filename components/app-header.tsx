import Link from "next/link"
import { getCurrentUser } from "@/lib/session"
import { SignOutButton } from "@/components/sign-out-button"
import { NotificationCenter } from "./notifications/notification-center"

import { canAccessAdminConsole, canUploadBilling, canViewReports } from "@/lib/permissions"
import { ROLE_LABELS, type Role } from "@/lib/permissions/roles"

export async function AppHeader() {
  const current = await getCurrentUser()
  if (!current) return null

  return (
    <header className="border-b bg-card">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-semibold text-primary">
            SWUWS Collection Portal
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            <Link href="/dashboard/customers" className="text-muted-foreground hover:text-foreground">
              Customers
            </Link>
            {canViewReports(current) && (
              <Link href="/dashboard/reports" className="text-muted-foreground hover:text-foreground">
                Reports
              </Link>
            )}
            {canUploadBilling(current) && (
              <>
                <Link href="/dashboard/billing" className="text-muted-foreground hover:text-foreground">
                  Billing
                </Link>
                <Link href="/dashboard/billing/daily" className="text-muted-foreground hover:text-foreground">
                  Daily Collections
                </Link>
                <Link href="/dashboard/reconciliation/exceptions" className="text-muted-foreground hover:text-foreground">
                  Exceptions
                </Link>
                {canViewReports(current) && (
                  <>
                    <Link href="/dashboard/reconciliation/stats" className="text-muted-foreground hover:text-foreground">
                      Control Center
                    </Link>
                    <Link href="/dashboard/reports/catalog" className="text-muted-foreground hover:text-foreground">
                      Executive Reports
                    </Link>
                  </>
                )}
              </>
            )}
            {canAccessAdminConsole(current) && (
              <Link href="/admin" className="text-muted-foreground hover:text-foreground">
                Admin
              </Link>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <NotificationCenter />
          <span className="text-sm text-muted-foreground hidden sm:inline border-l pl-3">
            {current.name} · {ROLE_LABELS[current.role as Role] || current.role}
          </span>
          <SignOutButton />
        </div>
      </div>
    </header>
  )
}
