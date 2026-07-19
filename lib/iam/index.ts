import "server-only"
import { db } from "@/lib/db"
import { iamRole, iamPermission, iamRolePermission } from "@/lib/db/schema"
import { eq, and, inArray } from "drizzle-orm"
import { cache } from "react"
import { SessionUser } from "@/lib/session"

export type Scope = "own" | "scheme" | "area" | "cluster" | "global"

export interface PermissionGrant {
  code: string
  scope: Scope
}

/**
 * RECURSIVE PERMISSION RESOLVER
 * Fetches all permissions for a role, including those inherited from parent roles.
 */
export const resolvePermissions = cache(async (roleId: string): Promise<PermissionGrant[]> => {
  const grants: PermissionGrant[] = []

  // 1. Fetch current role permissions
  const directGrants = await db
    .select({
      code: iamPermission.code,
      scope: iamRolePermission.scope,
    })
    .from(iamRolePermission)
    .innerJoin(iamPermission, eq(iamRolePermission.permissionId, iamPermission.id))
    .where(eq(iamRolePermission.roleId, roleId))

  grants.push(...(directGrants as PermissionGrant[]))

  // 2. Fetch parent role (for inheritance)
  const [role] = await db
    .select({ parentId: iamRole.parentId })
    .from(iamRole)
    .where(eq(iamRole.id, roleId))
    .limit(1)

  if (role?.parentId) {
    const parentGrants = await resolvePermissions(role.parentId)

    // Merge strategy: Child overrides parent for same permission code
    // (or keeps child's more specific scope).
    // Actually, inheritance usually means you get EVERYTHING your parent has.
    // If a child has 'own' and parent has 'area', 'area' is more permissive.
    // But for SWUWS, usually children roles are more specialized.
    // Let's stick to simple additive merge for now.
    grants.push(...parentGrants)
  }

  return grants
})

/**
 * Checks if a user has a specific permission and returns the most permissive scope.
 */
export async function authorize(user: SessionUser, permissionCode: string): Promise<{
  granted: boolean
  scope: Scope | null
}> {
  if (!user.iamRoleId) return { granted: false, scope: null }

  const grants = await resolvePermissions(user.iamRoleId)
  const relevantGrants = grants.filter(g => g.code === permissionCode)

  if (relevantGrants.length === 0) {
    return { granted: false, scope: null }
  }

  // Hierarchy of scopes (more permissive first)
  const SCOPE_HIERARCHY: Record<Scope, number> = {
    "global": 4,
    "cluster": 3,
    "area": 2,
    "scheme": 1,
    "own": 0
  }

  // Find the highest scope granted
  const bestGrant = relevantGrants.reduce((prev, curr) => {
    return SCOPE_HIERARCHY[curr.scope] > SCOPE_HIERARCHY[prev.scope] ? curr : prev
  })

  return { granted: true, scope: bestGrant.scope }
}

/**
 * Simple boolean check for permissions.
 */
export async function hasPermission(user: SessionUser, permissionCode: string): Promise<boolean> {
  const result = await authorize(user, permissionCode)
  return result.granted
}

/**
 * Returns all permission codes and their best scopes assigned to a user.
 * optimized for pre-fetching in getCurrentUser.
 */
export async function getEffectivePermissions(roleId: string): Promise<PermissionGrant[]> {
  const grants = await resolvePermissions(roleId)

  // Dedup and take best scope for each code
  const bestGrantsMap = new Map<string, PermissionGrant>()

  const SCOPE_HIERARCHY: Record<Scope, number> = {
    "global": 4,
    "cluster": 3,
    "area": 2,
    "scheme": 1,
    "own": 0
  }

  for (const g of grants) {
    const existing = bestGrantsMap.get(g.code)
    if (!existing || SCOPE_HIERARCHY[g.scope] > SCOPE_HIERARCHY[existing.scope]) {
      bestGrantsMap.set(g.code, g)
    }
  }

  return Array.from(bestGrantsMap.values())
}
