"use server"

import { db } from "@/lib/db"
import { iamRole, iamPermission, iamRolePermission, user as userTable } from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { writeAudit } from "@/lib/audit"
import { hasPermission } from "@/lib/iam"
import { eq, and, sql, desc, asc, not } from "drizzle-orm"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const roleSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  code: z.string().trim().min(2, "Code must be at least 2 characters").transform(val => val.toLowerCase().replace(/\s+/g, "_")),
  description: z.string().trim().optional(),
  level: z.number().int().min(0).max(100),
  parentId: z.string().nullable().optional(),
  active: z.boolean().default(true),
})

/**
 * List all roles, ordered by level and name.
 */
export async function listRoles() {
  const current = await requireUser()
  if (!await hasPermission(current, "roles.view")) throw new Error("Forbidden")

  return db.select().from(iamRole).orderBy(desc(iamRole.level), asc(iamRole.name))
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
 * Create a new role.
 */
export async function createRole(data: z.infer<typeof roleSchema>) {
  const current = await requireUser()
  if (!await hasPermission(current, "roles.manage")) throw new Error("Forbidden")

  const parsed = roleSchema.parse(data)
  const id = randomUUID()

  try {
    const [row] = await db.insert(iamRole).values({
      id,
      ...parsed,
      isSystem: false,
    }).returning()

    await writeAudit({
      user: current,
      action: "iam.role.create",
      entityType: "iam_role",
      entityId: id,
      details: parsed,
    })

    revalidatePath("/admin")
    return { ok: true as const, role: row }
  } catch (e: any) {
    if (e.code === "23505") return { ok: false as const, error: "A role with this code already exists" }
    throw e
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

  const parsed = roleSchema.parse(data)

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
      await tx.insert(iamRolePermission).values(grants.map(g => ({
        id: randomUUID(),
        roleId,
        permissionId: g.permissionId,
        scope: g.scope as any,
      })))
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
