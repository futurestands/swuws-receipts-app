"use server"

import { db } from "@/lib/db"
import {
  dailyCollectionImport,
  dailyCollectionRecord,
  reconciliationApproval,
  reconciliationException,
  user as userTable,
} from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { hasPermission } from "@/lib/iam"
import { writeAudit } from "@/lib/audit"
import { and, eq, gte, lte, sql, count, desc, sum, ne } from "drizzle-orm"
import { randomUUID } from "crypto"
import { createNotification } from "./notifications"
import { revalidatePath } from "next/cache"

/**
 * RECONCILIATION APPROVAL WORKFLOW (Phase 4B)
 */

export async function submitForReview(batchId: string, comments?: string) {
  const current = await requireUser()
  if (!await hasPermission(current, "reconciliation.run")) throw new Error("Forbidden")

  // Check if approval record exists
  let [approval] = await db
    .select()
    .from(reconciliationApproval)
    .where(eq(reconciliationApproval.batchId, batchId))
    .limit(1)

  const id = approval?.id || randomUUID()

  await db.transaction(async (tx) => {
    if (!approval) {
      await tx.insert(reconciliationApproval).values({
        id,
        batchId,
        approvalStage: 'pending_review',
        comments,
      })
    } else {
      await tx.update(reconciliationApproval)
        .set({ approvalStage: 'pending_review', comments, updatedAt: new Date() })
        .where(eq(reconciliationApproval.id, id))
    }

    await writeAudit({
      user: current,
      action: "reconciliation.approval.submit",
      entityType: "reconciliation_approval",
      entityId: id,
      details: { batchId, comments }
    }, tx)

    // Notify Approvers
    const approvers = await tx.select({ id: userTable.id }).from(userTable).where(eq(userTable.role, 'admin'))
    for (const app of approvers) {
      await createNotification({
        userId: app.id,
        type: "approval_pending",
        title: "Reconciliation Awaiting Sign-off",
        message: `Batch ${batchId.split('-')[0]} has been submitted for review.`,
        priority: "high",
        relatedEntityType: "daily_collection_import",
        relatedEntityId: batchId
      }, tx)
    }
  })

  revalidatePath(`/dashboard/billing/daily/${batchId}`)
  return { ok: true }
}

export async function approveBatch(batchId: string, comments?: string) {
  const current = await requireUser()
  if (!await hasPermission(current, "reconciliation.approve")) throw new Error("Forbidden")

  // 1. All critical exceptions for this batch must be resolved
  const [critical] = await db
    .select({ count: count() })
    .from(reconciliationException)
    .innerJoin(dailyCollectionRecord, eq(reconciliationException.dailyCollectionRecordId, dailyCollectionRecord.id))
    .where(and(
      eq(dailyCollectionRecord.batchId, batchId),
      eq(reconciliationException.priority, 'critical'),
      ne(reconciliationException.status, 'resolved')
    ))

  if (Number(critical?.count || 0) > 0) {
    throw new Error("Cannot approve batch with unresolved critical exceptions.")
  }

  await db.transaction(async (tx) => {
    await tx.update(reconciliationApproval)
      .set({
        approvalStage: 'approved',
        approvedById: current.id,
        approvedAt: new Date(),
        comments,
        updatedAt: new Date()
      })
      .where(eq(reconciliationApproval.batchId, batchId))

    await writeAudit({
      user: current,
      action: "reconciliation.approval.approve",
      entityType: "reconciliation_approval",
      entityId: batchId,
      details: { comments }
    }, tx)
  })

  revalidatePath(`/dashboard/billing/daily/${batchId}`)
  return { ok: true }
}

export async function reopenBatch(batchId: string, comments?: string) {
  const current = await requireUser()
  if (!await hasPermission(current, "reconciliation.approve")) throw new Error("Forbidden")

  await db.transaction(async (tx) => {
    await tx.update(reconciliationApproval)
      .set({
        approvalStage: 'reopened',
        reopenedById: current.id,
        reopenedAt: new Date(),
        comments,
        updatedAt: new Date()
      })
      .where(eq(reconciliationApproval.batchId, batchId))

    await writeAudit({
      user: current,
      action: "reconciliation.approval.reopen",
      entityType: "reconciliation_approval",
      entityId: batchId,
      details: { comments }
    }, tx)
  })

  revalidatePath(`/dashboard/billing/daily/${batchId}`)
  return { ok: true }
}

export async function getBatchApprovalStatus(batchId: string) {
  const [approval] = await db
    .select({
      id: reconciliationApproval.id,
      stage: reconciliationApproval.approvalStage,
      comments: reconciliationApproval.comments,
      approvedAt: reconciliationApproval.approvedAt,
      approvedByName: sql<string | null>`(SELECT name FROM "user" WHERE id = ${reconciliationApproval.approvedById})`,
      reopenedAt: reconciliationApproval.reopenedAt,
      reopenedByName: sql<string | null>`(SELECT name FROM "user" WHERE id = ${reconciliationApproval.reopenedById})`,
    })
    .from(reconciliationApproval)
    .where(eq(reconciliationApproval.batchId, batchId))
    .limit(1)

  return approval || null
}
