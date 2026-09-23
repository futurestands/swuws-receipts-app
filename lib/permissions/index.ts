import { Role, ROLES } from "./roles"
import { PermissionGrant } from "../iam"

/**
 * CENTRALIZED PERMISSION ENGINE
 *
 * This service governs what every role can do in the system.
 * By centralizing these checks, we ensure that a single change to a
 * business requirement is reflected everywhere (UI, API, and Server Actions).
 */

export interface UserPermissionsContext {
  role: string | null | undefined
  id: string
  organizationId?: string | null
  clusterId?: string | null
  branchId?: string | null
  schemeId?: string | null
  iamRoleId?: string | null
  roleLevel?: number
  permissions?: Array<{ code: string; scope: string }> | string[]
  grants?: PermissionGrant[]
}

/**
 * Robust check for a permission code that handles both the legacy
 * string[] format and the new v1.2 object[] format.
 */
export function hasPerm(user: UserPermissionsContext, code: string): boolean {
  const perms = user.permissions
  if (!perms) return false

  for (const p of perms) {
    if (typeof p === "string") {
      if (p === code) return true
    } else if (p && typeof p === "object" && "code" in p) {
      if (p.code === code) return true
    }
  }
  return false
}

// Helper to cast string role to Role type safely
export function getRole(user: UserPermissionsContext): Role | null {
  const r = user.role as Role
  return Object.values(ROLES).includes(r) ? r : null
}

/**
 * User Management: Who can view the list of users and their profiles.
 */
export function canViewUsers(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "users.view") ||
    canManageUsers(user)
  ) ?? false
}

/**
 * User Management: Who can perform write operations (create, edit, disable).
 */
export function canManageUsers(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "users.edit") ||
    hasPerm(user, "users.create") ||
    hasPerm(user, "users.disable") ||
    hasPerm(user, "users.reset_password")
  ) ?? false
}

/**
 * User Management: Specific delete rights.
 * Note: Map to 'users.disable' as 'delete' is not supported for users to preserve audit logs.
 */
export function canDeleteUser(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "users.disable")
  ) ?? false
}

/**
 * User Management: Specific create rights.
 */
export function canCreateUser(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "users.create")
  ) ?? false
}

/**
 * User Management: Specific edit rights.
 */
export function canEditUser(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "users.edit")
  ) ?? false
}

/**
 * User Management: Specific disable rights.
 */
export function canDisableUser(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "users.disable")
  ) ?? false
}

/**
 * Access: Who can access the admin console.
 */
export function canAccessAdminConsole(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "users.view") ||
    hasPerm(user, "reports.view")
  ) ?? false
}

/**
 * Global View: Who can see all data (receipts, customers) across the entire organization.
 *
 * HARD-LOCKED: System Administrators always see everything. Regional users (with branch/cluster assignments)
 * are strictly restricted to their territory, even if they inherit global permissions.
 * Head Office tiers (Level 8+) without regional assignments see all data.
 */
export function canViewAllData(user: UserPermissionsContext) {
  // SYSTEM ADMIN is the only role that can override regional assignments.
  if (user.role === ROLES.SYSTEM_ADMIN) return true

  // If they are assigned to a specific region, they are usually restricted.
  // SENIORITY EXEMPTION (Aug 26 Hardening): Head Office staff (Level 8+) retain
  // global view even if assigned to a branch (e.g. for audit/support).
  const isSeniorStaff = (user.roleLevel ?? 0) >= 8
  if (!isSeniorStaff && (user.clusterId || user.branchId || user.schemeId)) return false

  if (isSeniorStaff) return true

  const perms = user.permissions
  if (!perms) return false

  // Specifically only allow 'global' viewing if they have core management permissions with global scope.
  const globalRequiredPerms = ["reports.view", "dashboard.view", "reconciliation.view", "system.audit.view"]

  for (const p of perms) {
    if (p && typeof p === "object" && "scope" in p && p.scope === "global") {
      if (globalRequiredPerms.includes(p.code)) return true
    }
  }
  return false
}

/**
 * Receipts: Who can issue new receipts.
 */
export function canIssueReceipt(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "receipts.create")
  ) ?? false
}

/**
 * Collection Period: Who can create or manage collection periods.
 */
export function canManageCollectionPeriods(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "collection.view")
  ) ?? false
}

/**
 * Collection Period: Who can activate or close periods.
 */
export function canActivateCollectionPeriod(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "collection.activate")
  ) ?? false
}

/**
 * Collection Period: Who can archive periods.
 */
export function canArchiveCollectionPeriod(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "collection.archive")
  ) ?? false
}

/**
 * Billing: Who can upload monthly billing files.
 */
export function canUploadBilling(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "billing.import")
  ) ?? false
}

/**
 * Billing: Specific delete rights for imported runs.
 */
export function canDeleteBilling(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "billing.delete")
  ) ?? false
}

/**
 * Customers: Who can create new customer profiles.
 */
export function canCreateCustomer(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "customers.create")
  ) ?? false
}

/**
 * Customers: Who can edit existing customer profiles.
 */
export function canEditCustomer(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "customers.edit")
  ) ?? false
}

/**
 * Customers: Who can bulk upload or manage customer profiles.
 */
export function canUploadCustomers(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "customers.import")
  ) ?? false
}

/**
 * Hierarchy Management: Who can create/edit Schemes.
 */
export function canManageSchemes(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "system.settings.manage")
  ) ?? false
}

/**
 * Hierarchy Management: Who can create/edit Areas (Branches).
 */
export function canManageAreas(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "system.settings.manage")
  ) ?? false
}

/**
 * Hierarchy Management: Who can create/edit Clusters.
 */
export function canManageClusters(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "system.settings.manage")
  ) ?? false
}

/**
 * Billing: Who can view historical billing runs.
 */
export function canViewBilling(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "billing.view")
  ) ?? false
}

/**
 * Meter Readings: Who can view field meter readings.
 */
export function canViewMeterReadings(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "meter_readings.view")
  ) ?? false
}

/**
 * Exceptions: Who can view billing calculation exceptions.
 */
export function canViewBillingExceptions(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "billing.exceptions.view")
  ) ?? false
}

/**
 * Control Center: Who can access the collection reconciliation Gauge/Stats.
 */
export function canViewControlCenter(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "reconciliation.view")
  ) ?? false
}

/**
 * Reports: Who can view performance and collection reports.
 */
export function canViewReports(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "reports.view") ||
    hasPerm(user, "dashboard.view")
  ) ?? false
}

/**
 * Reports: Who can access high-level Executive / Catalog reports.
 */
export function canViewExecutiveReports(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "reports.executive")
  ) ?? false
}

/**
 * Export: Who can download data in CSV/PDF format.
 */
export function canExportReports(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "reports.export")
  ) ?? false
}

/**
 * Security: Who can trigger password resets for other users.
 */
export function canResetPasswords(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "users.reset_password")
  ) ?? false
}

/**
 * Receipts: Who can view receipt details.
 */
export function canViewReceipts(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "receipts.view")
  ) ?? false
}

/**
 * Receipts: Who can print a receipt (first time).
 */
export function canPrintReceipt(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "receipts.print")
  ) ?? false
}

/**
 * Receipts: Who can reprint a receipt.
 */
export function canReprintReceipt(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "receipts.reprint")
  ) ?? false
}

/**
 * Audit: Who can review the full system audit log.
 * HARD-LOCKED: System Admin only (Legacy role or Level 10).
 */
export function canAudit(user: UserPermissionsContext) {
  return user.role === ROLES.SYSTEM_ADMIN || (user.roleLevel ?? 0) >= 10
}

/**
 * IAM: Who can manage Roles and Permissions.
 * HARD-LOCKED: System Admin only (Legacy role or Level 10).
 */
export function canManageIAM(user: UserPermissionsContext) {
  return user.role === ROLES.SYSTEM_ADMIN || (user.roleLevel ?? 0) >= 10
}

/**
 * System Settings: Who can change branding, disclaimer, and global config.
 * HARD-LOCKED: System Admin only (Legacy role or Level 10).
 */
export function canConfigureSystem(user: UserPermissionsContext) {
  return user.role === ROLES.SYSTEM_ADMIN || (user.roleLevel ?? 0) >= 10
}

/**
 * Tariffs: Who can manage billing rates.
 * HARD-LOCKED: System Admin only (Legacy role or Level 10).
 */
export function canManageTariffs(user: UserPermissionsContext) {
  return user.role === ROLES.SYSTEM_ADMIN || (user.roleLevel ?? 0) >= 10
}

/**
 * Intelligence: Who can view SWUWS Intelligence insights and dashboards.
 */
export function canViewIntelligence(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.role === ROLES.HEAD_COMMERCIAL ||
    user.role === ROLES.FINANCE_OFFICER ||
    user.role === ROLES.CLUSTER_MANAGER ||
    user.role === ROLES.COMMERCIAL_OFFICER ||
    (user.roleLevel ?? 0) >= 8 ||
    hasPerm(user, "intelligence.view") ||
    canViewReports(user)
  ) ?? false
}

/**
 * Intelligence: Who can investigate and assign intelligence findings.
 */
export function canInvestigateIntelligence(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.role === ROLES.HEAD_COMMERCIAL ||
    user.role === ROLES.CLUSTER_MANAGER ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "intelligence.investigate")
  ) ?? false
}

/**
 * Intelligence: Who can manage intelligence rules and anomaly thresholds.
 */
export function canManageIntelligenceRules(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "intelligence.manage_rules")
  ) ?? false
}

/**
 * Intelligence: Who can dismiss or resolve intelligence findings.
 */
export function canDismissIntelligence(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.role === ROLES.HEAD_COMMERCIAL ||
    user.role === ROLES.CLUSTER_MANAGER ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "intelligence.dismiss")
  ) ?? false
}

/**
 * Intelligence: Who can export intelligence reports.
 */
export function canExportIntelligence(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "intelligence.export") ||
    canExportReports(user)
  ) ?? false
}

/**
 * Templates: Who can manage SMS and Receipt templates.
 * HARD-LOCKED: System Admin only (Legacy role or Level 10).
 */
export function canManageTemplates(user: UserPermissionsContext) {
  return user.role === ROLES.SYSTEM_ADMIN || (user.roleLevel ?? 0) >= 10
}

/**
 * Maintenance: Who can toggle system maintenance mode.
 * HARD-LOCKED: System Admin only (Legacy role or Level 10).
 */
export function canManageMaintenance(user: UserPermissionsContext) {
  return user.role === ROLES.SYSTEM_ADMIN || (user.roleLevel ?? 0) >= 10
}

/**
 * CRM: Who can access the CRM module dashboard.
 */
export function canViewCrm(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "crm.view")
  ) ?? false
}

/**
 * CRM: Who can manage customer complaints.
 */
export function canManageComplaints(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "crm.complaints.manage")
  ) ?? false
}

/**
 * CRM: Who can assign complaints to others.
 */
export function canAssignComplaints(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "crm.complaints.assign")
  ) ?? false
}

/**
 * CRM: Who can build SMS contact lists and submit them for approval.
 * Ordinary CRM users get this. It does not let them send.
 */
export function canCreateSmsBatch(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    hasPerm(user, "crm.sms.create") ||
    hasPerm(user, "crm.sms.send") ||
    hasPerm(user, "crm.sms.approve")
  ) ?? false
}

/**
 * CRM: Who can approve a submitted SMS list and actually send it.
 * Not granted by job grade alone — CRM access is not enough.
 */
export function canApproveSms(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    hasPerm(user, "crm.sms.approve") ||
    hasPerm(user, "crm.sms.send")
  ) ?? false
}

/** @deprecated Use canApproveSms. Kept so older imports still compile. */
export function canSendBulkSms(user: UserPermissionsContext) {
  return canApproveSms(user)
}

/**
 * CRM: Who can configure CRM departments and categories.
 */
export function canConfigureCrm(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 10 ||
    hasPerm(user, "crm.settings.manage")
  ) ?? false
}
