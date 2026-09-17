"use server"

import { and, count, desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { systemError } from "@/lib/db/schema"
import { getCurrentUser, requireUser } from "@/lib/session"
import { canAudit } from "@/lib/permissions"
import { recordSystemError } from "@/lib/system-errors"

export async function reportClientError(input: {
  message: string
  digest?: string
  stack?: string
  path?: string
  source?: string
}) {
  try {
    const current = await getCurrentUser()
    await recordSystemError({
      message: input.message,
      digest: input.digest,
      stack: input.stack,
      path: input.path,
      source: input.source || "client",
      user: current
        ? { id: current.id, name: current.name, email: current.email, role: current.role }
        : null,
    })
  } catch {
    // The page already failed. Do not throw from the reporter.
  }
}

export async function getOpenSystemErrorCount() {
  const current = await getCurrentUser()
  if (!current || !canAudit(current)) return 0
  const [row] = await db
    .select({ n: count() })
    .from(systemError)
    .where(eq(systemError.status, "open"))
  return Number(row?.n || 0)
}

export async function listSystemErrors(status: string = "open") {
  const current = await requireUser()
  if (!canAudit(current)) throw new Error("Forbidden")

  const allowed = ["open", "acknowledged", "resolved", "all"]
  const filter = allowed.includes(status) ? status : "open"
  const ordered = db
    .select()
    .from(systemError)
    .orderBy(desc(systemError.lastSeenAt))
    .limit(200)

  if (filter === "all") return ordered
  return db
    .select()
    .from(systemError)
    .where(eq(systemError.status, filter))
    .orderBy(desc(systemError.lastSeenAt))
    .limit(200)
}

export async function setSystemErrorStatus(
  id: string,
  status: "acknowledged" | "resolved" | "open"
) {
  const current = await requireUser()
  if (!canAudit(current)) throw new Error("Forbidden")

  await db
    .update(systemError)
    .set({
      status,
      resolvedAt: status === "resolved" ? new Date() : null,
      resolvedById: status === "resolved" ? current.id : null,
    })
    .where(and(eq(systemError.id, id)))

  revalidatePath("/admin/errors")
  revalidatePath("/admin")
  return { ok: true }
}
