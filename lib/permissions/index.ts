import { Role, ROLES, ROLE_RANK } from "./roles"
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
  permissions?: string[]
  grants?: PermissionGrant[]
}

// Helper to cast string role to Role type safely
export function getRole(user: UserPermissionsContext): Role | null {
  const r = user.role as Role
  return Object.values(ROLES).includes(r) ? r : null
}

/**
 * User Management: Who can create or edit other users.
 */
export function canManageUsers(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.permissions?.includes("users.view")
  ) ?? false
}

/**
 * User Management: Specific delete rights.
 */
export function canDeleteUser(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.permissions?.includes("users.delete")
  ) ?? false
}

/**
 * User Management: Specific edit rights.
 */
export function canEditUser(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.permissions?.includes("users.edit")
  ) ?? false
}

/**
 * Access: Who can access the admin console.
 */
export function canAccessAdminConsole(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.permissions?.includes("users.view") ||
    user.permissions?.includes("reports.view")
  ) ?? false
}

/**
 * Global View: Who can see all data (receipts, customers) across the entire organization.
 */
export function canViewAllData(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    (user.roleLevel ?? 0) >= 8 // Senior management / Head Office tier
  ) ?? false
}

/**
 * Receipts: Who can issue new receipts.
 */
export function canIssueReceipt(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.permissions?.includes("receipts.create")
  ) ?? false
}

/**
 * Collection Period: Who can create or manage collection periods.
 */
export function canManageCollectionPeriods(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.permissions?.includes("collection.view")
  ) ?? false
}

/**
 * Collection Period: Who can activate or close periods.
 */
export function canActivateCollectionPeriod(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.permissions?.includes("collection.activate")
  ) ?? false
}

/**
 * Collection Period: Who can archive periods.
 */
export function canArchiveCollectionPeriod(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.permissions?.includes("collection.archive")
  ) ?? false
}

/**
 * Billing: Who can upload monthly billing files.
 */
export function canUploadBilling(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.permissions?.includes("billing.import")
  ) ?? false
}

/**
 * Billing: Specific delete rights for imported runs.
 */
export function canDeleteBilling(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.permissions?.includes("billing.delete")
  ) ?? false
}

/**
 * Customers: Who can create new customer profiles.
 */
export function canCreateCustomer(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.permissions?.includes("customers.create")
  ) ?? false
}

/**
 * Customers: Who can edit existing customer profiles.
 */
export function canEditCustomer(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.permissions?.includes("customers.edit")
  ) ?? false
}

/**
 * Customers: Who can bulk upload or manage customer profiles.
 */
export function canUploadCustomers(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.permissions?.includes("customers.import")
  ) ?? false
}

/**
 * Hierarchy Management: Who can create/edit Schemes.
 */
export function canManageSchemes(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.permissions?.includes("system.settings.manage")
  ) ?? false
}

/**
 * Hierarchy Management: Who can create/edit Areas (Branches).
 */
export function canManageAreas(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.permissions?.includes("system.settings.manage")
  ) ?? false
}

/**
 * Hierarchy Management: Who can create/edit Clusters.
 */
export function canManageClusters(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.permissions?.includes("system.settings.manage")
  ) ?? false
}

/**
 * Control Center: Who can access the collection reconciliation Gauge/Stats.
 */
export function canViewControlCenter(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.permissions?.includes("reconciliation.view")
  ) ?? false
}

/**
 * Reports: Who can view performance and collection reports.
 */
export function canViewReports(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.permissions?.includes("reports.view") ||
    user.permissions?.includes("dashboard.view")
  ) ?? false
}

/**
 * Reports: Who can access high-level Executive / Catalog reports.
 */
export function canViewExecutiveReports(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.permissions?.includes("reports.executive")
  ) ?? false
}

/**
 * Export: Who can download data in CSV/PDF format.
 */
export function canExportReports(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.permissions?.includes("reports.export")
  ) ?? false
}

/**
 * Security: Who can trigger password resets for other users.
 * HARD-LOCKED: System Admin only (Legacy role or Level 10).
 */
export function canResetPasswords(user: UserPermissionsContext) {
  return user.role === ROLES.SYSTEM_ADMIN || (user.roleLevel ?? 0) >= 10
}

/**
 * Receipts: Who can view receipt details.
 */
export function canViewReceipts(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.permissions?.includes("receipts.view")
  ) ?? false
}

/**
 * Receipts: Who can print a receipt (first time).
 */
export function canPrintReceipt(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.permissions?.includes("receipts.print")
  ) ?? false
}

/**
 * Receipts: Who can reprint a receipt.
 */
export function canReprintReceipt(user: UserPermissionsContext) {
  return (
    user.role === ROLES.SYSTEM_ADMIN ||
    user.permissions?.includes("receipts.reprint")
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
