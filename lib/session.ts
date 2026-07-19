import "server-only"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { cache } from "react"
import { getEffectivePermissions, PermissionGrant } from "@/lib/iam"

export type SessionUser = {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  organizationId: string | null
  clusterId: string | null
  branchId: string | null
  schemeId: string | null
  iamRoleId: string | null
  permissions: string[]
  grants: PermissionGrant[]
}

/**
 * Returns the current authenticated user with fresh role/active status
 * pulled from the database, or null if not authenticated / disabled.
 *
 * Wrapped in React.cache to prevent redundant DB hits and pool exhaustion
 * during a single server-side render pass (e.g. Promise.all in AdminPage).
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return null

    const [row] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        active: user.active,
        organizationId: user.organizationId,
        clusterId: user.clusterId,
        branchId: user.branchId,
        schemeId: user.schemeId,
        iamRoleId: user.iamRoleId,
      })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1)

    if (!row || !row.active) return null

    // Fetch effective permissions and scopes
    const grants = row.iamRoleId ? await getEffectivePermissions(row.iamRoleId) : []
    const permissions = grants.map(g => g.code)

    return {
      ...row,
      permissions,
      grants
    }
  } catch (e) {
    console.error("getCurrentUser error:", e)
    return null
  }
})

export async function requireUser(): Promise<SessionUser> {
  const current = await getCurrentUser()
  if (!current) throw new Error("Unauthorized")
  return current
}
