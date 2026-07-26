import { eq, and, or, sql, inArray } from "drizzle-orm"
import { ROLES } from "../permissions/roles"
import { UserPermissionsContext, canViewAllData } from "../permissions"
import { receipt, customer, branch, waterScheme, billingPeriod, billingRun, billingRecord, user as userTable } from "../db/schema"
import { Scope } from "../iam"
import { db } from "../db"

/**
 * CENTRALIZED ORGANIZATIONAL SCOPE ENGINE
 *
 * Governs data isolation by generating scope-aware filters for Drizzle queries.
 * Derived dynamically from IAM permission scopes.
 */

function getScope(user: UserPermissionsContext, permissionCode: string): Scope | null {
  const grant = user.grants?.find(g => g.code === permissionCode)
  return (grant?.scope as Scope) || null
}

/**
 * Applies organizational scope to User (Agent) queries.
 */
export function applyUserScope(user: UserPermissionsContext) {
  const scope = getScope(user, "users.view")
  if (!scope) return sql`1 = 0`

  if (scope === "global") return undefined

  if (scope === "cluster" && user.clusterId) {
    return eq(userTable.clusterId, user.clusterId)
  }

  if (scope === "area" && user.branchId) {
    return eq(userTable.branchId, user.branchId)
  }

  if (scope === "scheme" && user.schemeId) {
    return eq(userTable.schemeId, user.schemeId)
  }

  // Fallback: Agents usually can't 'see' other users in 'own' scope unless
  // they are looking at themselves.
  return eq(userTable.id, user.id)
}

/**
 * Applies organizational scope to Receipt queries.
 */
export function applyReceiptScope(user: UserPermissionsContext) {
  const scope = getScope(user, "receipts.view")
  if (!scope) return sql`1 = 0` // Deny if no permission

  if (scope === "global") return undefined

  if (scope === "cluster" && user.clusterId) {
    return inArray(
      receipt.branchId,
      sql`(SELECT id FROM branch WHERE "clusterId" = ${user.clusterId})`
    )
  }

  if (scope === "area" && user.branchId) {
    return eq(receipt.branchId, user.branchId)
  }

  if (scope === "scheme" && user.schemeId) {
    return eq(receipt.schemeId, user.schemeId)
  }

  // Fallback: Default to 'own' isolation for safety.
  return eq(receipt.agentId, user.id)
}

/**
 * Applies organizational scope to Customer queries.
 */
export function applyCustomerScope(user: UserPermissionsContext) {
  const scope = getScope(user, "customers.view")
  if (!scope) return sql`1 = 0`

  if (scope === "global") return undefined

  if (scope === "cluster" && user.clusterId) {
    return inArray(
      customer.waterSchemeId,
      sql`(SELECT ws.id FROM water_scheme ws JOIN branch b ON ws."branchId" = b.id WHERE b."clusterId" = ${user.clusterId})`
    )
  }

  if (scope === "area" && user.branchId) {
    return inArray(
      customer.waterSchemeId,
      sql`(SELECT id FROM water_scheme WHERE "branchId" = ${user.branchId})`
    )
  }

  if (scope === "scheme" && user.schemeId) {
    return eq(customer.waterSchemeId, user.schemeId)
  }

  // Customers usually aren't 'owned' by individual agents in a meaningful way for list view,
  // but if scope is 'own', we might show customers the user created.
  return eq(customer.createdById, user.id)
}

/**
 * Applies organizational scope to Billing queries.
 */
export function applyBillingScope(user: UserPermissionsContext) {
  const scope = getScope(user, "billing.history.view")
  if (!scope) return sql`1 = 0`

  if (scope === "global") return undefined

  if (scope === "cluster" && user.clusterId) {
    return inArray(
      billingRun.schemeId,
      sql`(SELECT ws.id FROM water_scheme ws JOIN branch b ON ws."branchId" = b.id WHERE b."clusterId" = ${user.clusterId})`
    )
  }

  if (scope === "area" && user.branchId) {
    return inArray(
      billingRun.schemeId,
      sql`(SELECT id FROM water_scheme WHERE "branchId" = ${user.branchId})`
    )
  }

  return sql`1 = 0`
}

/**
 * Validates if a user has write access to a specific scope level.
 * Used during creation/updates.
 */
export async function validateWriteScope(user: UserPermissionsContext, permissionCode: string, target: {
  branchId?: string | null
  schemeId?: string | null
}) {
  // Identify which permission is being exercised.
  const scope = getScope(user, permissionCode)
  if (!scope) return false

  if (scope === "global") return true

  if (scope === "cluster") {
    if (!user.clusterId) return false

    // Resolve the target's branch: either given directly, or via its scheme.
    let targetBranchId = target.branchId ?? null
    if (!targetBranchId && target.schemeId) {
      const [ws] = await db
        .select({ branchId: waterScheme.branchId })
        .from(waterScheme)
        .where(eq(waterScheme.id, target.schemeId))
        .limit(1)
      targetBranchId = ws?.branchId ?? null
    }

    // No target branch/scheme to check against - nothing to validate, matches
    // the existing area/scheme behavior below when no target is given.
    if (!targetBranchId) return true

    const [targetBranch] = await db
      .select({ clusterId: branch.clusterId })
      .from(branch)
      .where(eq(branch.id, targetBranchId))
      .limit(1)

    return !!targetBranch && targetBranch.clusterId === user.clusterId
  }

  if (scope === "area") {
    if (!user.branchId) return false
    if (target.branchId && user.branchId !== target.branchId) return false
    return true
  }

  if (scope === "scheme") {
    if (!user.schemeId) return false
    if (target.schemeId && user.schemeId !== target.schemeId) return false
    return true
  }

  return true // 'own' scope always allowed for write (filtered by logic)
}
