import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm"
import type { AnyPgColumn } from "drizzle-orm/pg-core"
import { waterScheme } from "@/lib/db/schema/hierarchy"
import { waterProductionLog } from "@/lib/db/schema/intelligence"
import { canViewIntelligence, canViewProduction, type UserPermissionsContext } from "@/lib/permissions"

export function productionGrantScope(user: UserPermissionsContext, code: string): string | null {
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

/** Intelligence mutations need an explicit scoped grant as well as read access. */
export function intelligenceMutationFilter(user: UserPermissionsContext, code: string): SQL {
  const scope = productionGrantScope(user, code)
  if (!scope || scope === "own") return sql`false`
  const boundary = scope === "scheme" ? (user.schemeId ? eq(waterScheme.id, user.schemeId) : sql`false`)
    : scope === "area" ? (user.branchId ? eq(waterScheme.branchId, user.branchId) : sql`false`)
    : scope === "cluster" ? (user.clusterId ? sql`exists (select 1 from branch ib where ib.id = ${waterScheme.branchId} and ib."clusterId" = ${user.clusterId})` : sql`false`)
    : undefined
  return and(intelligenceHierarchyFilter(user), boundary)!
}

/** Schemes a user may read: production viewers plus (read-only) intelligence viewers inside their boundary. */
export function productionReadableSchemeFilter(user: UserPermissionsContext, target?: string): SQL {
  return or(productionSchemeFilter(user, "production.view", target), intelligenceHierarchyFilter(user, target))!
}

const intelligenceSchemeSubselect = (user: UserPermissionsContext) =>
  sql`(select ${waterScheme.id} from ${waterScheme} where ${intelligenceHierarchyFilter(user)})`

/** "own" production viewers see their own daily logs plus schemes they may read through intelligence. */
export function ownLogFilter(user: UserPermissionsContext): SQL | undefined {
  if (productionGrantScope(user, "production.view") !== "own") return undefined
  return or(eq(waterProductionLog.recordedById, user.id), inArray(waterProductionLog.schemeId, intelligenceSchemeSubselect(user)))
}

/** Same rule for interval/electricity/fuel measurements; undefined when the grant is not "own". */
export function ownMeasurementFilter(user: UserPermissionsContext): ((table: { schemeId: AnyPgColumn; recordedById: AnyPgColumn }) => SQL | undefined) | undefined {
  if (productionGrantScope(user, "production.view") !== "own") return undefined
  return table => or(eq(table.recordedById, user.id), inArray(table.schemeId, intelligenceSchemeSubselect(user)))
}
