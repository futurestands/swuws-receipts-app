"use server"

import { db } from "@/lib/db"
import {
  receipt,
  dailyCollectionImport,
  dailyCollectionRecord,
  reconciliationMatch,
  reconciliationException,
  reconciliationApproval,
  user as userTable,
  billingRecord,
  billingPeriod,
} from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { hasPermission } from "@/lib/iam"
import { writeAudit } from "@/lib/audit"
import { and, eq, gte, lte, sql, inArray, count, desc, asc, notInArray, ne } from "drizzle-orm"
import { randomUUID } from "crypto"
import { createNotification } from "./notifications"
import { revalidatePath } from "next/cache"
import { logFinancial, logSecurity } from "@/lib/logger"

/**
 * AUTOMATED RECONCILIATION ENGINE (Phase 3A)
 */

export async function runReconciliation(batchId: string) {
  const current = await requireUser()
  if (!await hasPermission(current, "reconciliation.run")) throw new Error("Forbidden")

  const startTime = Date.now()

  // 1. Load Batch Metadata
  const [batch] = await db
    .select()
    .from(dailyCollectionImport)
    .where(eq(dailyCollectionImport.id, batchId))
    .limit(1)
  if (!batch) throw new Error("Import batch not found")

  // Check if batch is locked (Approved)
  const [approval] = await db
    .select({ stage: reconciliationApproval.approvalStage })
    .from(reconciliationApproval)
    .where(eq(reconciliationApproval.batchId, batchId))
    .limit(1)

  if (approval?.stage === 'approved') {
    throw new Error("This batch has been officially approved and locked. Reopen the batch to run reconciliation again.")
  }

  // 2. Load Unmatched Records from EBS Batch
  const records = await db
    .select()
    .from(dailyCollectionRecord)
    .where(and(
      eq(dailyCollectionRecord.batchId, batchId),
      eq(dailyCollectionRecord.importStatus, 'imported')
    ))

  if (records.length === 0) {
    return { ok: true, matched: 0, msg: "No imported records available for reconciliation in this batch." }
  }

  // 3. Load Unmatched Receipts for the Business Date (±1 day window)
  const businessDate = new Date(batch.businessDate)
  const windowStart = new Date(businessDate)
  windowStart.setDate(windowStart.getDate() - 1)
  const windowEnd = new Date(businessDate)
  windowEnd.setDate(windowEnd.getDate() + 1)

  const receipts = await db
    .select()
    .from(receipt)
    .where(and(
      gte(receipt.paymentDate, windowStart),
      lte(receipt.paymentDate, windowEnd),
      eq(receipt.reconciliationStatus, 'pending')
    ))

  const matches: {
    id: string;
    receiptId: string;
    dailyCollectionRecordId: string;
    matchMethod: string;
    confidenceScore: number
  }[] = []

  const matchedRecordIds = new Set<string>()
  const matchedReceiptIds = new Set<string>()

  // STAGE 1: Exact Reference Match (100% Confidence)
  for (const record of records) {
    const r = receipts.find(receipt =>
      !matchedReceiptIds.has(receipt.id) &&
      receipt.paymentReference === record.externalReference
    )
    if (r) {
      matches.push({
        id: randomUUID(),
        receiptId: r.id,
        dailyCollectionRecordId: record.id,
        matchMethod: 'exact_reference',
        confidenceScore: 100
      })
      matchedRecordIds.add(record.id)
      matchedReceiptIds.add(r.id)
    }
  }

  // STAGE 2: Customer + Amount + Date Match (95% Confidence)
  for (const record of records) {
    if (matchedRecordIds.has(record.id)) continue

    const r = receipts.find(receipt =>
      !matchedReceiptIds.has(receipt.id) &&
      receipt.customerAccount === record.accountNumber &&
      receipt.amount === record.amount &&
      new Date(receipt.paymentDate).toDateString() === new Date(record.paymentDate).toDateString()
    )
    if (r) {
      matches.push({
        id: randomUUID(),
        receiptId: r.id,
        dailyCollectionRecordId: record.id,
        matchMethod: 'account_amount_date',
        confidenceScore: 95
      })
      matchedRecordIds.add(record.id)
      matchedReceiptIds.add(r.id)
    }
  }

  // STAGE 3: Customer + Amount + Channel Match (90% Confidence)
  for (const record of records) {
    if (matchedRecordIds.has(record.id)) continue

    const r = receipts.find(receipt =>
      !matchedReceiptIds.has(receipt.id) &&
      receipt.customerAccount === record.accountNumber &&
      receipt.amount === record.amount &&
      receipt.paymentMethod.toLowerCase() === record.paymentChannel.toLowerCase()
    )
    if (r) {
      matches.push({
        id: randomUUID(),
        receiptId: r.id,
        dailyCollectionRecordId: record.id,
        matchMethod: 'account_amount_channel',
        confidenceScore: 90
      })
      matchedRecordIds.add(record.id)
      matchedReceiptIds.add(r.id)
    }
  }

  // 4. Persist Matches Transactionally
  try {
    if (matches.length > 0) {
      await db.transaction(async (tx) => {
        // Save matches
        const CHUNK_SIZE = 1000
        for (let i = 0; i < matches.length; i += CHUNK_SIZE) {
          await tx.insert(reconciliationMatch).values(matches.slice(i, i + CHUNK_SIZE).map(m => ({
            ...m,
            matchedById: current.id,
            status: 'matched'
          })))
        }

        // Update Receipt Statuses
        await tx.update(receipt)
          .set({ reconciliationStatus: 'matched' })
          .where(inArray(receipt.id, Array.from(matchedReceiptIds)))

        // Update EBS Record Statuses
        await tx.update(dailyCollectionRecord)
          .set({ importStatus: 'matched' })
          .where(inArray(dailyCollectionRecord.id, Array.from(matchedRecordIds)))

        // Update Batch Status
        await tx.update(dailyCollectionImport)
          .set({ status: 'processed', updatedAt: new Date() })
          .where(eq(dailyCollectionImport.id, batchId))

        await writeAudit({
          user: current,
          action: "reconciliation.run",
          entityType: "daily_collection_import",
          entityId: batchId,
          details: {
            matchCount: matches.length,
            duration: Date.now() - startTime,
            receiptsInWindow: receipts.length,
            recordsInBatch: records.length
          }
        }, tx)

        // 5. ARREARS RESOLUTION TRACKING
        // Find matches that involve old billing records (arrears)
        const arrearsMatches = await tx
          .select({ amount: receipt.amount })
          .from(reconciliationMatch)
          .innerJoin(receipt, eq(reconciliationMatch.receiptId, receipt.id))
          .innerJoin(billingRecord, eq(receipt.billingRecordId, billingRecord.id))
          .innerJoin(billingPeriod, eq(billingRecord.billingPeriodId, billingPeriod.id))
          .where(and(
            inArray(reconciliationMatch.id, matches.map(m => m.id)),
            ne(billingPeriod.status, 'active') // Simplified: non-active periods are arrears
          ))

        if (arrearsMatches.length > 0) {
          const totalArrearsResolved = arrearsMatches.reduce((s, m) => s + m.amount, 0)
          await writeAudit({
            user: current,
            action: "financial.arrears_resolved",
            details: {
              batchId,
              matchCount: arrearsMatches.length,
              totalAmount: totalArrearsResolved
            }
          }, tx)
        }

        // 6. AUTO-GENERATE EXCEPTIONS (Phase 3B)
        const unmatchedRecords = records.filter(r => !matchedRecordIds.has(r.id))
        const unmatchedReceipts = receipts.filter(r => !matchedReceiptIds.has(r.id))

        if (unmatchedRecords.length > 0) {
          const recordExceptions = unmatchedRecords.map(r => ({
            id: randomUUID(),
            dailyCollectionRecordId: r.id,
            exceptionType: 'unmatched_payment',
            reason: 'No matching receipt found for confirmed EBS payment',
            priority: r.amount > 500000 ? 'high' : 'medium',
            status: 'open'
          }))
          for (let i = 0; i < recordExceptions.length; i += CHUNK_SIZE) {
            await tx.insert(reconciliationException).values(recordExceptions.slice(i, i + CHUNK_SIZE))
          }

          // Notify Finance of new exceptions
          const financeUsers = await tx.select({ id: userTable.id }).from(userTable).where(eq(userTable.role, 'admin')) // Simplified role check
          for (const fu of financeUsers) {
            await createNotification({
              userId: fu.id,
              type: "new_exceptions",
              title: "Unmatched Collections Found",
              message: `${unmatchedRecords.length} records in batch ${batchId.split('-')[0]} require manual investigation.`,
              priority: "high",
              relatedEntityType: "daily_collection_import",
              relatedEntityId: batchId
            }, tx)
          }
        }

        if (unmatchedReceipts.length > 0) {
          const receiptExceptions = unmatchedReceipts.map(r => ({
            id: randomUUID(),
            receiptId: r.id,
            exceptionType: 'unmatched_receipt',
            reason: 'Issued receipt not found in official EBS daily report',
            priority: r.amount > 500000 ? 'high' : 'medium',
            status: 'open'
          }))
          for (let i = 0; i < receiptExceptions.length; i += CHUNK_SIZE) {
            await tx.insert(reconciliationException).values(receiptExceptions.slice(i, i + CHUNK_SIZE))
          }
        }
      })
    }

    logFinancial("Reconciliation Completed", {
      batchId,
      matched: matches.length,
      unmatched: records.length - matches.length,
      duration: Date.now() - startTime
    }, current)

    revalidatePath(`/dashboard/billing/daily/${batchId}`)
    return {
      ok: true,
      matched: matches.length,
      unmatched: records.length - matches.length,
      duration: Date.now() - startTime
    }
  } catch (err: any) {
    console.error("Reconciliation run failed", err)
    return { ok: false, error: err.message || "A database error occurred during reconciliation." }
  }
}

/**
 * Fetch and paginate reconciliation exceptions.
 */
export async function getExceptions(params: {
  page: number
  limit: number
  search?: string
  status?: string
  priority?: string
  type?: string
}) {
  const current = await requireUser()
  if (!await hasPermission(current, "reconciliation.exceptions.manage")) throw new Error("Forbidden")

  const offset = (params.page - 1) * params.limit
  const conditions = []

  if (params.status && params.status !== 'all') {
    conditions.push(eq(reconciliationException.status, params.status))
  }
  if (params.priority && params.priority !== 'all') {
    conditions.push(eq(reconciliationException.priority, params.priority))
  }
  if (params.type && params.type !== 'all') {
    conditions.push(eq(reconciliationException.exceptionType, params.type))
  }

  // search logic ...

  const [totalResult] = await db
    .select({ count: count() })
    .from(reconciliationException)
    .where(and(...conditions))

  const exceptions = await db
    .select({
      id: reconciliationException.id,
      exceptionType: reconciliationException.exceptionType,
      priority: reconciliationException.priority,
      status: reconciliationException.status,
      createdAt: reconciliationException.createdAt,
      // Joined data
      receiptNumber: receipt.receiptNumber,
      customerName: sql<string>`coalesce(${receipt.customerName}, ${dailyCollectionRecord.customerName})`,
      amount: sql<number>`coalesce(${receipt.amount}, ${dailyCollectionRecord.amount})`,
      businessDate: sql<Date>`coalesce(${receipt.paymentDate}, ${dailyCollectionRecord.paymentDate})`,
    })
    .from(reconciliationException)
    .leftJoin(receipt, eq(reconciliationException.receiptId, receipt.id))
    .leftJoin(dailyCollectionRecord, eq(reconciliationException.dailyCollectionRecordId, dailyCollectionRecord.id))
    .where(and(...conditions))
    .limit(params.limit)
    .offset(offset)
    .orderBy(desc(reconciliationException.createdAt))

  return {
    exceptions,
    total: Number(totalResult?.count || 0),
    page: params.page,
    totalPages: Math.ceil(Number(totalResult?.count || 0) / params.limit)
  }
}

/**
 * Fetch detailed information for a single exception investigation.
 */
export async function getExceptionDetails(id: string) {
  const current = await requireUser()
  if (!await hasPermission(current, "reconciliation.exceptions.manage")) throw new Error("Forbidden")

  const [exception] = await db
    .select()
    .from(reconciliationException)
    .where(eq(reconciliationException.id, id))
    .limit(1)

  if (!exception) return null

  const [receiptData] = exception.receiptId
    ? await db.select().from(receipt).where(eq(receipt.id, exception.receiptId)).limit(1)
    : [null]

  const [recordData] = exception.dailyCollectionRecordId
    ? await db.select().from(dailyCollectionRecord).where(eq(dailyCollectionRecord.id, exception.dailyCollectionRecordId)).limit(1)
    : [null]

  return { exception, receipt: receiptData, record: recordData }
}

/**
 * Manually resolves an exception by linking or marking as reviewed.
 */
export async function resolveException(id: string, data: {
  status: string
  notes: string
  resolution: string
}) {
  const current = await requireUser()
  if (!await hasPermission(current, "reconciliation.exceptions.manage")) throw new Error("Forbidden")

  const [existing] = await db
    .select({
      id: reconciliationException.id,
      recordId: reconciliationException.dailyCollectionRecordId
    })
    .from(reconciliationException)
    .where(eq(reconciliationException.id, id))
    .limit(1)
  if (!existing) throw new Error("Exception not found")

  // Check locking
  if (existing.recordId) {
    const [record] = await db
      .select({ batchId: dailyCollectionRecord.batchId })
      .from(dailyCollectionRecord)
      .where(eq(dailyCollectionRecord.id, existing.recordId))
      .limit(1)

    if (record) {
      const [approval] = await db
        .select({ stage: reconciliationApproval.approvalStage })
        .from(reconciliationApproval)
        .where(eq(reconciliationApproval.batchId, record.batchId))
        .limit(1)

      if (approval?.stage === 'approved') {
        throw new Error("The associated batch is approved and locked. Reopen the batch to modify this exception.")
      }
    }
  }

  try {
    await db.transaction(async (tx) => {
      await tx.update(reconciliationException)
        .set({
          status: data.status,
          reviewNotes: data.notes,
          resolution: data.resolution,
          resolvedAt: data.status === 'resolved' ? new Date() : null,
          resolvedById: data.status === 'resolved' ? current.id : null,
          updatedAt: new Date()
        })
        .where(eq(reconciliationException.id, id))

      await writeAudit({
        user: current,
        action: "reconciliation.exception.resolve",
        entityType: "reconciliation_exception",
        entityId: id,
        details: data
      }, tx)
    })

    revalidatePath("/dashboard/reconciliation/exceptions")
    revalidatePath(`/dashboard/reconciliation/exceptions/${id}`)
    return { ok: true }
  } catch (err: any) {
    console.error("Manual resolution failed", err)
    return { ok: false, error: err.message || "Failed to resolve exception" }
  }
}

/**
 * Fetch reconciliation summary for a batch.
 */
export async function getReconciliationSummary(batchId: string) {
  const current = await requireUser()
  if (!await hasPermission(current, "reconciliation.view")) throw new Error("Forbidden")

  const [stats] = await db
    .select({
      total: count(),
      matched: sql<number>`count(case when ${dailyCollectionRecord.importStatus} = 'matched' then 1 end)::int`,
      avgConfidence: sql<number>`avg(${reconciliationMatch.confidenceScore})::int`,
    })
    .from(dailyCollectionRecord)
    .leftJoin(reconciliationMatch, eq(dailyCollectionRecord.id, reconciliationMatch.dailyCollectionRecordId))
    .where(eq(dailyCollectionRecord.batchId, batchId))

  const methodBreakdown = await db
    .select({
      method: reconciliationMatch.matchMethod,
      count: count()
    })
    .from(reconciliationMatch)
    .innerJoin(dailyCollectionRecord, eq(reconciliationMatch.dailyCollectionRecordId, dailyCollectionRecord.id))
    .where(eq(dailyCollectionRecord.batchId, batchId))
    .groupBy(reconciliationMatch.matchMethod)

  return {
    total: stats?.total || 0,
    matched: stats?.matched || 0,
    unmatched: (stats?.total || 0) - (stats?.matched || 0),
    avgConfidence: stats?.avgConfidence || 0,
    methods: methodBreakdown
  }
}
