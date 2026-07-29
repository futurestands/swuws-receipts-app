"use server"

import { db } from "@/lib/db"
import {
  receipt,
  dailyCollectionImport,
  dailyCollectionRecord,
  reconciliationMatch,
  reconciliationException,
  reconciliationApproval,
  billingPeriod,
  auditLog,
} from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { hasPermission } from "@/lib/iam"
import { applyReceiptScope, applyBillingScope } from "@/lib/scopes"
import { and, eq, gte, lte, sql, count, desc, sum, ne } from "drizzle-orm"

/**
 * FINANCIAL OPERATIONS ANALYTICS (Phase 4A)
 *
 * Provides aggregated KPIs and health metrics for the
 * Reconciliation Control Center.
 */

export async function getFinancialOpsDashboard() {
  const current = await requireUser()
  if (!await hasPermission(current, "reconciliation.view")) throw new Error("Forbidden")

  const receiptScope = applyReceiptScope(current)
  const billingScope = applyBillingScope(current)

  // Subquery to exclude voided receipts
  const voidedIds = db
    .select({ id: auditLog.entityId })
    .from(auditLog)
    .where(eq(auditLog.action, "receipt.void"))

  // 1. Executive Summary: Active Period Context
  const [activePeriod] = await db
    .select()
    .from(billingPeriod)
    .where(eq(billingPeriod.status, 'active'))
    .limit(1)

  // 2. Reconciliation KPIs
  const baseConditions = [sql`${receipt.id} NOT IN (${voidedIds})`]
  if (receiptScope) baseConditions.push(receiptScope)

  const reconStats = await db
    .select({
      totalReceipts: count(receipt.id),
      matchedReceipts: sql<number>`count(case when ${receipt.reconciliationStatus} = 'matched' then 1 end)::int`,
      totalValue: sum(receipt.amount),
    })
    .from(receipt)
    .where(and(...baseConditions))

  // 3. Exception Analytics
  const exceptionStats = await db
    .select({
      open: sql<number>`count(case when ${reconciliationException.status} = 'open' then 1 end)::int`,
      review: sql<number>`count(case when ${reconciliationException.status} = 'under_review' then 1 end)::int`,
      escalated: sql<number>`count(case when ${reconciliationException.status} = 'escalated' then 1 end)::int`,
      resolvedToday: sql<number>`count(case when date(${reconciliationException.resolvedAt}) = current_date then 1 end)::int`,
    })
    .from(reconciliationException)

  // 4. Import Health (Last 30 Days)
  const importStats = await db
    .select({
      total: count(),
      failed: sql<number>`count(case when ${dailyCollectionImport.status} = 'failed' then 1 end)::int`,
      avgDuration: sql<number>`avg(${dailyCollectionImport.processingDuration})::int`,
    })
    .from(dailyCollectionImport)

  // 5. Match Confidence Distribution
  const confidenceBreakdown = await db
    .select({
      method: reconciliationMatch.matchMethod,
      count: count()
    })
    .from(reconciliationMatch)
    .groupBy(reconciliationMatch.matchMethod)

  const totalReceiptsCount = Number(reconStats[0]?.totalReceipts || 0)
  const matchedReceiptsCount = Number(reconStats[0]?.matchedReceipts || 0)
  const reconRate = totalReceiptsCount > 0 ? (matchedReceiptsCount / totalReceiptsCount) * 100 : 0

  return {
    activePeriod,
    summary: {
      totalReceipts: totalReceiptsCount,
      matchedReceipts: matchedReceiptsCount,
      reconRate,
      totalValue: Number(reconStats[0]?.totalValue || 0),
    },
    exceptions: exceptionStats[0],
    imports: importStats[0],
    confidence: confidenceBreakdown,
    approvals: await db.select({
      stage: reconciliationApproval.approvalStage,
      count: count(),
      oldestPending: sql<Date>`min(case when ${reconciliationApproval.approvalStage} = 'pending_review' then ${reconciliationApproval.createdAt} end)`,
    }).from(reconciliationApproval).groupBy(reconciliationApproval.approvalStage)
  }
}
