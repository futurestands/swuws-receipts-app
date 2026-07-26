"use server"

import { db } from "@/lib/db"
import { orgSettings, branch, paymentMethod, waterScheme, cluster, type EditableFields } from "@/lib/db/schema"
import { getCurrentUser, requireUser } from "@/lib/session"
import { writeAudit } from "@/lib/audit"
import { eq } from "drizzle-orm"
import { put } from "@vercel/blob"
import { revalidatePath } from "next/cache"
import { randomUUID } from "crypto"
import { isUniqueViolation } from "@/lib/db/errors"
import fs from "fs/promises"
import path from "path"
import {
  canConfigureSystem,
  canManageAreas,
  canManageSchemes,
  canAccessAdminConsole
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

export async function getSettings() {
  // Readable by any authenticated user (agents need branding + field config).
  const current = await getCurrentUser()
  if (!current) throw new Error("Unauthorized")

  try {
    const [row] = await db.select().from(orgSettings).where(eq(orgSettings.id, 1)).limit(1)
    if (row) return row

    const [created] = await db
      .insert(orgSettings)
      .values({ id: 1, editableFields: DEFAULT_EDITABLE })
      .onConflictDoUpdate({
        target: orgSettings.id,
        set: { updatedAt: new Date() },
      })
      .returning()
    return created
  } catch (e) {
    console.error("getSettings failed — using safety defaults", e)
    // Return a safe, static object to prevent a 500 error if the DB is out of sync.
    return {
      id: 1,
      orgName: "South Western Umbrella of Water and Sanitation",
      logoUrl: null,
      disclaimer:
        "This is an official, non-transferable receipt issued by SWUWS. It cannot be reissued or altered.",
      footerText: "Thank you for your payment.",
      address: null,
      phone: null,
      billingGraceDays: 14,
      currencyCode: "UGX",
      receiptPrefix: "SWUWS",
      editableFields: DEFAULT_EDITABLE,
      updatedAt: new Date(),
    }
  }
}

/**
 * Updates ordinary branding fields ONLY. `disclaimer` is deliberately not a
 * parameter here and there is no other action anywhere in this codebase
 * that can change it. Per the business requirement ("Disclaimer cannot be
 * edited"), changing the disclaimer text requires a source-code change to
 * the default in lib/db/schema.ts and a redeploy — not an admin screen.
 * (Previously this action accepted and freely wrote `disclaimer` — see
 * audit finding 9.4. That parameter has been removed, not just hidden in
 * the UI, so there is no way to re-enable it from the client.)
 */
export async function updateBranding(input: {
  orgName: string
  footerText: string
  address?: string
  phone?: string
  billingGraceDays?: number
  currencyCode?: string
  receiptPrefix?: string
}) {
  const current = await requireUser()
  if (!canConfigureSystem(current)) throw new Error("Forbidden")

  await db
    .update(orgSettings)
    .set({
      orgName: input.orgName.trim(),
      footerText: input.footerText.trim(),
      address: input.address?.trim() || null,
      phone: input.phone?.trim() || null,
      billingGraceDays: input.billingGraceDays ?? undefined,
      currencyCode: input.currencyCode?.trim() || undefined,
      receiptPrefix: input.receiptPrefix?.trim() || undefined,
      updatedAt: new Date(),
    })
    .where(eq(orgSettings.id, 1))

  await writeAudit({
    user: current,
    action: "settings.branding.update",
    entityType: "org_settings",
    entityId: "1",
    details: { orgName: input.orgName },
  })
  revalidatePath("/admin")
  revalidatePath("/dashboard")
  return { ok: true as const }
}

export async function updateEditableFields(fields: EditableFields) {
  const current = await requireUser()
  if (!canConfigureSystem(current)) throw new Error("Forbidden")

  await db
    .update(orgSettings)
    .set({ editableFields: fields, updatedAt: new Date() })
    .where(eq(orgSettings.id, 1))

  await writeAudit({
    user: current,
    action: "settings.fields.update",
    entityType: "org_settings",
    entityId: "1",
    details: { fields },
  })
  revalidatePath("/admin")
  revalidatePath("/dashboard")
  return { ok: true as const }
}

export async function uploadLogo(formData: FormData) {
  const current = await requireUser()
  if (!canConfigureSystem(current)) throw new Error("Forbidden")

  const file = formData.get("logo") as File | null
  if (!file || file.size === 0) {
    return { ok: false as const, error: "No file provided" }
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false as const, error: "File must be an image" }
  }
  if (file.size > 2 * 1024 * 1024) {
    return { ok: false as const, error: "Logo must be under 2MB" }
  }

  let logoUrl: string

  const hasBlobToken = process.env.BLOB_READ_WRITE_TOKEN &&
    process.env.BLOB_READ_WRITE_TOKEN !== "replace-with-a-real-vercel-blob-token"

  if (hasBlobToken) {
    const blob = await put(`logos/${Date.now()}-${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
    })
    logoUrl = blob.url
  } else {
    // Local fallback for development/no-token environments
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const filename = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`
    const uploadDir = path.join(process.cwd(), "public", "uploads")

    await fs.mkdir(uploadDir, { recursive: true })
    await fs.writeFile(path.join(uploadDir, filename), buffer)
    logoUrl = `/uploads/${filename}`
  }

  await db
    .update(orgSettings)
    .set({ logoUrl: logoUrl, updatedAt: new Date() })
    .where(eq(orgSettings.id, 1))

  await writeAudit({
    user: current,
    action: "settings.logo.update",
    entityType: "org_settings",
    entityId: "1",
    details: { logoUrl: logoUrl },
  })
  revalidatePath("/admin")
  revalidatePath("/dashboard")
  return { ok: true as const, url: logoUrl }
}

// ---------------------------------------------------------------------------
// Clusters
// ---------------------------------------------------------------------------

export async function listClusters() {
  const current = await requireUser()
  // Cluster Managers need to list clusters to see the admin dashboard structure
  if (!canAccessAdminConsole(current)) throw new Error("Forbidden")

  return db.select().from(cluster).orderBy(cluster.name)
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

export async function listBranches() {
  const current = await requireUser()
  if (!canAccessAdminConsole(current)) throw new Error("Forbidden")

  return db.select().from(branch).orderBy(branch.name)
}

export async function createBranch(input: { name: string; code: string }) {
  const current = await requireUser()
  if (!canManageAreas(current)) throw new Error("Forbidden")

  const name = input.name?.trim()
  const code = input.code?.trim().toLowerCase().replace(/\s+/g, "_")
  if (!name) return { ok: false as const, error: "Branch name is required" }
  if (!code) return { ok: false as const, error: "Branch code is required" }

  try {
    const [row] = await db.insert(branch).values({ id: randomUUID(), name, code }).returning()
    await writeAudit({
      user: current,
      action: "branch.create",
      entityType: "branch",
      entityId: row.id,
      details: { name, code },
    })
    revalidatePath("/admin")
    return { ok: true as const, branch: row }
  } catch (e) {
    if (isUniqueViolation(e)) {
      return { ok: false as const, error: "A branch with that code already exists" }
    }
    console.error("createBranch failed", e)
    return { ok: false as const, error: "Could not create branch. Please try again." }
  }
}

export async function setBranchActive(id: string, active: boolean) {
  const current = await requireUser()
  if (!canManageAreas(current)) throw new Error("Forbidden")

  const [updated] = await db
    .update(branch)
    .set({ active })
    .where(eq(branch.id, id))
    .returning({ id: branch.id })
  if (!updated) {
    return { ok: false as const, error: "Branch not found" }
  }
  await writeAudit({
    user: current,
    action: active ? "branch.enable" : "branch.disable",
    entityType: "branch",
    entityId: id,
  })
  revalidatePath("/admin")
  return { ok: true as const }
}

// ---------------------------------------------------------------------------
// Payment methods
// ---------------------------------------------------------------------------

export async function listPaymentMethods() {
  const current = await requireUser()
  if (!canConfigureSystem(current)) throw new Error("Forbidden")

  return db.select().from(paymentMethod).orderBy(paymentMethod.name)
}

export async function createPaymentMethod(input: { name: string; code: string }) {
  const current = await requireUser()
  if (!canConfigureSystem(current)) throw new Error("Forbidden")

  const name = input.name?.trim()
  const code = input.code?.trim().toLowerCase().replace(/\s+/g, "_")
  if (!name) return { ok: false as const, error: "Method name is required" }
  if (!code) return { ok: false as const, error: "Method code is required" }

  try {
    const [row] = await db
      .insert(paymentMethod)
      .values({ id: randomUUID(), name, code })
      .returning()
    await writeAudit({
      user: current,
      action: "payment_method.create",
      entityType: "payment_method",
      entityId: row.id,
      details: { name, code },
    })
    revalidatePath("/admin")
    return { ok: true as const, method: row }
  } catch (e) {
    if (isUniqueViolation(e)) {
      return { ok: false as const, error: "A payment method with that code already exists" }
    }
    console.error("createPaymentMethod failed", e)
    return { ok: false as const, error: "Could not create payment method. Please try again." }
  }
}

export async function setPaymentMethodActive(id: string, active: boolean) {
  const current = await requireUser()
  if (!canConfigureSystem(current)) throw new Error("Forbidden")

  const [updated] = await db
    .update(paymentMethod)
    .set({ active })
    .where(eq(paymentMethod.id, id))
    .returning({ id: paymentMethod.id })
  if (!updated) {
    return { ok: false as const, error: "Payment method not found" }
  }
  await writeAudit({
    user: current,
    action: active ? "payment_method.enable" : "payment_method.disable",
    entityType: "payment_method",
    entityId: id,
  })
  revalidatePath("/admin")
  return { ok: true as const }
}

// ---------------------------------------------------------------------------
// Water schemes (Module 2)
// ---------------------------------------------------------------------------

export async function listWaterSchemes() {
  const current = await requireUser()
  if (!canAccessAdminConsole(current)) throw new Error("Forbidden")

  return db.select().from(waterScheme).orderBy(waterScheme.name)
}

export async function createWaterScheme(input: {
  name: string
  code: string
  branchId?: string
  serviceArea?: string
}) {
  const current = await requireUser()
  if (!canManageSchemes(current)) throw new Error("Forbidden")

  const name = input.name?.trim()
  const code = input.code?.trim().toLowerCase().replace(/\s+/g, "_")
  if (!name) return { ok: false as const, error: "Scheme name is required" }
  if (!code) return { ok: false as const, error: "Scheme code is required" }

  try {
    const [row] = await db
      .insert(waterScheme)
      .values({
        id: randomUUID(),
        name,
        code,
        branchId: input.branchId || null,
        serviceArea: input.serviceArea?.trim() || null,
      })
      .returning()
    await writeAudit({
      user: current,
      action: "water_scheme.create",
      entityType: "water_scheme",
      entityId: row.id,
      details: { name, code },
    })
    revalidatePath("/admin")
    return { ok: true as const, scheme: row }
  } catch (e) {
    if (isUniqueViolation(e)) {
      return { ok: false as const, error: "A water scheme with that code already exists" }
    }
    console.error("createWaterScheme failed", e)
    return { ok: false as const, error: "Could not create water scheme. Please try again." }
  }
}

export async function setWaterSchemeActive(id: string, active: boolean) {
  const current = await requireUser()
  if (!canManageSchemes(current)) throw new Error("Forbidden")

  const [updated] = await db
    .update(waterScheme)
    .set({ active })
    .where(eq(waterScheme.id, id))
    .returning({ id: waterScheme.id })
  if (!updated) {
    return { ok: false as const, error: "Water scheme not found" }
  }
  await writeAudit({
    user: current,
    action: active ? "water_scheme.enable" : "water_scheme.disable",
    entityType: "water_scheme",
    entityId: id,
  })
  revalidatePath("/admin")
  return { ok: true as const }
}
