"use server"

import { db } from "@/lib/db"
import {
  receipt,
  billingRecord,
  billingPeriod,
  billingRun,
  customer,
  waterScheme,
  branch,
  cluster,
  user as userTable,
  auditLog,
} from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { applyReceiptScope, applyBillingScope, applyCustomerScope } from "@/lib/scopes"
import { and, eq, sql, desc, sum, count, gte, lte, inArray } from "drizzle-orm"
import { canViewReports, canUploadBilling } from "@/lib/permissions"
import { unstable_cache } from "next/cache"

/**
 * CUSTOMER STATEMENT (Phase 2, Objective 3)
 * Fetches the complete financial ledger for a customer.
 */
export async function getCustomerStatement(customerId: string) {
  const current = await requireUser()
  const scope = applyCustomerScope(current)

  // 1. Verify access to customer
  const [target] = await db
    .select()
    .from(customer)
    .where(and(eq(customer.id, customerId), scope))
    .limit(1)

  if (!target) throw new Error("Customer not found or access denied")

  // 2. Fetch all bills
  const bills = await db
    .select({
      id: billingRecord.id,
      periodName: billingPeriod.periodName,
      status: billingRecord.status,
      periodStatus: billingPeriod.status,
      totalDue: billingRecord.totalDue,
      dueDate: billingRecord.dueDate,
      createdAt: billingRecord.createdAt,
    })
    .from(billingRecord)
    .innerJoin(billingPeriod, eq(billingRecord.billingPeriodId, billingPeriod.id))
    .where(eq(billingRecord.customerId, customerId))
    .orderBy(desc(billingPeriod.year), desc(billingPeriod.month))

  // 3. Fetch all receipts and check for void status
  const rawReceipts = await db
    .select({
      id: receipt.id,
      receiptNumber: receipt.receiptNumber,
      amount: receipt.amount,
      paymentDate: receipt.paymentDate,
      paymentMethod: receipt.paymentMethod,
      billingPeriod: receipt.billingPeriodSnapshot,
      agentName: receipt.agentName,
      remainingBalance: receipt.outstandingBalance,
    })
    .from(receipt)
    .where(eq(receipt.customerId, customerId))
    .orderBy(desc(receipt.paymentDate))

  // Check for void events in audit log for these receipts
  const voidEvents = await db
    .select({ entityId: auditLog.entityId })
    .from(auditLog)
    .where(and(
      inArray(auditLog.entityId, rawReceipts.length > 0 ? rawReceipts.map(r => r.id) : ['none']),
      eq(auditLog.action, "receipt.void")
    ))

  const voidedIds = new Set(voidEvents.map(e => e.entityId))

  const receipts = rawReceipts.map(r => ({
    ...r,
    isVoided: voidedIds.has(r.id)
  }))

  // 4. Create chronological ledger (Objective 2)
  const ledger: Array<{
    date: Date
    type: "bill" | "payment"
    description: string
    amount: number
    balance: number
    referenceId: string
    isVoided?: boolean
  }> = []

  let runningBalance = 0

  // Combine and sort by date
  const events = [
    ...bills.map((b) => ({ date: b.createdAt, type: "bill" as const, data: b })),
    ...receipts.map((r) => ({ date: r.paymentDate, type: "payment" as const, data: r })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime())

  for (const event of events) {
    if (event.type === "bill") {
      runningBalance += event.data.totalDue
      ledger.push({
        date: event.date,
        type: "bill",
        description: `${event.data.periodName} Bill`,
        amount: event.data.totalDue,
        balance: runningBalance,
        referenceId: event.data.id,
      })
    } else {
      // Reversal logic: If voided, the payment doesn't affect the balance
      if (!event.data.isVoided) {
        runningBalance -= event.data.amount
      }

      ledger.push({
        date: event.date,
        type: "payment",
        description: `Receipt #${event.data.receiptNumber}${event.data.isVoided ? " (VOIDED)" : ""}`,
        amount: event.data.amount,
        balance: runningBalance,
        referenceId: event.data.id,
        isVoided: event.data.isVoided
      })
    }
  }

  // 5. Calculate Running Totals
  const totalBilled = bills.reduce((sum, b) => sum + b.totalDue, 0)
  const totalPaid = receipts.filter(r => !r.isVoided).reduce((sum, r) => sum + r.amount, 0)
  const currentBalance = totalBilled - totalPaid

  return {
    customer: target,
    bills,
    receipts,
    ledger: ledger.reverse(), // Newest first
    summary: {
      totalBilled,
      totalPaid,
      currentBalance,
    },
  }
}

/**
 * COMMERCIAL DASHBOARD DATA (Phase 2, Objectives 4-7)
 * Generic aggregator that respects organizational scope.
 */
export async function getDashboardStats(params: {
  periodId?: string
  clusterId?: string
  branchId?: string
  schemeId?: string
}) {
  const current = await requireUser()
  if (!canViewReports(current)) throw new Error("Forbidden")

  // Cache key includes user ID (for scope) and filter params
  const cacheKey = `dashboard-stats-${current.id}-${params.periodId || 'all'}-${params.clusterId || 'all'}-${params.branchId || 'all'}-${params.schemeId || 'all'}`

  return unstable_cache(
    async () => {
      // 0. Fetch Period Data if filtered
      let period: any = null
      if (params.periodId) {
        [period] = await db.select().from(billingPeriod).where(eq(billingPeriod.id, params.periodId)).limit(1)
      }

      // Apply Scopes
      const receiptScope = applyReceiptScope(current)
      const billingScope = applyBillingScope(current) // applies to billingRun

      // Build filters based on selection AND scope
      const billingConditions = []
      if (params.periodId) billingConditions.push(eq(billingRecord.billingPeriodId, params.periodId))
      if (params.schemeId) billingConditions.push(eq(customer.waterSchemeId, params.schemeId))
      if (params.branchId) billingConditions.push(eq(waterScheme.branchId, params.branchId))
      if (params.clusterId) billingConditions.push(eq(branch.clusterId, params.clusterId))

      // This subquery ensures we only see billing records the user is scoped for
      // by joining through customer/scheme/branch hierarchy.
      const billingScopeFilter = applyBillingScope(current)
      if (billingScopeFilter) billingConditions.push(billingScopeFilter)

      const baseQuery = db
        .select({
          totalBilled: sum(billingRecord.totalDue),
          billedCount: count(billingRecord.id),
          paidCount: sql<number>`count(case when ${billingRecord.status} = 'paid' then 1 end)::int`,
          partialCount: sql<number>`count(case when ${billingRecord.status} = 'partially_paid' then 1 end)::int`,
          unpaidCount: sql<number>`count(case when ${billingRecord.status} = 'pending' then 1 end)::int`,
        })
        .from(billingRecord)
        .innerJoin(customer, eq(billingRecord.customerId, customer.id))
        .innerJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
        .innerJoin(branch, eq(waterScheme.branchId, branch.id))
        .leftJoin(billingRun, eq(billingRecord.billingRunId, billingRun.id))

      const [billingStats] = await baseQuery.where(and(...billingConditions))

      // Receipt Aggregation
      const receiptConditions = []
      if (params.periodId) {
        // We join with billingRecord to filter receipts by billing period
        receiptConditions.push(eq(billingRecord.billingPeriodId, params.periodId))
      }
      if (receiptScope) receiptConditions.push(receiptScope)
      if (params.schemeId) {
         // Join through customer to check scheme
         receiptConditions.push(eq(customer.waterSchemeId, params.schemeId))
      }

      const [collectionStats] = await db
        .select({
          totalCollected: sum(receipt.amount),
          receiptCount: count(receipt.id),
        })
        .from(receipt)
        .innerJoin(customer, eq(receipt.customerId, customer.id))
        .leftJoin(billingRecord, eq(receipt.billingRecordId, billingRecord.id))
        .where(and(...receiptConditions))

      const totalBilled = Number(billingStats?.totalBilled || 0)
      const totalCollected = Number(collectionStats?.totalCollected || 0)

      // Finding 9 Fix: Deep Arrears & Advance Tracking
      // A. Total System Arrears (Current Snapshot for selected scope)
      const arrearsConditions = []
      if (params.schemeId) arrearsConditions.push(eq(customer.waterSchemeId, params.schemeId))
      if (params.branchId) arrearsConditions.push(eq(waterScheme.branchId, params.branchId))
      if (params.clusterId) arrearsConditions.push(eq(branch.clusterId, params.clusterId))

      const customerScope = applyCustomerScope(current)
      if (customerScope) arrearsConditions.push(customerScope)

      const [arrearsStats] = await db
        .select({
          totalDebt: sql<number>`sum(case when ${customer.accountBalance} > 0 then ${customer.accountBalance} else 0 end)::bigint`,
          totalCredit: sql<number>`sum(case when ${customer.accountBalance} < 0 then abs(${customer.accountBalance}) else 0 end)::bigint`,
        })
        .from(customer)
        .leftJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
        .leftJoin(branch, eq(waterScheme.branchId, branch.id))
        .where(and(...arrearsConditions))

      // B. Arrears Collected in Period (Receipts not linked to a current bill)
      // Note: We don't reuse receiptConditions here because they link to billingRecord
      const arrearsCollectedConditions = []
      if (receiptScope) arrearsCollectedConditions.push(receiptScope)
      if (params.schemeId) arrearsCollectedConditions.push(eq(customer.waterSchemeId, params.schemeId))
      arrearsCollectedConditions.push(sql`${receipt.billingRecordId} IS NULL`)

      if (period) {
        // Arrears collection in this context means money received during the period dates
        // but not matched to a bill of that period.
        arrearsCollectedConditions.push(gte(receipt.paymentDate, period.startDate))
        arrearsCollectedConditions.push(lte(receipt.paymentDate, period.endDate))
      }

      const [arrearsCollectedStats] = await db
        .select({
          amount: sum(receipt.amount),
        })
        .from(receipt)
        .innerJoin(customer, eq(receipt.customerId, customer.id))
        .where(and(...arrearsCollectedConditions))

      const totalArrears = Number(arrearsStats?.totalDebt || 0)
      const totalUpfront = Number(arrearsStats?.totalCredit || 0)
      const collectedFromArrears = Number(arrearsCollectedStats?.amount || 0)
      const collectedFromBills = totalCollected - collectedFromArrears

      const rate = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0

      return {
        billing: {
          totalBilled,
          billedCount: Number(billingStats?.billedCount || 0),
          paidCount: Number(billingStats?.paidCount || 0),
          partialCount: Number(billingStats?.partialCount || 0),
          unpaidCount: Number(billingStats?.unpaidCount || 0),
        },
        collections: {
          totalCollected,
          collectedFromBills,
          collectedFromArrears,
          receiptCount: Number(collectionStats?.receiptCount || 0),
          outstanding: Math.max(0, totalBilled - collectedFromBills),
          collectionRate: rate,
        },
        arrears: {
          totalArrears,
          totalUpfront,
        }
      }
    },
    [cacheKey],
    { tags: ['dashboard-stats'] }
  )()
}

/**
 * Detailed Collection Trends
 */
export async function getCollectionTrends(days = 30) {
  const current = await requireUser()
  const scope = applyReceiptScope(current)

  const cacheKey = `collection-trends-${current.id}-${days}`

  return unstable_cache(
    async () => {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      const conditions = [gte(receipt.paymentDate, startDate)]
      if (scope) conditions.push(scope)

      return db
        .select({
          date: sql<string>`DATE(${receipt.paymentDate})`,
          amount: sum(receipt.amount),
          count: count(receipt.id),
        })
        .from(receipt)
        .where(and(...conditions))
        .groupBy(sql`DATE(${receipt.paymentDate})`)
        .orderBy(desc(sql`DATE(${receipt.paymentDate})`))
    },
    [cacheKey],
    { tags: ['collections'] }
  )()
}

/**
 * Payment History per Bill (Phase 2, Objective 2 & 10)
 */
export async function getBillPaymentHistory(billingRecordId: string) {
  const current = await requireUser()
  if (!canUploadBilling(current)) throw new Error("Forbidden")

  const [bill] = await db
    .select()
    .from(billingRecord)
    .where(eq(billingRecord.id, billingRecordId))
    .limit(1)

  if (!bill) return null

  // Confirm the underlying customer is within the caller's scope, same check
  // getCustomerStatement already does above, before returning payment data.
  const [inScope] = await db
    .select({ id: customer.id })
    .from(customer)
    .where(and(eq(customer.id, bill.customerId), applyCustomerScope(current)))
    .limit(1)
  if (!inScope) return null

  const receipts = await db
    .select()
    .from(receipt)
    .where(eq(receipt.billingRecordId, billingRecordId))
    .orderBy(receipt.createdAt)

  return {
    bill,
    payments: receipts,
    totalPaid: receipts.reduce((sum, r) => sum + r.amount, 0),
  }
}

/**
 * TOP DEBTORS (Objective 7 & 14)
 */
export async function getTopDebtors(limit = 10) {
  const current = await requireUser()
  if (!canViewReports(current)) throw new Error("Forbidden")

  // This is a complex query: we need customers with highest (billed - paid)
  // We'll use a raw SQL approach or subqueries for efficiency.
  return db
    .select({
      id: customer.id,
      name: customer.name,
      account: customer.customerAccount,
      scheme: waterScheme.name,
      totalBilled: sql<number>`sum(${billingRecord.totalDue})::bigint`,
      totalPaid: sql<number>`(select coalesce(sum(amount), 0) from receipt where receipt."customerId" = ${customer.id})::bigint`,
      outstanding: sql<number>`sum(${billingRecord.totalDue}) - (select coalesce(sum(amount), 0) from receipt where receipt."customerId" = ${customer.id})::bigint`,
    })
    .from(customer)
    .innerJoin(billingRecord, eq(billingRecord.customerId, customer.id))
    .innerJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
    .where(applyCustomerScope(current))
    .groupBy(customer.id, customer.name, customer.customerAccount, waterScheme.name)
    .orderBy(desc(sql`sum(${billingRecord.totalDue}) - (select coalesce(sum(amount), 0) from receipt where receipt."customerId" = ${customer.id})`))
    .limit(limit)
}
