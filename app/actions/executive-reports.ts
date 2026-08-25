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
  meterReading,
  customer,
  waterScheme,
} from "@/lib/db/schema"
import { requireUser, SessionUser } from "@/lib/session"
import { hasPermission } from "@/lib/iam"
import { applyReceiptScope, applyCustomerScope } from "@/lib/scopes"
import { and, eq, gte, lte, sql, desc, ilike, notInArray } from "drizzle-orm"
import { writeAudit } from "@/lib/audit"

/**
 * EXECUTIVE REPORTING ENGINE (Phase 5A)
 *
 * Provides scope-aware data retrieval for standardized reports with strict typing.
 */

export interface ReportFilters {
  [key: string]: string | undefined
  startDate?: string
  endDate?: string
  batchId?: string
  status?: string
  type?: string
  userId?: string
  action?: string
}

export async function getReportData(id: string, filters: ReportFilters) {
  const current = await requireUser()
  if (!(await hasPermission(current, "reports.view"))) throw new Error("Forbidden")

  // Log report generation
  await writeAudit({
    user: current,
    action: `report.generate.${id}`,
    entityType: "report",
    entityId: id,
    details: filters,
  })

  switch (id) {
    case "receipt-activity":
      return getReceiptActivity(current, filters)
    case "daily-collection":
      return getDailyCollectionSummary(filters)
    case "recon-report":
      return getReconciliationReport(filters)
    case "exception-register":
      return getExceptionRegister(filters)
    case "approval-register":
      return getApprovalRegister()
    case "import-history":
      return getImportHistory(filters)
    case "audit-activity":
      return getAuditActivity(filters)
    case "meter-reading":
      return getMeterReadingReport(current, filters)
    case "unbilled-accounts":
      return getUnbilledReport(current, filters)
    default:
      throw new Error("Report not implemented")
  }
}

async function getReceiptActivity(user: SessionUser, filters: ReportFilters) {
  const conditions = []
  if (filters.startDate) {
    conditions.push(gte(receipt.paymentDate, new Date(filters.startDate)))
  }
  if (filters.endDate) {
    const end = new Date(filters.endDate)
    end.setHours(23, 59, 59, 999)
    conditions.push(lte(receipt.paymentDate, end))
  }

  const scope = applyReceiptScope(user)
  if (scope) conditions.push(scope)

  return db
    .select({
      id: receipt.id,
      receiptNumber: receipt.receiptNumber,
      customer: receipt.customerName,
      amount: receipt.amount,
      date: receipt.paymentDate,
      method: receipt.paymentMethod,
      agent: receipt.agentName,
      status: receipt.reconciliationStatus,
    })
    .from(receipt)
    .where(and(...conditions))
    .orderBy(desc(receipt.paymentDate))
}

async function getDailyCollectionSummary(filters: ReportFilters) {
  const conditions = []
  if (filters.startDate) {
    const start = new Date(filters.startDate)
    start.setHours(0, 0, 0, 0)
    conditions.push(gte(dailyCollectionImport.businessDate, start))
  }
  if (filters.endDate) {
    const end = new Date(filters.endDate)
    end.setHours(23, 59, 59, 999)
    conditions.push(lte(dailyCollectionImport.businessDate, end))
  }

  return db
    .select({
      date: dailyCollectionImport.businessDate,
      totalBilled: dailyCollectionImport.totalAmount,
      totalConfirmed: sql<number>`(SELECT coalesce(sum(amount), 0) FROM daily_collection_record WHERE "batchId" = ${dailyCollectionImport.id})`,
      receiptsValue: sql<number>`(SELECT coalesce(sum(amount), 0) FROM receipt WHERE date("paymentDate") = date(${dailyCollectionImport.businessDate}))`,
      matchedValue: sql<number>`(SELECT coalesce(sum(r.amount), 0) FROM receipt r INNER JOIN reconciliation_match m ON r.id = m."receiptId" INNER JOIN daily_collection_record cr ON m."dailyCollectionRecordId" = cr.id WHERE cr."batchId" = ${dailyCollectionImport.id})`,
      status: dailyCollectionImport.status,
    })
    .from(dailyCollectionImport)
    .where(and(...conditions))
    .orderBy(desc(dailyCollectionImport.businessDate))
}

async function getReconciliationReport(filters: ReportFilters) {
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

async function getExceptionRegister(filters: ReportFilters) {
  const conditions = []
  if (filters.status && filters.status !== "all")
    conditions.push(eq(reconciliationException.status, filters.status))
  if (filters.type && filters.type !== "all")
    conditions.push(eq(reconciliationException.exceptionType, filters.type))

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
    .leftJoin(
      dailyCollectionRecord,
      eq(reconciliationException.dailyCollectionRecordId, dailyCollectionRecord.id),
    )
    .where(and(...conditions))
    .orderBy(desc(reconciliationException.createdAt))
}

async function getApprovalRegister() {
  return db
    .select({
      batchId: reconciliationApproval.batchId,
      stage: reconciliationApproval.approvalStage,
      comments: reconciliationApproval.comments,
      approvedAt: reconciliationApproval.approvedAt,
      businessDate: dailyCollectionImport.businessDate,
      fileName: dailyCollectionImport.filename,
    })
    .from(reconciliationApproval)
    .innerJoin(dailyCollectionImport, eq(reconciliationApproval.batchId, dailyCollectionImport.id))
    .orderBy(desc(reconciliationApproval.createdAt))
}

async function getImportHistory(filters: ReportFilters) {
  const conditions = []
  if (filters.startDate) {
    const start = new Date(filters.startDate)
    start.setHours(0, 0, 0, 0)
    conditions.push(gte(dailyCollectionImport.businessDate, start))
  }
  if (filters.endDate) {
    const end = new Date(filters.endDate)
    end.setHours(23, 59, 59, 999)
    conditions.push(lte(dailyCollectionImport.businessDate, end))
  }

  return db
    .select()
    .from(dailyCollectionImport)
    .where(and(...conditions))
    .orderBy(desc(dailyCollectionImport.businessDate))
}

async function getAuditActivity(filters: ReportFilters) {
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

async function getMeterReadingReport(user: SessionUser, filters: ReportFilters) {
  const conditions = []

  if (filters.startDate) {
    const start = new Date(filters.startDate)
    start.setHours(0, 0, 0, 0)
    conditions.push(gte(meterReading.createdAt, start))
  }

  if (filters.endDate) {
    const end = new Date(filters.endDate)
    end.setHours(23, 59, 59, 999)
    conditions.push(lte(meterReading.createdAt, end))
  }

  // Apply scope
  const scope = applyReceiptScope(user)
  if (scope) conditions.push(scope)

  return db
    .select({
      customerRefNo: meterReading.customerAccountSnapshot,
      customerPhoneNumber: meterReading.phoneSnapshot,
      customerName: meterReading.customerNameSnapshot,
      billingPeriod: billingPeriod.periodName,
      outstandingBalance: meterReading.totalDueSnapshot,
      recordedBy: sql<string>`(SELECT name FROM "user" WHERE id = ${meterReading.recordedById})`,
      capturedAt: meterReading.createdAt,
    })
    .from(meterReading)
    .innerJoin(billingPeriod, eq(meterReading.billingPeriodId, billingPeriod.id))
    .where(and(...conditions))
    .orderBy(desc(meterReading.createdAt))
}

async function getUnbilledReport(user: SessionUser, filters: ReportFilters) {
  const periodId = filters.periodId || filters.batchId; // Use batchId as fallback if the UI passes it
  if (!periodId) throw new Error("Billing Period is required for this report");

  // Apply scope
  const scope = applyCustomerScope(user);

  // Subquery to find customers who have readings in this period
  const meteredIds = db
    .select({ customerId: meterReading.customerId })
    .from(meterReading)
    .where(eq(meterReading.billingPeriodId, periodId));

  const conditions = [
    notInArray(customer.id, meteredIds),
    eq(customer.active, true)
  ];
  if (scope) conditions.push(scope);

  return db
    .select({
      customerAccount: customer.customerAccount,
      name: customer.name,
      phone: customer.phone,
      scheme: waterScheme.name,
      balance: customer.accountBalance,
    })
    .from(customer)
    .leftJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
    .where(and(...conditions))
    .orderBy(customer.customerAccount);
}
