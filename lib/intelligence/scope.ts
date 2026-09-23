import { eq, and, or, sql, inArray } from "drizzle-orm"
import { UserPermissionsContext, canViewAllData } from "@/lib/permissions"
import { waterScheme, branch, cluster } from "@/lib/db/schema/hierarchy"

export function applyIntelligenceSchemeFilter(user: UserPermissionsContext, targetSchemeId?: string | null) {
  // If targetSchemeId provided, verify user has access to it
  if (canViewAllData(user)) {
    if (targetSchemeId && targetSchemeId !== "all") {
      return eq(waterScheme.id, targetSchemeId)
    }
    return undefined
  }

  // Hierarchy scope traps
  if (user.clusterId) {
    const clusterCondition = inArray(
      waterScheme.branchId,
      sql`(SELECT id FROM branch WHERE "clusterId" = ${user.clusterId})`
    )
    if (targetSchemeId && targetSchemeId !== "all") {
      return and(eq(waterScheme.id, targetSchemeId), clusterCondition)
    }
    return clusterCondition
  }

  if (user.branchId) {
    const branchCondition = eq(waterScheme.branchId, user.branchId)
    if (targetSchemeId && targetSchemeId !== "all") {
      return and(eq(waterScheme.id, targetSchemeId), branchCondition)
    }
    return branchCondition
  }

  if (user.schemeId) {
    return eq(waterScheme.id, user.schemeId)
  }

  // Fallback: deny access if no scope matched
  return sql`1 = 0`
}
