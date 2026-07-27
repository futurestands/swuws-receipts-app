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
  dailyCollectionRecord,
  reconciliationMatch,
} from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { applyReceiptScope, applyBillingScope, applyCustomerScope } from "@/lib/scopes"
import { and, eq, sql, desc, sum, count, gte, lte, inArray, ne, notInArray } from "drizzle-orm"
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
          confirmedCount: sql<number>`count(case when ${billingRecord.status} = 'pending_bank_confirmation' then 1 end)::int`,
          partialCount: sql<number>`count(case when ${billingRecord.status} = 'partially_paid' then 1 end)::int`,
          unpaidCount: sql<number>`count(case when ${billingRecord.status} = 'pending' then 1 end)::int`,
        })
        .from(billingRecord)
        .innerJoin(customer, eq(billingRecord.customerId, customer.id))
        .innerJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
        .innerJoin(branch, eq(waterScheme.branchId, branch.id))
        .leftJoin(billingRun, eq(billingRecord.billingRunId, billingRun.id))

      const [billingStats] = await baseQuery.where(and(...billingConditions))

      // 1. BANK VERIFIED COLLECTIONS (Source: EBS Matched Records)
      const verifiedConditions = [
        eq(dailyCollectionRecord.importStatus, 'matched')
      ]
      if (params.schemeId) verifiedConditions.push(eq(customer.waterSchemeId, params.schemeId))
      if (params.branchId) verifiedConditions.push(eq(waterScheme.branchId, params.branchId))

      // Matched against CURRENT month bills
      const monthlyVerifiedConditions = [...verifiedConditions]
      if (params.periodId) {
        monthlyVerifiedConditions.push(eq(billingRecord.billingPeriodId, params.periodId))
      }

      const [monthlyVerifiedStats] = await db
        .select({
          amount: sum(dailyCollectionRecord.amount),
        })
        .from(dailyCollectionRecord)
        .innerJoin(reconciliationMatch, eq(dailyCollectionRecord.id, reconciliationMatch.dailyCollectionRecordId))
        .innerJoin(receipt, eq(reconciliationMatch.receiptId, receipt.id))
        .innerJoin(customer, eq(receipt.customerId, customer.id))
        .leftJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
        .leftJoin(billingRecord, eq(receipt.billingRecordId, billingRecord.id))
        .where(and(...monthlyVerifiedConditions))

      // Matched against PAST month bills (Arrears Recovery)
      const arrearsVerifiedConditions = [...verifiedConditions]
      if (params.periodId) {
        arrearsVerifiedConditions.push(ne(billingRecord.billingPeriodId, params.periodId))
      }

      const [arrearsVerifiedStats] = await db
        .select({
          amount: sum(dailyCollectionRecord.amount),
        })
        .from(dailyCollectionRecord)
        .innerJoin(reconciliationMatch, eq(dailyCollectionRecord.id, reconciliationMatch.dailyCollectionRecordId))
        .innerJoin(receipt, eq(reconciliationMatch.receiptId, receipt.id))
        .innerJoin(customer, eq(receipt.customerId, customer.id))
        .leftJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
        .leftJoin(billingRecord, eq(receipt.billingRecordId, billingRecord.id))
        .where(and(...arrearsVerifiedConditions))

      // 2. OPERATIONAL CASH (Source: All Issued Receipts)
      const receiptConditions = []
      if (receiptScope) receiptConditions.push(receiptScope)
      if (params.schemeId) receiptConditions.push(eq(customer.waterSchemeId, params.schemeId))

      // Exclude voided receipts by checking audit log
      const voidedIdsSubquery = db
        .select({ id: auditLog.entityId })
        .from(auditLog)
        .where(eq(auditLog.action, 'receipt.void'))

      const [receiptStats] = await db
        .select({
          totalAmount: sum(receipt.amount),
          totalCount: count(receipt.id),
        })
        .from(receipt)
        .innerJoin(customer, eq(receipt.customerId, customer.id))
        .where(and(
          ...receiptConditions,
          notInArray(receipt.id, voidedIdsSubquery)
        ))

      const totalBilled = Number(billingStats?.totalBilled || 0)
      const verifiedMonthly = Number(monthlyVerifiedStats?.amount || 0)
      const verifiedArrears = Number(arrearsVerifiedStats?.amount || 0)
      const operationalCash = Number(receiptStats?.totalAmount || 0)
      const operationalCount = Number(receiptStats?.totalCount || 0)

      // Total System Arrears (Current Snapshot)
      const arrearsConditions = []
      if (params.schemeId) arrearsConditions.push(eq(customer.waterSchemeId, params.schemeId))
      if (params.branchId) arrearsConditions.push(eq(waterScheme.branchId, params.branchId))
      if (params.clusterId) arrearsConditions.push(eq(branch.clusterId, params.clusterId))

      const customerScope = applyCustomerScope(current)
      if (customerScope) arrearsConditions.push(customerScope)

      const [arrearsSnapshot] = await db
        .select({
          totalDebt: sql<number>`sum(case when ${customer.accountBalance} > 0 then ${customer.accountBalance} else 0 end)::bigint`,
          totalCredit: sql<number>`sum(case when ${customer.accountBalance} < 0 then abs(${customer.accountBalance}) else 0 end)::bigint`,
        })
        .from(customer)
        .leftJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
        .leftJoin(branch, eq(waterScheme.branchId, branch.id))
        .where(and(...arrearsConditions))

      const totalArrears = Number(arrearsSnapshot?.totalDebt || 0)
      const totalUpfront = Number(arrearsSnapshot?.totalCredit || 0)

      const rate = totalBilled > 0 ? (verifiedMonthly / totalBilled) * 100 : 0

      return {
        billing: {
          totalBilled,
          billedCount: Number(billingStats?.billedCount || 0),
          paidCount: Number(billingStats?.paidCount || 0),
          confirmedCount: Number(billingStats?.confirmedCount || 0),
          partialCount: Number(billingStats?.partialCount || 0),
          unpaidCount: Number(billingStats?.unpaidCount || 0),
        },
        collections: {
          verifiedMonthly,
          verifiedArrears,
          operationalCash,
          operationalCount,
          outstanding: Math.max(0, totalBilled - verifiedMonthly),
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
 * Fetches customers with the highest live account balances (arrears).
 */
export async function getTopDebtors(limit = 10) {
  const current = await requireUser()
  if (!canViewReports(current)) throw new Error("Forbidden")

  return db
    .select({
      id: customer.id,
      name: customer.name,
      account: customer.customerAccount,
      scheme: waterScheme.name,
      outstanding: customer.accountBalance,
    })
    .from(customer)
    .leftJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
    .where(and(
      eq(customer.active, true),
      sql`${customer.accountBalance} > 0`,
      applyCustomerScope(current)
    ))
    .orderBy(desc(customer.accountBalance))
    .limit(limit)
}
