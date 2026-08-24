import "server-only"
import { db } from "../db"
import { iamRole } from "../db/schema"
import { eq } from "drizzle-orm"
import { Role, ROLE_RANK } from "./roles"
import { UserPermissionsContext, getRole, hasPerm } from "./index"
import { getOwnRoleLevel } from "../iam"

/**
 * Role Creation Hierarchy: Defines which roles a user can create.
 * A user may ONLY create or promote another user to a role at or below
 * their own rank (see ROLE_RANK in ./roles).
 *
 * SERVER-ONLY: This function performs database lookups and should only
 * be used in Server Components or Server Actions.
 */
export async function canCreateRole(currentUser: UserPermissionsContext, targetRoleCode: string) {
  const hasCreatePermission =
    hasPerm(currentUser, "roles.manage") ||
    hasPerm(currentUser, "users.create")
  if (!hasCreatePermission) return false

  const targetRank = ROLE_RANK[targetRoleCode as Role]

  if (targetRank !== undefined) {
    const currentRole = getRole(currentUser)
    const currentRank = currentRole ? ROLE_RANK[currentRole] : 0
    return targetRank <= currentRank
  }

  // Fallback: Check dynamic IAM roles by code
  const [targetIamRole] = await db
    .select({ level: iamRole.level })
    .from(iamRole)
    .where(eq(iamRole.code, targetRoleCode))
    .limit(1)

  if (!targetIamRole) return false

  const currentLevel = currentUser.iamRoleId ? (await getOwnRoleLevel(currentUser.iamRoleId)) : 0

  return targetIamRole.level <= currentLevel
}
