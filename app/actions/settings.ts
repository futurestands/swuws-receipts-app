"use server"

import { db } from "@/lib/db"
import { orgSettings, branch, paymentMethod, waterScheme, cluster, notification, user, type EditableFields } from "@/lib/db/schema"
import { getCurrentUser, requireUser } from "@/lib/session"
import { writeAudit } from "@/lib/audit"
import { eq, inArray, and } from "drizzle-orm"
import { put } from "@vercel/blob"
import { revalidatePath, unstable_cache } from "next/cache"
import { randomUUID } from "crypto"
import { isUniqueViolation } from "@/lib/db/errors"
import { ROLES } from "@/lib/permissions/roles"
import { logEvent } from "@/lib/logger"
import fs from "fs/promises"
import path from "path"
import {
  canConfigureSystem,
  canManageAreas,
  canManageSchemes,
  canAccessAdminConsole,
  canViewAllData
} from "@/lib/permissions"

const DEFAULT_EDITABLE: EditableFields = {
  customerName: true,
  customerAccount: true,
  customerPhone: true,
  customerAddress: true,
  amount: true,
  paymentDate: true,
  paymentMethod: true,
  paymentReference: true,
  notes: true,
}

export const getSettings = unstable_cache(
  async () => {
    try {
      const [row] = await db.select().from(orgSettings).where(eq(orgSettings.id, 1)).limit(1)
      if (row) return row
      const [created] = await db.insert(orgSettings).values({ id: 1, editableFields: DEFAULT_EDITABLE }).onConflictDoUpdate({ target: orgSettings.id, set: { updatedAt: new Date() } }).returning()
      return created
    } catch (e) {
      return {
        id: 1, orgName: "South Western Umbrella of Water and Sanitation", logoUrl: "/logo.jpg",
        disclaimer: "Official receipt issued by SWUWS.", footerText: "Thank you.",
        address: null, phone: null, billingGraceDays: 14, currencyCode: "UGX", receiptPrefix: "SWUWS",
        developerCredit: "Mugarura Johnson IT", latestAppVersion: "1.0.0", maintenanceMode: false,
        editableFields: DEFAULT_EDITABLE, updatedAt: new Date(),
      }
    }
  },
  ["org-settings-v1"],
  { tags: ["settings"], revalidate: 3600 }
)

export async function updateBranding(input: any) {
  const current = await requireUser(); if (!canConfigureSystem(current)) throw new Error("Forbidden")
  await db.update(orgSettings).set({ ...input, updatedAt: new Date() }).where(eq(orgSettings.id, 1))
  await writeAudit({ user: current, action: "settings.branding.update", entityType: "org_settings", entityId: "1" })
  revalidatePath("/", "layout"); return { ok: true as const }
}

export async function setMaintenanceMode(active: boolean) {
  const current = await requireUser(); if (!canConfigureSystem(current)) throw new Error("Forbidden")
  await db.update(orgSettings).set({ maintenanceMode: active, updatedAt: new Date() }).where(eq(orgSettings.id, 1))
  await writeAudit({ user: current, action: active ? "system.maintenance.enable" : "system.maintenance.disable", entityType: "org_settings", entityId: "1" })
  revalidatePath("/", "layout"); revalidatePath("/admin"); return { ok: true as const }
}

export async function updateEditableFields(fields: EditableFields) {
  const current = await requireUser(); if (!canConfigureSystem(current)) throw new Error("Forbidden")
  await db.update(orgSettings).set({ editableFields: fields, updatedAt: new Date() }).where(eq(orgSettings.id, 1))
  revalidatePath("/", "layout"); return { ok: true as const }
}

export async function uploadLogo(formData: FormData) {
  const current = await requireUser(); if (!canConfigureSystem(current)) throw new Error("Forbidden")
  try {
    const file = formData.get("logo") as File; if (!file || file.size === 0) return { ok: false as const, error: "No file provided" }

    if (file.size > 5 * 1024 * 1024) return { ok: false as const, error: "Logo must be under 5MB" }

    const allowedTypes: Record<string, boolean> = { "image/png": true, "image/jpeg": true, "image/jpg": true }
    if (!allowedTypes[file.type]) {
      return { ok: false as const, error: "Only PNG and JPG images are allowed" }
    }

    // Magic-byte verification
    const buffer = Buffer.from(await file.arrayBuffer())
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47
    const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF

    if (!isPng && !isJpeg) {
      return { ok: false as const, error: "Invalid image content. File is corrupted or spoofed." }
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN
    const blob = await put(`logos/${Date.now()}-${file.name}`, buffer, { access: "public", token })
    await db.update(orgSettings).set({ logoUrl: blob.url, updatedAt: new Date() }).where(eq(orgSettings.id, 1))
    revalidatePath("/", "layout"); return { ok: true as const, url: blob.url }
  } catch (err: any) { return { ok: false as const, error: err.message } }
}

export async function listClusters() {
  const current = await requireUser(); if (!canAccessAdminConsole(current)) throw new Error("Forbidden")
  const baseQuery = db.select().from(cluster).orderBy(cluster.name)

  if (canViewAllData(current) || (!current.clusterId && !current.branchId && !current.schemeId)) {
    return baseQuery
  }

  return baseQuery.where(eq(cluster.id, current.clusterId || 'none'))
}

export async function listBranches() {
  const current = await requireUser(); if (!canAccessAdminConsole(current)) throw new Error("Forbidden")

  const baseQuery = db.select().from(branch).orderBy(branch.name)

  // HIERARCHY BYPASS: Global Administrators or Head Office tiers see everything.
  if (canViewAllData(current) || (!current.clusterId && !current.branchId && !current.schemeId)) {
    return baseQuery
  }

  // HIERARCHY ENFORCEMENT: Scoped users are trapped in their assigned territory.
  const conditions = []
  if (current.branchId) {
    conditions.push(eq(branch.id, current.branchId))
  } else if (current.clusterId) {
    conditions.push(eq(branch.clusterId, current.clusterId))
  } else {
    // Safety fallback: if assigned to a scheme only, they shouldn't be selecting branches.
    return []
  }

  return baseQuery.where(and(...conditions))
}

export async function createBranch(input: { name: string, code: string }) {
  const current = await requireUser(); if (!canManageAreas(current)) throw new Error("Forbidden")
  try {
    const [row] = await db.insert(branch).values({ id: randomUUID(), name: input.name, code: input.code.toLowerCase() }).returning()
    revalidatePath("/admin"); return { ok: true as const, branch: row }
  } catch (e: any) { return { ok: false as const, error: e.message } }
}

export async function setBranchActive(id: string, active: boolean) {
  const current = await requireUser(); if (!canManageAreas(current)) throw new Error("Forbidden")
  try {
    await db.update(branch).set({ active }).where(eq(branch.id, id))
    revalidatePath("/admin"); return { ok: true as const }
  } catch (e: any) { return { ok: false as const, error: e.message } }
}

export async function listPaymentMethods() {
  const current = await requireUser(); if (!canConfigureSystem(current)) throw new Error("Forbidden")
  return db.select().from(paymentMethod).orderBy(paymentMethod.name)
}

export async function createPaymentMethod(input: { name: string, code: string }) {
  const current = await requireUser(); if (!canConfigureSystem(current)) throw new Error("Forbidden")
  try {
    const [row] = await db.insert(paymentMethod).values({ id: randomUUID(), name: input.name, code: input.code.toLowerCase() }).returning()
    revalidatePath("/admin"); return { ok: true as const, method: row }
  } catch (e: any) { return { ok: false as const, error: e.message } }
}

export async function setPaymentMethodActive(id: string, active: boolean) {
  const current = await requireUser(); if (!canConfigureSystem(current)) throw new Error("Forbidden")
  try {
    await db.update(paymentMethod).set({ active }).where(eq(paymentMethod.id, id))
    revalidatePath("/admin"); return { ok: true as const }
  } catch (e: any) { return { ok: false as const, error: e.message } }
}

export async function listWaterSchemes() {
  const current = await requireUser(); if (!canAccessAdminConsole(current)) throw new Error("Forbidden")

  const baseQuery = db.select().from(waterScheme).orderBy(waterScheme.name)

  // HIERARCHY BYPASS: Global Administrators or Head Office tiers see everything.
  if (canViewAllData(current) || (!current.clusterId && !current.branchId && !current.schemeId)) {
    return baseQuery
  }

  // HIERARCHY ENFORCEMENT: Scoped users are trapped in their assigned territory.
  const conditions = []
  if (current.schemeId) {
    conditions.push(eq(waterScheme.id, current.schemeId))
  } else if (current.branchId) {
    conditions.push(eq(waterScheme.branchId, current.branchId))
  } else if (current.clusterId) {
    conditions.push(inArray(
      waterScheme.branchId,
      db.select({ id: branch.id }).from(branch).where(eq(branch.clusterId, current.clusterId))
    ))
  }

  return baseQuery.where(and(...conditions))
}

export async function createWaterScheme(input: any) {
  const current = await requireUser(); if (!canManageSchemes(current)) throw new Error("Forbidden")
  try {
    const [row] = await db.insert(waterScheme).values({ id: randomUUID(), ...input, code: input.code.toLowerCase() }).returning()
    revalidatePath("/admin"); return { ok: true as const, scheme: row }
  } catch (e: any) { return { ok: false as const, error: e.message } }
}

export async function setWaterSchemeActive(id: string, active: boolean) {
  const current = await requireUser(); if (!canManageSchemes(current)) throw new Error("Forbidden")
  try {
    await db.update(waterScheme).set({ active }).where(eq(waterScheme.id, id))
    revalidatePath("/admin"); return { ok: true as const }
  } catch (e: any) { return { ok: false as const, error: e.message } }
}

export async function updateLatestAppVersion(version: string) {
  const current = await requireUser(); if (!canConfigureSystem(current)) throw new Error("Forbidden")
  await db.update(orgSettings).set({ latestAppVersion: version, updatedAt: new Date() }).where(eq(orgSettings.id, 1))
  revalidatePath("/", "layout"); return { ok: true as const }
}
