import type { IconName } from "@/components/layout/icons"
import {
  canAccessAdminConsole,
  canIssueReceipt,
  canUploadBilling,
  canViewReports,
  canViewControlCenter,
  canViewExecutiveReports,
  canViewCrm,
  canViewBilling,
  canViewMeterReadings,
  canViewBillingExceptions,
  hasPerm
} from "@/lib/permissions"
import type { UserPermissionsContext } from "@/lib/permissions"
import { ROLES } from "@/lib/permissions/roles"

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
    primary.push({ href: "/dashboard/settings/printer", label: "Printer Settings", icon: "Printer" })
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
    const finance: NavItem[] = []

    if (canViewBilling(current) || hasPerm(current, "billing.import")) {
       finance.push({ href: "/dashboard/billing", label: "Billing", icon: "Wallet", activeMatch: "/dashboard/billing" })
    }

    if (canViewMeterReadings(current)) {
       finance.push({ href: "/dashboard/billing/readings", label: "Meter Readings", icon: "Calculator", activeMatch: "/dashboard/billing/readings" })
    }

    if (canViewReports(current)) {
       finance.push({ href: "/dashboard/billing/daily", label: "Daily Collections", icon: "ListChecks", activeMatch: "/dashboard/billing/daily" })
    }

    if (canViewBillingExceptions(current)) {
       finance.push({ href: "/dashboard/billing/exceptions", label: "Billing Exceptions", icon: "AlertCircle", activeMatch: "/dashboard/billing/exceptions" })
    }

    if (canViewControlCenter(current)) {
       finance.push({ href: "/dashboard/reconciliation/exceptions", label: "Recon Exceptions", icon: "AlertTriangle", activeMatch: "/dashboard/reconciliation/exceptions" })
       finance.push({ href: "/dashboard/reconciliation/stats", label: "Control Center", icon: "Gauge", activeMatch: "/dashboard/reconciliation" })
    }

    if (canViewExecutiveReports(current)) {
      finance.push({ href: "/dashboard/reports/catalog", label: "Executive Reports", icon: "FileBarChart", activeMatch: "/dashboard/reports/catalog" })
    }

    if (finance.length > 0) {
      sections.push({ label: "Finance", items: finance })
    }
  }

  if (canViewCrm(current)) {
    const crmItems: NavItem[] = [
      { href: "/dashboard/crm", label: "CRM Hub", icon: "Users", activeMatch: "/dashboard/crm" },
    ]
    sections.push({ label: "Customer Relationship", items: crmItems })
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
