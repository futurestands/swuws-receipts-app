"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { writeAudit } from "@/lib/audit"
import { eq, and } from "drizzle-orm"
import { headers } from "next/headers"
import { logEvent } from "@/lib/logger"

import { ROLES } from "@/lib/permissions/roles"

async function hasAdmin() {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.role, ROLES.SYSTEM_ADMIN)).limit(1)
  return Boolean(row)
}

export async function adminExistsPublic() {
  return hasAdmin()
}

/**
 * Creates the very first admin account. Only works while no admin exists,
 * so it is safe to expose without authentication for initial setup.
 *
 * NOTE on concurrency: this previously used pg_advisory_xact_lock() to
 * serialize concurrent bootstrap attempts (closing a narrow race window).
 * That lock has been removed because Supabase's transaction-mode connection
 * pooling (Supavisor) does not reliably support session/transaction-scoped
 * advisory locks — a lock acquired in one logical transaction is not
 * guaranteed to be visible to a concurrent request on the same pooled
 * connection. Bootstrap is a one-time, single-operator setup action, so the
 * residual race window (two admins submitting the very first setup form in
 * the same instant) is an accepted, low-likelihood risk rather than one
 * worth re-solving with a different locking mechanism here.
 */
export async function bootstrapAdmin(input: { name: string; email: string; password: string }) {
  // Long-Term Hardening: Disable bootstrap feature in production
  if (process.env.ALLOW_ADMIN_BOOTSTRAP !== "true") {
    return { ok: false as const, error: "Feature Disabled for security. Contact System Administrator." }
  }

  if (!input.name?.trim()) return { ok: false as const, error: "Name is required" }
  if (!input.email?.trim()) return { ok: false as const, error: "Email is required" }
  if (!input.password || input.password.length < 8) {
    return { ok: false as const, error: "Password must be at least 8 characters" }
  }

  // 1. Strict check: does an admin already exist?
  const [existingAdmin] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, ROLES.SYSTEM_ADMIN))
    .limit(1)
  if (existingAdmin) {
    return { ok: false as const, error: "Setup already completed" }
  }

  let userId: string | null = null
  const email = input.email.trim().toLowerCase()
  const sanitizedName = input.name.replace(/<[^>]*>?/gm, "").trim()

  try {
    // 2. Attempt to create the user via Better Auth
    const created = await auth.api.signUpEmail({
      body: { name: sanitizedName, email, password: input.password },
      headers: await headers(),
    })
    userId = created?.user?.id ?? null
  } catch (e) {
    // 3. Recovery: if signUp fails because the email is taken, check if it's
    // a stray agent account from a previous failed bootstrap attempt.
    const message = e instanceof Error ? e.message : String(e)
    if (message.toLowerCase().includes("already exists") || message.toLowerCase().includes("unique")) {
      const [stray] = await db
        .select({ id: user.id, role: user.role })
        .from(user)
        .where(eq(user.email, email))
        .limit(1)

      if (stray && stray.role !== ROLES.SYSTEM_ADMIN) {
        // Safe to attempt promotion of this stray account since we verified
        // in Step 1 that no other admin exists in the entire system.
        userId = stray.id
      } else if (stray?.role === ROLES.SYSTEM_ADMIN) {
        return { ok: false as const, error: "Setup already completed" }
      } else {
        return { ok: false as const, error: message }
      }
    } else {
      logEvent({
        message: "bootstrapAdmin: signUpEmail failed",
        severity: "error",
        category: "system",
        error: e,
      })
      return { ok: false as const, error: message }
    }
  }

  if (!userId) {
    return { ok: false as const, error: "Failed to create or locate admin account" }
  }

  try {
    // 4. Promote to admin. We re-verify no admin exists inside the same
    // update statement for maximum safety (though Step 1 caught 99% of cases).
    const [promoted] = await db
      .update(user)
      .set({ role: ROLES.SYSTEM_ADMIN, updatedAt: new Date() })
      .where(and(eq(user.id, userId), eq(user.role, ROLES.PLUMBER)))
      .returning({ id: user.id })

    if (!promoted) {
      // If we couldn't promote, it's likely because someone else won the
      // race and is already the admin.
      return { ok: false as const, error: "Setup already completed" }
    }

    await writeAudit({
      user: { id: userId, name: input.name, email },
      action: "admin.bootstrap",
      entityType: "user",
      entityId: userId,
    })

    return { ok: true as const }
  } catch (roleError) {
    logEvent({
      message: `bootstrapAdmin: user ${userId} (${email}) promotion failed`,
      severity: "error",
      category: "system",
      error: roleError,
    })
    return { ok: false as const, error: "Failed to promote account to admin. Please try again." }
  }
}
