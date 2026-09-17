import "server-only"

import { randomUUID } from "crypto"
import { and, eq, gte, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { iamRole, notification, systemError, user } from "@/lib/db/schema"
import { isUniqueViolation } from "@/lib/db/errors"
import { ROLES } from "@/lib/permissions/roles"
import type { SessionUser } from "@/lib/session"
import { errorFingerprint, shouldIgnoreSystemError } from "@/lib/system-error-fingerprint"
import { mergeSeenBy, type ErrorSeenBy } from "@/lib/system-error-seen-by"

export { errorFingerprint, shouldIgnoreSystemError }

export type SystemErrorInput = {
  message: string
  digest?: string | null
  stack?: string | null
  path?: string | null
  source?: string
  user?: Pick<SessionUser, "id" | "name" | "email" | "role"> | null
}

function clip(value: string | null | undefined, max: number) {
  if (!value) return null
  return value.length > max ? value.slice(0, max) : value
}

/**
 * Persist a crash for the admin errors page. Never throws: recording a
 * fault must not take down the page that already failed.
 */
export async function recordSystemError(input: SystemErrorInput): Promise<string | null> {
  try {
    const message = clip(input.message, 500)
    if (!message || shouldIgnoreSystemError(message)) return null

    const fingerprint = errorFingerprint({
      message,
      path: input.path,
      digest: input.digest,
    })
    const now = new Date()
    const existing = await db
      .select({
        id: systemError.id,
        status: systemError.status,
        seenBy: systemError.seenBy,
      })
      .from(systemError)
      .where(eq(systemError.fingerprint, fingerprint))
      .limit(1)
      .then((rows) => rows[0])

    const person: ErrorSeenBy | null = input.user
      ? {
          id: input.user.id,
          name: input.user.name,
          email: input.user.email || null,
          role: input.user.role || null,
        }
      : null

    if (existing) {
      const reopen = existing.status === "resolved"
      await db
        .update(systemError)
        .set({
          occurrenceCount: sql`${systemError.occurrenceCount} + 1`,
          lastSeenAt: now,
          message,
          digest: clip(input.digest, 120),
          stack: clip(input.stack, 4000) || undefined,
          path: clip(input.path, 300),
          source: input.source || "client",
          userId: person?.id,
          userName: person?.name,
          userEmail: person?.email,
          seenBy: mergeSeenBy(existing.seenBy, person),
          status: reopen ? "open" : existing.status,
          resolvedAt: reopen ? null : undefined,
          resolvedById: reopen ? null : undefined,
        })
        .where(eq(systemError.id, existing.id))
      if (reopen) await notifyAdmins(existing.id, message, input.path, person?.name)
      return existing.id
    }

    const id = randomUUID()
    try {
      await db.insert(systemError).values({
        id,
        fingerprint,
        message,
        digest: clip(input.digest, 120),
        stack: clip(input.stack, 4000),
        path: clip(input.path, 300),
        source: input.source || "client",
        userId: person?.id || null,
        userName: person?.name || null,
        userEmail: person?.email || null,
        seenBy: mergeSeenBy([], person),
        occurrenceCount: 1,
        status: "open",
        firstSeenAt: now,
        lastSeenAt: now,
      })
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
      const raced = await db
        .select({ id: systemError.id })
        .from(systemError)
        .where(eq(systemError.fingerprint, fingerprint))
        .limit(1)
        .then((rows) => rows[0])
      return raced?.id || null
    }

    await notifyAdmins(id, message, input.path, person?.name)
    return id
  } catch (err) {
    console.error("[system-error] failed to record", err)
    return null
  }
}

async function notifyAdmins(
  errorId: string,
  message: string,
  path?: string | null,
  who?: string | null
) {
  try {
    const recipients = await db
      .selectDistinct({ id: user.id })
      .from(user)
      .leftJoin(iamRole, eq(user.iamRoleId, iamRole.id))
      .where(
        and(
          eq(user.active, true),
          or(eq(user.role, ROLES.SYSTEM_ADMIN), gte(iamRole.level, 10))
        )
      )

    if (recipients.length === 0) return

    const whoBit = who ? `${who} hit: ` : ""
    const body = path ? `${whoBit}${message} (${path})` : `${whoBit}${message}`

    await db.insert(notification).values(
      recipients.map((row) => ({
        id: randomUUID(),
        userId: row.id,
        type: "system.error",
        title: "System error recorded",
        message: body.slice(0, 400),
        relatedEntityType: "system_error",
        relatedEntityId: errorId,
        priority: "high" as const,
        status: "unread",
        createdAt: new Date(),
      }))
    )
  } catch (err) {
    console.error("[system-error] failed to notify admins", err)
  }
}
