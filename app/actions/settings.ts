"use server"

import { db } from "@/lib/db"
import { orgSettings, branch, paymentMethod, waterScheme, cluster, notification, user, type EditableFields } from "@/lib/db/schema"
import { getCurrentUser, requireUser } from "@/lib/session"
import { writeAudit } from "@/lib/audit"
import { eq } from "drizzle-orm"
import { put } from "@vercel/blob"
import { revalidatePath, unstable_cache } from "next/cache"
import { randomUUID } from "crypto"
import { isUniqueViolation } from "@/lib/db/errors"
import { logEvent } from "@/lib/logger"
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

/**
 * PRODUCTION OPTIMIZATION: System Settings Caching
 *
 * Wrapped in unstable_cache to prevent redundant database hits on every page load.
 * This is critical for supporting 200+ concurrent users without latency.
 * Invalidated automatically when branding is updated via 'settings' tag.
 */
export const getSettings = unstable_cache(
  async () => {
    try {
      const [row] = await db.select().from(orgSettings).where(eq(orgSettings.id, 1)).limit(1)
      if (row) return row

      // Initialize defaults if first run
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
      logEvent({
        message: "getSettings failed — using safety defaults",
        severity: "error",
        category: "system",
        error: e,
      })
      return {
        id: 1,
        orgName: "South Western Umbrella of Water and Sanitation",
        logoUrl: "/logo.jpg",
        disclaimer: "This is an official, non-transferable receipt issued by SWUWS. It cannot be reissued or altered.",
        footerText: "Thank you for your payment.",
        address: null,
        phone: null,
        billingGraceDays: 14,
        currencyCode: "UGX",
        receiptPrefix: "SWUWS",
        developerCredit: "Developed by Mugarura Johnson IT",
        latestAppVersion: "1.0.0",
        editableFields: DEFAULT_EDITABLE,
        updatedAt: new Date(),
      }
    }
  },
  ["org-settings-v1"],
  { tags: ["settings"], revalidate: 3600 }
)

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
  developerCredit?: string
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
      developerCredit: input.developerCredit?.trim() ?? undefined,
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
  revalidatePath("/", "layout")
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
  revalidatePath("/", "layout")
  revalidatePath("/admin")
  revalidatePath("/dashboard")
  return { ok: true as const }
}

export async function uploadLogo(formData: FormData) {
  const current = await requireUser()
  if (!canConfigureSystem(current)) throw new Error("Forbidden")

  try {
    const file = formData.get("logo") as File | null
    if (!file || file.size === 0) {
      return { ok: false as const, error: "No file was received by the server." }
    }

    // Safety Check: File Size (Vercel infrastructure limit)
    if (file.size > 4 * 1024 * 1024) {
      return { ok: false as const, error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max allowed is 4MB.` }
    }

    let logoUrl: string
    const token = process.env.BLOB_READ_WRITE_TOKEN
    const isProduction = process.env.NODE_ENV === "production"

    const isTokenValid = token && token.startsWith("vercel_blob_rw_") && token !== "replace-with-a-real-vercel-blob-token"

    if (isTokenValid) {
      // Convert File to Buffer for stable transmission
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Clean filename for cloud compatibility
      const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]/g, "-")

      try {
        const blob = await put(`logos/${Date.now()}-${safeName}`, buffer, {
          access: "public",
          addRandomSuffix: true,
          token: token // Explicitly pass token for redundancy
        })
        logoUrl = blob.url
      } catch (blobErr: any) {
        logEvent({
          message: "Vercel Blob Storage Error:",
          severity: "error",
          category: "system",
          error: blobErr,
          user: current,
        })
        return { ok: false as const, error: `Cloud Storage Error: ${blobErr.message || "Access Denied"}` }
      }
    } else if (!isProduction) {
      // Local fallback for dev
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      const filename = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`
      const uploadDir = path.join(process.cwd(), "public", "uploads")
      await fs.mkdir(uploadDir, { recursive: true })
      await fs.writeFile(path.join(uploadDir, filename), buffer)
      logoUrl = `/uploads/${filename}`
    } else {
      return { ok: false as const, error: "Configuration Error: BLOB_READ_WRITE_TOKEN is missing or invalid in Vercel settings." }
    }

    // Update Database
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

    // Targeted revalidation to prevent layout-level crashes
    revalidatePath("/", "layout")
    revalidatePath("/admin")
    revalidatePath("/dashboard")

    return { ok: true as const, url: logoUrl }
  } catch (err: any) {
    logEvent({
      message: "Deep System Failure during upload:",
      severity: "fatal",
      category: "system",
      error: err,
      user: current,
    })
    return { ok: false as const, error: `System Error: ${err.message || "Unknown error occurred"}` }
  }
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
    logEvent({
      message: "createBranch failed",
      severity: "error",
      category: "system",
      error: e,
      user: current,
    })
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
    logEvent({
      message: "createPaymentMethod failed",
      severity: "error",
      category: "system",
      error: e,
      user: current,
    })
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
    logEvent({
      message: "createWaterScheme failed",
      severity: "error",
      category: "system",
      error: e,
      user: current,
    })
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

/**
 * Updates the organization-wide "latest" app version.
 * Triggers a notification for all active agents.
 */
export async function updateLatestAppVersion(version: string) {
  const current = await requireUser()
  if (!canConfigureSystem(current)) throw new Error("Forbidden")

  await db.transaction(async (tx) => {
    // 1. Update global setting
    await tx
      .update(orgSettings)
      .set({ latestAppVersion: version.trim(), updatedAt: new Date() })
      .where(eq(orgSettings.id, 1))

    // 2. Create notification for all active users
    const agents = await tx.select({ id: user.id }).from(user).where(eq(user.active, true))

    // We could use a batch insert here if there are many users
    for (const agent of agents) {
      await tx.insert(notification).values({
        id: randomUUID(),
        userId: agent.id,
        type: "app_update",
        title: "New App Update Available",
        message: `Version v${version} of the SWUWS Mobile App is now available. Please update your device from the Account page.`,
        priority: "high",
        status: "unread",
        relatedEntityType: "app_update",
        relatedEntityId: version,
      })
    }

    await writeAudit({
      user: current,
      action: "settings.app_version.update",
      entityType: "org_settings",
      entityId: "1",
      details: { version },
    }, tx)
  })

  revalidatePath("/", "layout")
  revalidatePath("/admin")
  revalidatePath("/dashboard")
  return { ok: true as const }
}
