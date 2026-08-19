import "server-only"
import { db } from "@/lib/db"
import { iamRole, iamPermission, iamRolePermission } from "@/lib/db/schema"
import { eq, and, inArray, sql } from "drizzle-orm"
import { cache } from "react"
import { SessionUser } from "@/lib/session"

export type Scope = "own" | "scheme" | "area" | "cluster" | "global"

export interface PermissionGrant {
  code: string
  scope: Scope
}

/**
 * EFFICIENT PERMISSION RESOLVER
 * Fetches all permissions for a role, including those inherited from parent roles,
 * using a single recursive database query.
 */
export const resolvePermissions = cache(async (roleId: string): Promise<PermissionGrant[]> => {
  try {
    const result = await db.execute(sql`
      WITH RECURSIVE role_hierarchy AS (
        -- Base case: the start role
        SELECT id, "parent_id"
        FROM ${iamRole}
        WHERE id = ${roleId}

        UNION ALL

        -- Recursive step: parents of the roles already found
        SELECT r.id, r."parent_id"
        FROM ${iamRole} r
        INNER JOIN role_hierarchy rh ON r.id = rh."parent_id"
      )
      SELECT p.code, rp.scope
      FROM ${iamRolePermission} rp
      JOIN ${iamPermission} p ON rp."permission_id" = p.id
      WHERE rp."role_id" IN (SELECT id FROM role_hierarchy)
    `)

    return result.rows as unknown as PermissionGrant[]
  } catch (error) {
    console.error("IAM: resolvePermissions failed", error)
    return []
  }
})

// Deleted resolvePermissionsRecursive (redundant and slow)

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
 * Authorizes whether `user` is allowed to assign `targetRoleId` to someone
 * (themselves excluded — that's handled by the caller).
 *
 * SECURITY CONTEXT: iam_role.level already existed as a field (editable in
 * the admin panel, used to sort the role list) but was never actually
 * enforced anywhere. Role *definition* (createRole/updateRole/
 * updateRolePermissions in app/actions/iam.ts) is correctly gated behind
 * the high-bar "roles.manage" permission — but *assigning* an
 * already-existing role to a user (setAgentRole/createAgent in
 * app/actions/admin.ts) was only gated behind "users.create"/"users.view".
 * That's a real gap: someone with basic user-management rights could hand
 * a colleague a pre-existing role carrying "roles.manage" or any other
 * broad permission, without ever needing "roles.manage" themselves.
 *
 * Unassigning a role (targetRoleId null/undefined) is always allowed —
 * removing authority isn't the risk here, granting it is.
 */
export async function canAssignIamRole(user: SessionUser, targetRoleId: string | null | undefined): Promise<boolean> {
  if (!targetRoleId) return true

  // Holders of roles.manage already have full authority over the role
  // system itself (defining roles, editing their permissions), so letting
  // them assign any role too is consistent, not an escalation.
  if (await hasPermission(user, "roles.manage")) return true

  const [targetRole] = await db
    .select({ level: iamRole.level })
    .from(iamRole)
    .where(eq(iamRole.id, targetRoleId))
    .limit(1)

  // Assigning a role that doesn't exist shouldn't be possible via the UI,
  // but if it happens, reject rather than assume it's safe.
  if (!targetRole) return false

  const currentLevel = user.iamRoleId ? (await getOwnRoleLevel(user.iamRoleId)) : 0

  return targetRole.level <= currentLevel
}

export const getOwnRoleLevel = cache(async (roleId: string): Promise<number> => {
  const [row] = await db.select({ level: iamRole.level }).from(iamRole).where(eq(iamRole.id, roleId)).limit(1)
  return row?.level ?? 0
})

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
