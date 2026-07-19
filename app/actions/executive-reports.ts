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
import { and, eq, gte, lte, sql, count, desc, sum, ne, ilike, or } from "drizzle-orm"
import { writeAudit } from "@/lib/audit"

/**
 * EXECUTIVE REPORTING ENGINE (Phase 5A)
 *
 * Provides scope-aware data retrieval for standardized reports.
 */

export async function getReportData(id: string, filters: any) {
  const current = await requireUser()
  if (!await hasPermission(current, "reports.view")) throw new Error("Forbidden")

  // Log report generation
  await writeAudit({
    user: current,
    action: `report.generate.${id}`,
    entityType: "report",
    entityId: id,
    details: filters
  })

  switch (id) {
    case "receipt-activity":
      return getReceiptActivity(current, filters)
    case "daily-collection":
      return getDailyCollectionSummary(current, filters)
    case "recon-report":
      return getReconciliationReport(current, filters)
    case "exception-register":
      return getExceptionRegister(current, filters)
    case "approval-register":
      return getApprovalRegister(current, filters)
    case "import-history":
      return getImportHistory(current, filters)
    case "audit-activity":
      return getAuditActivity(current, filters)
    default:
      throw new Error("Report not implemented")
  }
}

async function getReceiptActivity(user: any, filters: any) {
  // ... existing code ...
}

async function getDailyCollectionSummary(user: any, filters: any) {
  const conditions = []
  if (filters.startDate) conditions.push(gte(dailyCollectionImport.businessDate, new Date(filters.startDate)))
  if (filters.endDate) conditions.push(lte(dailyCollectionImport.businessDate, new Date(filters.endDate)))

  return db
    .select({
      date: dailyCollectionImport.businessDate,
      totalBilled: dailyCollectionImport.totalAmount,
      totalConfirmed: sql<number>`(SELECT coalesce(sum(amount), 0) FROM daily_collection_record WHERE "batchId" = ${dailyCollectionImport.id})`,
      receiptsValue: sql<number>`(SELECT coalesce(sum(amount), 0) FROM receipt WHERE date("paymentDate") = date(${dailyCollectionImport.businessDate}))`,
      matchedValue: sql<number>`(SELECT coalesce(sum(r.amount), 0) FROM receipt r INNER JOIN reconciliation_match m ON r.id = m."receiptId" INNER JOIN daily_collection_record cr ON m."dailyCollectionRecordId" = cr.id WHERE cr."batchId" = ${dailyCollectionImport.id})`,
      status: dailyCollectionImport.status
    })
    .from(dailyCollectionImport)
    .where(and(...conditions))
    .orderBy(desc(dailyCollectionImport.businessDate))
}

async function getReconciliationReport(user: any, filters: any) {
  const conditions = []
  if (filters.batchId) conditions.push(eq(dailyCollectionImport.id, filters.batchId))

  return db
    .select({
      id: reconciliationMatch.id,
      method: reconciliationMatch.matchMethod,
      confidence: reconciliationMatch.confidenceScore,
      matchedAt: reconciliationMatch.matchedAt,
      receiptNumber: receipt.receiptNumber,
      customer: receipt.customerName,
      amount: receipt.amount,
    })
    .from(reconciliationMatch)
    .innerJoin(receipt, eq(reconciliationMatch.receiptId, receipt.id))
    .where(and(...conditions))
    .orderBy(desc(reconciliationMatch.matchedAt))
}

async function getExceptionRegister(user: any, filters: any) {
  const conditions = []
  if (filters.status && filters.status !== 'all') conditions.push(eq(reconciliationException.status, filters.status))
  if (filters.type && filters.type !== 'all') conditions.push(eq(reconciliationException.exceptionType, filters.type))

  return db
    .select({
      id: reconciliationException.id,
      type: reconciliationException.exceptionType,
      priority: reconciliationException.priority,
      status: reconciliationException.status,
      customer: sql<string>`coalesce(${receipt.customerName}, ${dailyCollectionRecord.customerName})`,
      amount: sql<number>`coalesce(${receipt.amount}, ${dailyCollectionRecord.amount})`,
      date: reconciliationException.createdAt,
      resolution: reconciliationException.resolution,
    })
    .from(reconciliationException)
    .leftJoin(receipt, eq(reconciliationException.receiptId, receipt.id))
    .leftJoin(dailyCollectionRecord, eq(reconciliationException.dailyCollectionRecordId, dailyCollectionRecord.id))
    .where(and(...conditions))
    .orderBy(desc(reconciliationException.createdAt))
}

async function getApprovalRegister(user: any, filters: any) {
  return db
    .select({
      batchId: reconciliationApproval.batchId,
      stage: reconciliationApproval.approvalStage,
      comments: reconciliationApproval.comments,
      approvedAt: reconciliationApproval.approvedAt,
      businessDate: dailyCollectionImport.businessDate,
      fileName: dailyCollectionImport.filename
    })
    .from(reconciliationApproval)
    .innerJoin(dailyCollectionImport, eq(reconciliationApproval.batchId, dailyCollectionImport.id))
    .orderBy(desc(reconciliationApproval.createdAt))
}

async function getImportHistory(user: any, filters: any) {
  const conditions = []
  if (filters.startDate) conditions.push(gte(dailyCollectionImport.businessDate, new Date(filters.startDate)))
  if (filters.endDate) conditions.push(lte(dailyCollectionImport.businessDate, new Date(filters.endDate)))

  return db
    .select()
    .from(dailyCollectionImport)
    .where(and(...conditions))
    .orderBy(desc(dailyCollectionImport.businessDate))
}

async function getAuditActivity(user: any, filters: any) {
  const conditions = []
  if (filters.userId) conditions.push(eq(auditLog.userId, filters.userId))
  if (filters.action) conditions.push(ilike(auditLog.action, `%${filters.action}%`))

  return db
    .select()
    .from(auditLog)
    .where(and(...conditions))
    .orderBy(desc(auditLog.createdAt))
    .limit(500)
}
