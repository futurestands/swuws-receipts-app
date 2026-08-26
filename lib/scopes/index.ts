import { eq, and, or, sql, inArray } from "drizzle-orm"
import { ROLES } from "../permissions/roles"
import { UserPermissionsContext, canViewAllData } from "../permissions"
import { receipt, customer, branch, waterScheme, billingPeriod, billingRun, billingRecord, meterReading, dailyCollectionRecord, crmSmsBatch, user as userTable } from "../db/schema"
import { Scope } from "../iam"
import { db } from "../db"

export type { UserPermissionsContext }

/**
 * CENTRALIZED ORGANIZATIONAL SCOPE ENGINE
 *
 * Governs data isolation by generating scope-aware filters for Drizzle queries.
 * Derived dynamically from IAM permission scopes.
 */

function getScope(user: UserPermissionsContext, permissionCode: string): Scope | null {
  const grant = user.permissions?.find((p: any) =>
    typeof p === "object" ? p.code === permissionCode : p === permissionCode
  )

  let scope: Scope | null = null

  if (typeof grant === "object" && grant !== null) {
    scope = (grant as any).scope as Scope
  } else if (typeof grant === "string") {
    // Legacy fallback
    const g = user.grants?.find(g => g.code === permissionCode)
    scope = (g?.scope as Scope) || null
  }

  // HIERARCHY OVERRIDE 1: Global Authority check
  // If the user passes the 'Global' check, set the initial scope to global.
  if (canViewAllData(user)) {
    scope = "global"
  }

  // HIERARCHY OVERRIDE 2: Force-cap scope based on assigned hierarchy level
  // This ensures an Area Manager can never accidentally see "Global" data
  // even if their permission was misconfigured in the DB or inherited from a parent role.
  if (scope === "global") {
     if (user.clusterId) scope = "cluster"
     else if (user.branchId) scope = "area"
     else if (user.schemeId) scope = "scheme"
  }

  return scope
}

/**
 * Applies organizational scope to User (Agent) queries.
 */
export function applyUserScope(user: UserPermissionsContext) {
  const scope = getScope(user, "users.view")
  if (!scope) return sql`1 = 0`

  if (scope === "global") return undefined

  if (scope === "cluster" && user.clusterId) {
    return or(
      eq(userTable.clusterId, user.clusterId),
      inArray(
        userTable.branchId,
        sql`(SELECT id FROM branch WHERE "clusterId" = ${user.clusterId})`
      )
    )
  }

  if (scope === "area" && user.branchId) {
    return or(
      eq(userTable.branchId, user.branchId),
      inArray(
        userTable.schemeId,
        sql`(SELECT id FROM water_scheme WHERE "branchId" = ${user.branchId})`
      )
    )
  }

  if (scope === "scheme" && user.schemeId) {
    return eq(userTable.schemeId, user.schemeId)
  }

  return eq(userTable.id, user.id)
}

/**
 * Applies organizational scope to Receipt queries.
 */
export function applyReceiptScope(user: UserPermissionsContext) {
  const scope = getScope(user, "receipts.view") || getScope(user, "dashboard.metrics.view")
  if (!scope) return sql`1 = 0`

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

  if (scope === "own") {
    if (user.branchId) return eq(receipt.branchId, user.branchId)
    if (user.schemeId) return eq(receipt.schemeId, user.schemeId)
    return eq(receipt.agentId, user.id)
  }

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
      sql`(SELECT id FROM water_scheme WHERE "branchId" IN (SELECT id FROM branch WHERE "clusterId" = ${user.clusterId}))`
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

  return eq(customer.createdById, user.id)
}

/**
 * Applies organizational scope to Billing queries.
 */
export function applyBillingScope(user: UserPermissionsContext) {
  const scope = getScope(user, "billing.history.view") || getScope(user, "reports.view")
  if (!scope) return sql`1 = 0`

  if (scope === "global") return undefined

  if (scope === "cluster" && user.clusterId) {
    return inArray(
      billingRun.schemeId,
      sql`(SELECT id FROM water_scheme WHERE "branchId" IN (SELECT id FROM branch WHERE "clusterId" = ${user.clusterId}))`
    )
  }

  if (scope === "area" && user.branchId) {
    return inArray(
      billingRun.schemeId,
      sql`(SELECT id FROM water_scheme WHERE "branchId" = ${user.branchId})`
    )
  }

  if (scope === "scheme" && user.schemeId) {
    return eq(billingRun.schemeId, user.schemeId)
  }

  return sql`1 = 0`
}

/**
 * Applies organizational scope to individual Billing Record queries.
 */
export function applyBillingRecordScope(user: UserPermissionsContext) {
  const scope = getScope(user, "reports.view") || getScope(user, "billing.view") || getScope(user, "dashboard.metrics.view")
  if (!scope) return sql`1 = 0`

  if (scope === "global") return undefined

  if (scope === "cluster" && user.clusterId) {
    return inArray(
      billingRecord.customerId,
      sql`(SELECT id FROM customer WHERE "waterSchemeId" IN (SELECT id FROM water_scheme WHERE "branchId" IN (SELECT id FROM branch WHERE "clusterId" = ${user.clusterId})))`
    )
  }

  if (scope === "area" && user.branchId) {
    return inArray(
      billingRecord.customerId,
      sql`(SELECT id FROM customer WHERE "waterSchemeId" IN (SELECT id FROM water_scheme WHERE "branchId" = ${user.branchId}))`
    )
  }

  if (scope === "scheme" && user.schemeId) {
    return inArray(
      billingRecord.customerId,
      sql`(SELECT id FROM customer WHERE "waterSchemeId" = ${user.schemeId})`
    )
  }

  // Fallback for 'own' scope: If they have dashboard metrics view, show them data for their hierarchy level anyway
  if (scope === "own") {
    if (user.branchId) return inArray(billingRecord.customerId, sql`(SELECT id FROM customer WHERE "waterSchemeId" IN (SELECT id FROM water_scheme WHERE "branchId" = ${user.branchId}))`)
    if (user.schemeId) return inArray(billingRecord.customerId, sql`(SELECT id FROM customer WHERE "waterSchemeId" = ${user.schemeId})`)
  }

  return sql`1 = 0`
}

/**
 * Applies organizational scope to Meter Reading queries.
 */
export function applyMeterReadingScope(user: UserPermissionsContext) {
  const scope = getScope(user, "reports.view") || getScope(user, "meter_readings.view") || getScope(user, "dashboard.metrics.view")
  if (!scope) return sql`1 = 0`

  if (scope === "global") return undefined

  if (scope === "cluster" && user.clusterId) {
     return inArray(
       meterReading.customerId,
       sql`(SELECT id FROM customer WHERE "waterSchemeId" IN (SELECT id FROM water_scheme WHERE "branchId" IN (SELECT id FROM branch WHERE "clusterId" = ${user.clusterId})))`
     )
  }

  if (scope === "area" && user.branchId) {
    return inArray(
      meterReading.customerId,
      sql`(SELECT id FROM customer WHERE "waterSchemeId" IN (SELECT id FROM water_scheme WHERE "branchId" = ${user.branchId}))`
    )
  }

  if (scope === "scheme" && user.schemeId) {
    return inArray(
      meterReading.customerId,
      sql`(SELECT id FROM customer WHERE "waterSchemeId" = ${user.schemeId})`
    )
  }

  if (scope === "own") {
    if (user.branchId) return inArray(meterReading.customerId, sql`(SELECT id FROM customer WHERE "waterSchemeId" IN (SELECT id FROM water_scheme WHERE "branchId" = ${user.branchId}))`)
    if (user.schemeId) return inArray(meterReading.customerId, sql`(SELECT id FROM customer WHERE "waterSchemeId" = ${user.schemeId})`)
    return eq(meterReading.recordedById, user.id)
  }

  return eq(meterReading.recordedById, user.id)
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

/**
 * Applies organizational scope to Reconciliation Exception queries.
 * Handles both receipt-based and EBS-based (orphan) exceptions.
 */
export function applyExceptionScope(user: UserPermissionsContext) {
  const scope = getScope(user, "reconciliation.exceptions.manage") || getScope(user, "reconciliation.view")
  if (!scope) return sql`1 = 0`

  if (scope === "global") return undefined

  // TRIPLE-FALLBACK SCOPING (Aug 26 Hardening):
  // Ensures branch managers can see exceptions even for orphan EBS payments
  // (where receiptId IS NULL) by checking the EBS record's branch metadata
  // or the branch of the staff member who performed the upload.
  const isOrphan = sql`reconciliation_exception."receiptId" IS NULL`

  if (scope === "cluster" && user.clusterId) {
    return or(
      inArray(receipt.branchId, sql`(SELECT id FROM branch WHERE "clusterId" = ${user.clusterId})`),
      inArray(dailyCollectionRecord.branchName, sql`(SELECT name FROM branch WHERE "clusterId" = ${user.clusterId})`),
      and(
        isOrphan,
        inArray(
          sql`(SELECT "branchId" FROM "user" WHERE id = (SELECT "uploadedById" FROM daily_collection_import WHERE id = ${dailyCollectionRecord.batchId}))`,
          sql`(SELECT id FROM branch WHERE "clusterId" = ${user.clusterId})`
        )
      )
    )
  }

  if (scope === "area" && user.branchId) {
    return or(
      eq(receipt.branchId, user.branchId),
      eq(dailyCollectionRecord.branchName, sql`(SELECT name FROM branch WHERE id = ${user.branchId})`),
      and(
        isOrphan,
        eq(
          sql`(SELECT "branchId" FROM "user" WHERE id = (SELECT "uploadedById" FROM daily_collection_import WHERE id = ${dailyCollectionRecord.batchId}))`,
          user.branchId
        )
      )
    )
  }

  if (scope === "scheme" && user.schemeId) {
    return or(
      eq(receipt.schemeId, user.schemeId),
      eq(dailyCollectionRecord.schemeName, sql`(SELECT name FROM water_scheme WHERE id = ${user.schemeId})`)
    )
  }

  return sql`1 = 0`
}

/**
 * Applies organizational scope to CRM SMS Batch queries.
 * Note: SMS batches are scoped by the creator's assigned territory.
 */
export function applySmsBatchScope(user: UserPermissionsContext) {
  const scope = getScope(user, "crm.view")
  if (!scope) return sql`1 = 0`

  if (scope === "global") return undefined

  // Join with userTable to find batches created by people in the same territory
  const creatorSubquery = db
    .select({ id: userTable.id })
    .from(userTable)

  if (scope === "cluster" && user.clusterId) {
    creatorSubquery.where(eq(userTable.clusterId, user.clusterId))
  } else if (scope === "area" && user.branchId) {
    creatorSubquery.where(eq(userTable.branchId, user.branchId))
  } else if (scope === "scheme" && user.schemeId) {
    creatorSubquery.where(eq(userTable.schemeId, user.schemeId))
  } else {
    // 'own' scope
    return eq(crmSmsBatch.createdById, user.id)
  }

  return inArray(crmSmsBatch.createdById, creatorSubquery)
}
