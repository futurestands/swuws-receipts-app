"use server"

import { db } from "@/lib/db"
import {
  dailyCollectionRecord,
  dailyCollectionImport,
  reconciliationApproval,
  reconciliationException,
  user as userTable,
  iamRolePermission,
  iamPermission,
} from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { hasPermission } from "@/lib/iam"
import { ROLES } from "@/lib/permissions/roles"
import { writeAudit } from "@/lib/audit"
import { and, eq, sql, count, or, ne, inArray } from "drizzle-orm"
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
  const [approval] = await db
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

    // Notify Approvers (Aug 26 Hardening): Align with IAM permissions.
    // We notify System Admins + any user whose IAM Role carries 'reconciliation.approve'.
    const approvers = await tx
      .select({ id: userTable.id })
      .from(userTable)
      .leftJoin(iamRolePermission, eq(userTable.iamRoleId, iamRolePermission.roleId))
      .leftJoin(iamPermission, eq(iamRolePermission.permissionId, iamPermission.id))
      .where(and(
        eq(userTable.active, true),
        or(
          eq(userTable.role, ROLES.SYSTEM_ADMIN),
          eq(iamPermission.code, 'reconciliation.approve')
        )
      ))

    // Deduplicate IDs (one user might have multiple paths to the permission)
    const approverIds = Array.from(new Set(approvers.map(a => a.id)))

    for (const appID of approverIds) {
      await createNotification({
        userId: appID,
        type: "approval_pending",
        title: "Reconciliation Sign-off Required",
        message: `Batch ${batchId.split('-')[0]} is ready for review and final sign-off.`,
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

  // Load Batch Metadata
  const [batch] = await db
    .select({ id: dailyCollectionImport.id, uploadedById: dailyCollectionImport.uploadedById })
    .from(dailyCollectionImport)
    .where(eq(dailyCollectionImport.id, batchId))
    .limit(1)

  if (!batch) throw new Error("Batch not found")
  if (current.id === batch.uploadedById) {
    throw new Error("You cannot approve a batch you submitted")
  }

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
  const current = await requireUser()
  if (!await hasPermission(current, "reconciliation.view")) throw new Error("Forbidden")

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
