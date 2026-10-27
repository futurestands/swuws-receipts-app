import { and, eq, sql, type SQL } from "drizzle-orm"
import { waterScheme } from "@/lib/db/schema/hierarchy"
import { canViewIntelligence, canViewProduction, type UserPermissionsContext } from "@/lib/permissions"

export function productionGrantScope(user: UserPermissionsContext, code: string): string | null {
  if (user.role === "admin") return "global"
  const grant = user.permissions?.find(p => typeof p === "object" && p.code === code)
  const scope = typeof grant === "object" ? grant.scope : user.grants?.find(g => g.code === code)?.scope
  return scope && ["own", "scheme", "area", "cluster", "global"].includes(scope) ? scope : null
}

/** All assigned boundaries intersect; absent/broken organisation ancestry fails closed. */
export function hierarchyBoundary(user: UserPermissionsContext): SQL {
  const ancestry = sql`exists (select 1 from branch pb join cluster pc on pc.id = pb."clusterId"
    join organization po on po.id = pc."organizationId" where pb.id = ${waterScheme.branchId}
    ${user.organizationId ? sql`and po.id = ${user.organizationId}` : sql``})`
  if (!user.organizationId && user.role !== "admin") return sql`false`
  return and(ancestry,
    user.schemeId ? eq(waterScheme.id, user.schemeId) : undefined,
    user.branchId ? eq(waterScheme.branchId, user.branchId) : undefined,
    user.clusterId ? sql`exists (select 1 from branch cb where cb.id = ${waterScheme.branchId} and cb."clusterId" = ${user.clusterId})` : undefined,
  )!
}

export function productionSchemeFilter(user: UserPermissionsContext, code = "production.view", target?: string): SQL {
  const scope = productionGrantScope(user, code)
  if (!canViewProduction(user) || !scope) return sql`false`
  let grantBoundary: SQL | undefined
  if (scope === "scheme") grantBoundary = user.schemeId ? eq(waterScheme.id, user.schemeId) : sql`false`
  if (scope === "area") grantBoundary = user.branchId ? eq(waterScheme.branchId, user.branchId) : sql`false`
  if (scope === "cluster") grantBoundary = user.clusterId ? sql`exists (select 1 from branch gb where gb.id = ${waterScheme.branchId} and gb."clusterId" = ${user.clusterId})` : sql`false`
  if (scope === "own") {
    if (code === "production.verify" || code === "production.sources.manage") return sql`false`
    if (!user.schemeId && !user.branchId && !user.clusterId) return sql`false`
  }
  return and(hierarchyBoundary(user), grantBoundary, target ? eq(waterScheme.id, target) : undefined)!
}

export function intelligenceHierarchyFilter(user: UserPermissionsContext, target?: string | null): SQL {
  if (!canViewIntelligence(user)) return sql`false`
  const hasBoundary = user.schemeId || user.branchId || user.clusterId
  const globalRead = user.role === "admin" || (user.roleLevel ?? 0) >= 8 || user.permissions?.some(p => typeof p === "object" && p.scope === "global" && ["intelligence.view", "reports.view", "dashboard.view"].includes(p.code))
  if (!hasBoundary && !globalRead) return sql`false`
  return and(hierarchyBoundary(user), target && target !== "all" ? eq(waterScheme.id, target) : undefined)!
}
