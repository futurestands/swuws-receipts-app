import "server-only"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"
import { getEffectivePermissions, getOwnRoleLevel, PermissionGrant } from "@/lib/iam"

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
  roleLevel: number
  permissions: Array<{ code: string; scope: string }>
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

    const [grants, roleLevel] = row.iamRoleId
      ? await Promise.all([
          getEffectivePermissions(row.iamRoleId),
          getOwnRoleLevel(row.iamRoleId),
        ])
      : [[], 0] as [PermissionGrant[], number]
    const permissions = grants.map(g => ({ code: g.code, scope: g.scope }))

    return {
      ...row,
      roleLevel,
      permissions,
      grants
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.warn("getCurrentUser failed:", message)
    return null
  }
})

export async function requireUser(): Promise<SessionUser> {
  const current = await getCurrentUser()
  if (!current) redirect("/login")
  return current
}
