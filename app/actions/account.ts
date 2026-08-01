"use server"

import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

/**
 * Updates the current user's interface preferences (e.g. vibration).
 */
export async function updateUserPreferences(preferences: { vibrationEnabled: boolean }) {
  const current = await requireUser()

  await db
    .update(user)
    .set({
      preferences,
      updatedAt: new Date()
    })
    .where(eq(user.id, current.id))

  revalidatePath("/dashboard/account")
  return { ok: true as const }
}
