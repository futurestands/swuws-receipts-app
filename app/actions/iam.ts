"use server"

import { db } from "@/lib/db"
import { iamRole, iamPermission, iamRolePermission, user as userTable, type IamRole } from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { writeAudit } from "@/lib/audit"
import { hasPermission, getOwnRoleLevel } from "@/lib/iam"
import { eq, and, sql, desc, asc, not, lte } from "drizzle-orm"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { roleSchema } from "@/lib/iam-schemas"
import type { Scope } from "@/lib/iam"
import { ROLES } from "@/lib/permissions/roles"

/**
 * List all roles, ordered by level and name.
 */
export async function listRoles() {
  const current = await requireUser()
  if (!await hasPermission(current, "roles.view")) throw new Error("Forbidden")

  if (current.role === ROLES.SYSTEM_ADMIN) {
    return db.select().from(iamRole).orderBy(desc(iamRole.level), asc(iamRole.name))
  }

  // Non-system admins can only see roles at or below their own level
  const ownLevel = current.iamRoleId ? (await getOwnRoleLevel(current.iamRoleId)) : 0

  return db
    .select()
    .from(iamRole)
    .where(lte(iamRole.level, ownLevel))
    .orderBy(desc(iamRole.level), asc(iamRole.name))
}

/**
 * List all available permissions grouped by module.
 */
export async function listAllPermissions() {
  const current = await requireUser()
  if (!await hasPermission(current, "permissions.view")) throw new Error("Forbidden")

  return db.select().from(iamPermission).orderBy(iamPermission.module, iamPermission.name)
}

/**
 * Walks up the chain of parentId references starting at candidateParentId,
 * returning true if roleId is ever reached (i.e. assigning candidateParentId
 * as roleId's parent would create a cycle). Iterative with a hard depth cap
 * so a pre-existing data anomaly can't cause an unbounded loop here either.
 */
async function wouldCreateCycle(roleId: string, candidateParentId: string): Promise<boolean> {
  let current: string | null = candidateParentId
  let depth = 0
  const MAX_DEPTH = 100

  while (current && depth < MAX_DEPTH) {
    if (current === roleId) return true
    const [row] = await db.select({ parentId: iamRole.parentId }).from(iamRole).where(eq(iamRole.id, current)).limit(1)
    current = row?.parentId ?? null
    depth++
  }

  // Hit the depth cap without resolving to a root - treat as unsafe rather
  // than silently allowing a chain we couldn't fully verify.
  return depth >= MAX_DEPTH
}

/**
 * Create a new role.
 */
export async function createRole(data: z.infer<typeof roleSchema>) {
  const current = await requireUser()
  if (!await hasPermission(current, "roles.manage")) throw new Error("Forbidden")

  // canCreateRole(current, data.code) does NOT work here -- it looks up
  // an EXISTING iam_role row by code to find its level, but this role
  // doesn't exist yet (it's being created right now). That lookup always
  // returns nothing for a genuinely new custom role, so this call was
  // rejecting every single new role creation, for every user, including
  // System Administrators -- confirmed by tracing canCreateRole's actual
  // implementation. The correct check is comparing the NEW role's
  // requested level (data.level) against the creating user's own level.
  if (current.role !== ROLES.SYSTEM_ADMIN) {
    const ownLevel = current.roleLevel ?? (current.iamRoleId ? await getOwnRoleLevel(current.iamRoleId) : 0)
    if (data.level > ownLevel) {
      return { ok: false as const, error: `You cannot create a role (level ${data.level}) higher than your own (level ${ownLevel}).` }
    }
  }

  const parsed = roleSchema.parse(data)
  const id = randomUUID()

  if (parsed.parentId && (await wouldCreateCycle(id, parsed.parentId))) {
    return { ok: false as const, error: "Invalid parent role: would create a circular role hierarchy" }
  }

  try {
    const rows = (await db.insert(iamRole).values({
      id,
      ...parsed,
      isSystem: false,
    }).returning()) as IamRole[]
    const row = rows[0]
    if (!row) throw new Error("Failed to create role")

    await writeAudit({
      user: current,
      action: "iam.role.create",
      entityType: "iam_role",
      entityId: id,
      details: parsed,
    })

    revalidatePath("/admin")
    return { ok: true as const, role: row }
  } catch (e: unknown) {
    if (typeof e === 'object' && e !== null && 'code' in e && e.code === "23505") {
      return { ok: false as const, error: "A role with this code already exists" }
    }
    throw e
  }
}

/**
 * Bootstraps new permissions for v1.2.
 * Finding 6 Fix: Switched from hardcoded role to permission check.
 */
export async function seedV12Permissions() {
  const current = await requireUser()
  // This is a system-level setup action, so we gate it behind a core permission
  // that a system admin would already have from previous versions.
  if (!await hasPermission(current, "branding.manage")) {
    throw new Error("Forbidden: Insufficient permissions to seed system data")
  }

  const news = [
    { code: "templates.manage", name: "Manage Templates", module: "Administration", description: "Create and edit system templates" },
    { code: "templates.publish", name: "Publish Templates", module: "Administration", description: "Publish new versions to live" },
    { code: "crm.view", name: "View CRM Dashboard", module: "CRM", description: "Access the CRM module and overview" },
    { code: "crm.complaints.manage", name: "Manage Complaints", module: "CRM", description: "Register, edit, and resolve customer complaints" },
    { code: "crm.complaints.assign", name: "Assign Complaints", module: "CRM", description: "Assign complaints to specific handlers or departments" },
    { code: "crm.sms.send", name: "Send Bulk SMS", module: "CRM", description: "Create and send bulk SMS communication batches" },
    { code: "crm.settings.manage", name: "Manage CRM Settings", module: "CRM", description: "Configure CRM departments and complaint categories" },
  ]

  for (const p of news) {
    const [exists] = await db.select().from(iamPermission).where(eq(iamPermission.code, p.code)).limit(1)
    if (!exists) {
      await db.insert(iamPermission).values({
        id: randomUUID(),
        ...p,
      })
    }
  }
}

/**
 * Update an existing role.
 */
export async function updateRole(id: string, data: z.infer<typeof roleSchema>) {
  const current = await requireUser()
  if (!await hasPermission(current, "roles.manage")) throw new Error("Forbidden")

  const [existing] = await db.select().from(iamRole).where(eq(iamRole.id, id)).limit(1)
  if (!existing) throw new Error("Role not found")
  if (existing.isSystem && data.code !== existing.code) throw new Error("System roles cannot have their code changed")

  // This function had no escalation guard at all -- a user with
  // roles.manage could raise an EXISTING role's level straight to 100
  // (System Admin tier) regardless of their own seniority. Same fix as
  // createRole, comparing against data.level rather than looking up an
  // existing row (this role already exists, but the level being SET is
  // what needs checking, not what it currently is).
  if (current.role !== ROLES.SYSTEM_ADMIN) {
    const ownLevel = current.roleLevel ?? (current.iamRoleId ? await getOwnRoleLevel(current.iamRoleId) : 0)
    if (data.level > ownLevel) {
      return { ok: false as const, error: `You cannot raise this role to level ${data.level}, above your own level ${ownLevel}.` }
    }
  }

  const parsed = roleSchema.parse(data)

  if (parsed.parentId && (await wouldCreateCycle(id, parsed.parentId))) {
    return { ok: false as const, error: "Invalid parent role: would create a circular role hierarchy" }
  }

  await db.update(iamRole)
    .set({ ...parsed, updatedAt: new Date() })
    .where(eq(iamRole.id, id))

  await writeAudit({
    user: current,
    action: "iam.role.update",
    entityType: "iam_role",
    entityId: id,
    details: { before: existing, after: parsed },
  })

  revalidatePath("/admin")
  return { ok: true as const }
}

/**
 * Fetch permissions assigned to a role.
 */
export async function getRolePermissions(roleId: string) {
  const current = await requireUser()
  if (!await hasPermission(current, "permissions.view")) throw new Error("Forbidden")

  return db.select({
    permissionId: iamRolePermission.permissionId,
    code: iamPermission.code,
    scope: iamRolePermission.scope,
  })
  .from(iamRolePermission)
  .innerJoin(iamPermission, eq(iamRolePermission.permissionId, iamPermission.id))
  .where(eq(iamRolePermission.roleId, roleId))
}

/**
 * Batch update permissions for a role.
 */
export async function updateRolePermissions(roleId: string, grants: { permissionId: string, scope: string }[]) {
  const current = await requireUser()
  if (!await hasPermission(current, "roles.manage")) throw new Error("Forbidden")

  const [role] = await db.select().from(iamRole).where(eq(iamRole.id, roleId)).limit(1)
  if (!role) throw new Error("Role not found")

  // Note: We allow updating Admin permissions now, but the UI logic
  // and seeding ensures they start with everything.

  await db.transaction(async (tx) => {
    // 1. Clear existing
    await tx.delete(iamRolePermission).where(eq(iamRolePermission.roleId, roleId))

    // 2. Insert new
    if (grants.length > 0) {
      // Verify current user holds these permissions
      const validGrants = []
      for (const g of grants) {
        // Find permission code first
        const [p] = await tx.select({ code: iamPermission.code }).from(iamPermission).where(eq(iamPermission.id, g.permissionId)).limit(1)
        if (p && await hasPermission(current, p.code)) {
          validGrants.push({
            id: randomUUID(),
            roleId,
            permissionId: g.permissionId,
            scope: g.scope as Scope,
          })
        }
      }

      if (validGrants.length > 0) {
        await tx.insert(iamRolePermission).values(validGrants)
      }
    }

    await writeAudit({
      user: current,
      action: "iam.role.permissions_update",
      entityType: "iam_role",
      entityId: roleId,
      details: { grantCount: grants.length },
    }, tx)
  })

  revalidatePath("/admin")
  return { ok: true as const }
}

/**
 * Toggle role active status.
 */
export async function setRoleActive(id: string, active: boolean) {
  const current = await requireUser()
  if (!await hasPermission(current, "roles.manage")) throw new Error("Forbidden")

  const [role] = await db.select().from(iamRole).where(eq(iamRole.id, id)).limit(1)
  if (!role) throw new Error("Role not found")
  if (role.isSystem) throw new Error("System roles cannot be deactivated")

  await db.update(iamRole).set({ active, updatedAt: new Date() }).where(eq(iamRole.id, id))

  await writeAudit({
    user: current,
    action: active ? "iam.role.activate" : "iam.role.deactivate",
    entityType: "iam_role",
    entityId: id,
  })

  revalidatePath("/admin")
  return { ok: true as const }
}
