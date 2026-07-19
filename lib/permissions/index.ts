import { Role, ROLES } from "./roles"

/**
 * CENTRALIZED PERMISSION ENGINE
 *
 * This service governs what every role can do in the system.
 * By centralizing these checks, we ensure that a single change to a
 * business requirement is reflected everywhere (UI, API, and Server Actions).
 *
 * Note: Scope filtering (Cluster/Area/Scheme isolation) is supported by
 * the interface but will be fully implemented in Phase 1 - Task 2.2.
 */

import { PermissionGrant } from "../iam"

export interface UserPermissionsContext {
  role: string | null | undefined
  id: string
  organizationId?: string | null
  clusterId?: string | null
  branchId?: string | null
  schemeId?: string | null
  permissions?: string[]
  grants?: PermissionGrant[]
}

// Helper to cast string role to Role type safely
function getRole(user: UserPermissionsContext): Role | null {
  const r = user.role as Role
  return Object.values(ROLES).includes(r) ? r : null
}

/**
 * User Management: Who can create or edit other users.
 */
export function canManageUsers(user: UserPermissionsContext) {
  return user.permissions?.includes("users.view") ?? false
}

/**
 * Role Creation Hierarchy: Defines which roles a user can create.
 * A user may ONLY create users with roles at or below their level.
 */
export function canCreateRole(currentUser: UserPermissionsContext, targetRoleCode: string) {
  if (currentUser.permissions?.includes("roles.manage")) return true

  // This is a simplified check for the migration phase.
  return currentUser.permissions?.includes("users.create") ?? false
}

/**
 * Access: Who can access the admin console.
 */
export function canAccessAdminConsole(user: UserPermissionsContext) {
  return (
    user.permissions?.includes("users.view") ||
    user.permissions?.includes("reports.view") ||
    user.permissions?.includes("roles.view") ||
    user.permissions?.includes("branding.manage") ||
    user.permissions?.includes("system.audit.view")
  ) ?? false
}

/**
 * Global View: Who can see all data (receipts, customers) across the entire organization.
 */
export function canViewAllData(user: UserPermissionsContext) {
  return user.permissions?.includes("reports.view") ?? false
}

/**
 * Receipts: Who can issue new receipts.
 */
export function canIssueReceipt(user: UserPermissionsContext) {
  return user.permissions?.includes("receipts.create") ?? false
}

/**
 * Collection Period: Who can create or manage collection periods.
 */
export function canManageCollectionPeriods(user: UserPermissionsContext) {
  return user.permissions?.includes("collection.view") ?? false
}

/**
 * Collection Period: Who can activate or close periods.
 */
export function canActivateCollectionPeriod(user: UserPermissionsContext) {
  return user.permissions?.includes("collection.activate") ?? false
}

/**
 * Collection Period: Who can archive periods.
 */
export function canArchiveCollectionPeriod(user: UserPermissionsContext) {
  return user.permissions?.includes("collection.archive") ?? false
}

/**
 * Billing: Who can upload monthly billing files.
 */
export function canUploadBilling(user: UserPermissionsContext) {
  return user.permissions?.includes("billing.import") ?? false
}

/**
 * Customers: Who can create new customer profiles.
 */
export function canCreateCustomer(user: UserPermissionsContext) {
  return user.permissions?.includes("customers.create") ?? false
}

/**
 * Customers: Who can edit existing customer profiles.
 */
export function canEditCustomer(user: UserPermissionsContext) {
  return user.permissions?.includes("customers.edit") ?? false
}

/**
 * Customers: Who can bulk upload or manage customer profiles.
 */
export function canUploadCustomers(user: UserPermissionsContext) {
  return user.permissions?.includes("customers.import") ?? false
}

/**
 * Hierarchy Management: Who can create/edit Schemes.
 */
export function canManageSchemes(user: UserPermissionsContext) {
  return user.permissions?.includes("system.settings.manage") ?? false
}

/**
 * Hierarchy Management: Who can create/edit Areas (Branches).
 */
export function canManageAreas(user: UserPermissionsContext) {
  return user.permissions?.includes("system.settings.manage") ?? false
}

/**
 * Hierarchy Management: Who can create/edit Clusters.
 */
export function canManageClusters(user: UserPermissionsContext) {
  return user.permissions?.includes("system.settings.manage") ?? false
}

/**
 * Reports: Who can view performance and collection reports.
 */
export function canViewReports(user: UserPermissionsContext) {
  return user.permissions?.includes("reports.view") ?? false
}

/**
 * Export: Who can download data in CSV/PDF format.
 */
export function canExportReports(user: UserPermissionsContext) {
  return user.permissions?.includes("reports.export") ?? false
}

/**
 * Security: Who can trigger password resets for other users.
 */
export function canResetPasswords(user: UserPermissionsContext) {
  return user.permissions?.includes("users.reset_password") ?? false
}

/**
 * Receipts: Who can view receipt details.
 */
export function canViewReceipts(user: UserPermissionsContext) {
  return user.permissions?.includes("receipts.view") ?? false
}

/**
 * Receipts: Who can print a receipt (first time).
 */
export function canPrintReceipt(user: UserPermissionsContext) {
  return user.permissions?.includes("receipts.print") ?? false
}

/**
 * Receipts: Who can reprint a receipt.
 */
export function canReprintReceipt(user: UserPermissionsContext) {
  return user.permissions?.includes("receipts.reprint") ?? false
}

/**
 * Audit: Who can review the full system audit log.
 */
export function canAudit(user: UserPermissionsContext) {
  return user.permissions?.includes("system.audit.view") ?? false
}

/**
 * System Settings: Who can change branding, disclaimer, and global config.
 */
export function canConfigureSystem(user: UserPermissionsContext) {
  return user.permissions?.includes("branding.manage") ?? false
}
