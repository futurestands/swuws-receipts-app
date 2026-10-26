import { db } from "@/lib/db"
import { organization, cluster, branch, waterScheme } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

/**
 * RESOLVES CREATOR ORGANISATION ID WITH MULTI-TENANT ISOLATION
 *
 * Rules:
 * 1. If creator has organizationId, use creator's organizationId.
 * 2. If creator's organizationId is null:
 *    - Query all organizations in DB.
 *    - If exactly 1 organization exists, return that single organization's ID.
 *    - If > 1 organizations exist, throw Error("Organization scope required when multiple organizations exist").
 * 3. Validate that any provided hierarchy references (clusterId, branchId, schemeId) belong to the resolved organizationId.
 */
export async function resolveCreatorOrganizationId(
  creator: { id?: string; organizationId: string | null },
  hierarchyRef?: { clusterId?: string | null; branchId?: string | null; schemeId?: string | null }
): Promise<string | null> {
  let targetOrgId: string | null = creator.organizationId

  if (!targetOrgId) {
    const orgs = await db.select({ id: organization.id }).from(organization)
    if (orgs.length === 1) {
      targetOrgId = orgs[0].id
    } else if (orgs.length > 1) {
      throw new Error("Organization scope required when multiple organizations exist")
    } else {
      return null
    }
  }

  if (targetOrgId && hierarchyRef) {
    const { clusterId, branchId, schemeId } = hierarchyRef

    if (clusterId) {
      const [c] = await db
        .select({ id: cluster.id, organizationId: cluster.organizationId })
        .from(cluster)
        .where(eq(cluster.id, clusterId))
        .limit(1)
      if (!c) {
        throw new Error("Referenced cluster not found")
      }
      if (c.organizationId && c.organizationId !== targetOrgId) {
        throw new Error("Referenced cluster belongs to a different organization")
      }
    }

    if (branchId) {
      const [b] = await db
        .select({ id: branch.id, clusterId: branch.clusterId })
        .from(branch)
        .where(eq(branch.id, branchId))
        .limit(1)
      if (!b) {
        throw new Error("Referenced branch not found")
      }
      if (b.clusterId) {
        const [c] = await db
          .select({ id: cluster.id, organizationId: cluster.organizationId })
          .from(cluster)
          .where(eq(cluster.id, b.clusterId))
          .limit(1)
        if (c && c.organizationId && c.organizationId !== targetOrgId) {
          throw new Error("Referenced branch belongs to a different organization")
        }
      }
    }

    if (schemeId) {
      const [s] = await db
        .select({ id: waterScheme.id, branchId: waterScheme.branchId })
        .from(waterScheme)
        .where(eq(waterScheme.id, schemeId))
        .limit(1)
      if (!s) {
        throw new Error("Referenced water scheme not found")
      }
      if (s.branchId) {
        const [b] = await db
          .select({ id: branch.id, clusterId: branch.clusterId })
          .from(branch)
          .where(eq(branch.id, s.branchId))
          .limit(1)
        if (b && b.clusterId) {
          const [c] = await db
            .select({ id: cluster.id, organizationId: cluster.organizationId })
            .from(cluster)
            .where(eq(cluster.id, b.clusterId))
            .limit(1)
          if (c && c.organizationId && c.organizationId !== targetOrgId) {
            throw new Error("Referenced water scheme belongs to a different organization")
          }
        }
      }
    }
  }

  return targetOrgId
}
