import type { IconName } from "@/components/layout/icons"
import { canAccessAdminConsole, canIssueReceipt, canUploadBilling, canViewReports } from "@/lib/permissions"
import type { UserPermissionsContext } from "@/lib/permissions"

export type NavItem = {
  href: string
  label: string
  icon: IconName
  /** Also match this prefix as "active" (for nested detail routes). */
  activeMatch?: string
}

export type NavSection = {
  label?: string
  items: NavItem[]
}

/**
 * Computes the nav sections visible to a given user. Reuses the exact same
 * permission checks the previous single-row header used - no new
 * authorization logic, just restructured as data.
 */
export function getNavSections(current: UserPermissionsContext): NavSection[] {
  const primary: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { href: "/dashboard/account", label: "My Account", icon: "User" },
  ]

  if (canIssueReceipt(current)) {
    primary.push({ href: "/dashboard/offline", label: "Offline Search", icon: "WifiOff" })
  }

  // customers/page.tsx calls searchCustomers(), which requires reports.view -
  // this must match exactly, or a user without that permission would see a
  // menu item that leads straight to an authorization failure.
  if (canViewReports(current)) {
    primary.push({ href: "/dashboard/customers", label: "Customers", icon: "Users" })
    primary.push({ href: "/dashboard/reports", label: "Reports", icon: "BarChart3", activeMatch: "/dashboard/reports" })
  }

  const sections: NavSection[] = [{ items: primary }]

  if (canUploadBilling(current)) {
    const billing: NavItem[] = [
      { href: "/dashboard/billing", label: "Billing", icon: "Wallet", activeMatch: "/dashboard/billing" },
      { href: "/dashboard/billing/readings", label: "Meter Readings", icon: "Calculator", activeMatch: "/dashboard/billing/readings" },
      { href: "/dashboard/billing/daily", label: "Daily Collections", icon: "ListChecks", activeMatch: "/dashboard/billing/daily" },
      { href: "/dashboard/billing/exceptions", label: "Billing Exceptions", icon: "AlertCircle", activeMatch: "/dashboard/billing/exceptions" },
      { href: "/dashboard/reconciliation/exceptions", label: "Recon Exceptions", icon: "AlertTriangle", activeMatch: "/dashboard/reconciliation/exceptions" },
    ]

    if (canViewReports(current)) {
      billing.push(
        { href: "/dashboard/reconciliation/stats", label: "Control Center", icon: "Gauge", activeMatch: "/dashboard/reconciliation" },
        { href: "/dashboard/reports/catalog", label: "Executive Reports", icon: "FileBarChart", activeMatch: "/dashboard/reports/catalog" }
      )
    }

    sections.push({ label: "Finance", items: billing })
  }

  if (canAccessAdminConsole(current)) {
    sections.push({
      label: "System",
      items: [{ href: "/admin", label: "Admin", icon: "ShieldCheck", activeMatch: "/admin" }],
    })
  }

  return sections
}

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  const matchPath = item.activeMatch ?? item.href
  if (matchPath === "/dashboard") return pathname === "/dashboard"
  return pathname === matchPath || pathname.startsWith(matchPath + "/")
}
