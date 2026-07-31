import { Role, ROLES, ROLE_RANK } from "./roles"

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
 * A user may ONLY create or promote another user to a role at or below
 * their own rank (see ROLE_RANK in ./roles).
 *
 * SECURITY: previously this function accepted `targetRoleCode` but never
 * actually checked it — any user with the `users.create` permission could
 * assign ANY role, including System Administrator, to a new or existing
 * user. That's a real privilege-escalation path: the legacy `role` field
 * this assigns is also read directly (bypassing the IAM permission system
 * entirely) by billing-engine.ts's meter-reading cancellation check and by
 * approval.ts's approver lookup, so setting role: "admin" via a low-bar
 * permission like `users.create` had real financial-authorization impact,
 * not just a cosmetic label.
 */
export function canCreateRole(currentUser: UserPermissionsContext, targetRoleCode: string) {
  const hasCreatePermission =
    currentUser.permissions?.includes("roles.manage") ||
    currentUser.permissions?.includes("users.create")
  if (!hasCreatePermission) return false

  const targetRank = ROLE_RANK[targetRoleCode as Role]
  if (targetRank === undefined) return false // unrecognized role — reject rather than assume safe

  const currentRole = getRole(currentUser)
  const currentRank = currentRole ? ROLE_RANK[currentRole] : 0

  return targetRank <= currentRank
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
