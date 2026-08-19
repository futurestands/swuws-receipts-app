"use server"

import { db } from "@/lib/db"
import { notification, user as userTable } from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { hasPermission } from "@/lib/iam"
import { eq, and, desc, sql, count } from "drizzle-orm"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import type { PgTransaction } from "drizzle-orm/pg-core"
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js"

/**
 * OPERATIONAL NOTIFICATIONS (Phase 5B)
 */

export async function getNotifications(limit = 20) {
  try {
    const current = await requireUser()

    return db
      .select()
      .from(notification)
      .where(and(
        eq(notification.userId, current.id),
        eq(notification.status, 'unread')
      ))
      .orderBy(desc(notification.createdAt))
      .limit(limit)
  } catch (e) {
    return []
  }
}

export async function getUnreadCount() {
  try {
    const current = await requireUser()
    const [result] = await db
      .select({ count: count() })
      .from(notification)
      .where(and(
        eq(notification.userId, current.id),
        eq(notification.status, 'unread')
      ))
    return Number(result?.count || 0)
  } catch (e) {
    // Gracefully handle unauthenticated state (common during session expiry or DB switch)
    return 0
  }
}

export async function markAsRead(id: string) {
  const current = await requireUser()
  await db.update(notification)
    .set({ status: 'read', readAt: new Date() })
    .where(and(
      eq(notification.id, id),
      eq(notification.userId, current.id)
    ))
  revalidatePath("/")
  return { ok: true }
}

export async function markAllAsRead() {
  const current = await requireUser()
  await db.update(notification)
    .set({ status: 'read', readAt: new Date() })
    .where(and(
      eq(notification.userId, current.id),
      eq(notification.status, 'unread')
    ))
  revalidatePath("/")
  return { ok: true }
}

/**
 * Internal utility to create notifications.
 */
export async function createNotification(data: {
  userId: string
  type: string
  title: string
  message: string
  priority?: "critical" | "high" | "normal" | "low"
  relatedEntityType?: string
  relatedEntityId?: string
}, tx: any = db) {
  const current = await requireUser()
  const authorized =
    (await hasPermission(current, "reconciliation.run")) ||
    (await hasPermission(current, "reconciliation.approve")) ||
    (await hasPermission(current, "branding.manage")) ||
    (await hasPermission(current, "collection.view"))

  if (!authorized) throw new Error("Forbidden")

  const id = randomUUID()
  await tx.insert(notification).values({
    id,
    ...data,
    priority: data.priority || "normal",
    status: "unread",
    createdAt: new Date(),
  })
  return id
}
