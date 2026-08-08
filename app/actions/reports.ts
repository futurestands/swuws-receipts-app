"use server"

import { db } from "@/lib/db"
import {
  receipt,
  billingRecord,
  billingPeriod,
  customer,
  waterScheme,
  branch,
  auditLog,
  dailyCollectionRecord,
  reconciliationMatch,
  meterReading,
} from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { applyReceiptScope, applyCustomerScope } from "@/lib/scopes"
import { and, eq, sql, desc, sum, count, gte, inArray } from "drizzle-orm"
import { canViewReports, canUploadBilling } from "@/lib/permissions"

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
      consumption: meterReading.consumption,
    })
    .from(billingRecord)
    .innerJoin(billingPeriod, eq(billingRecord.billingPeriodId, billingPeriod.id))
    .leftJoin(meterReading, and(eq(billingRecord.customerId, meterReading.customerId), eq(billingRecord.billingPeriodId, meterReading.billingPeriodId)))
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
      runningBalance += Number(event.data.totalDue)
      ledger.push({
        date: event.date,
        type: "bill",
        description: `${event.data.periodName} Bill`,
        amount: Number(event.data.totalDue),
        balance: runningBalance,
        referenceId: event.data.id,
      })
    } else {
      // Reversal logic: If voided, the payment doesn't affect the balance
      if (!event.data.isVoided) {
        runningBalance -= Number(event.data.amount)
      }

      ledger.push({
        date: event.date,
        type: "payment",
        description: `Receipt #${event.data.receiptNumber}${event.data.isVoided ? " (VOIDED)" : ""}`,
        amount: Number(event.data.amount),
        balance: runningBalance,
        referenceId: event.data.id,
        isVoided: event.data.isVoided
      })
    }
  }

  // 5. Fetch latest meter reading for consumption display
  const [lastReading] = await db
    .select()
    .from(meterReading)
    .where(eq(meterReading.customerId, customerId))
    .orderBy(desc(meterReading.createdAt))
    .limit(1)

  // 6. Calculate Running Totals
  const totalBilled = bills.reduce((sum, b) => sum + Number(b.totalDue), 0)
  const totalPaid = receipts.filter(r => !r.isVoided).reduce((sum, r) => sum + Number(r.amount), 0)
  const currentBalance = totalBilled - totalPaid

  return {
    customer: target,
    bills,
    receipts,
    ledger: ledger.reverse(), // Newest first
    lastReading,
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

  // Apply Scopes
  const receiptScope = applyReceiptScope(current)
  const customerScope = applyCustomerScope(current)

  // 0. Auto-focus on active period if none selected (Optimization for production stability)
  let activePeriodId = params.periodId
  if (!activePeriodId) {
    const [active] = await db
      .select({ id: billingPeriod.id })
      .from(billingPeriod)
      .where(eq(billingPeriod.status, 'active'))
      .limit(1)
    if (active) activePeriodId = active.id
  }

  // Build filters based on selection AND scope
  const billingConditions = []
  if (activePeriodId) billingConditions.push(eq(billingRecord.billingPeriodId, activePeriodId))
  if (params.schemeId) billingConditions.push(eq(customer.waterSchemeId, params.schemeId))
  if (params.branchId) billingConditions.push(eq(waterScheme.branchId, params.branchId))
  if (params.clusterId) billingConditions.push(eq(branch.clusterId, params.clusterId))

  if (customerScope) billingConditions.push(customerScope)

  // 1. BILLING AGGREGATION (Unified: Imports + Field Readings)
  const readingConditions = []
  if (activePeriodId) readingConditions.push(eq(meterReading.billingPeriodId, activePeriodId))
  if (params.schemeId) readingConditions.push(eq(customer.waterSchemeId, params.schemeId))
  if (params.branchId) readingConditions.push(eq(waterScheme.branchId, params.branchId))
  if (params.clusterId) readingConditions.push(eq(branch.clusterId, params.clusterId))

  if (customerScope) readingConditions.push(customerScope)

  const [importStats, fieldStats] = await Promise.all([
    db
      .select({
        totalBilled: sum(billingRecord.totalDue),
        totalArrearsBilled: sum(billingRecord.arrears),
        totalCurrentBilled: sum(billingRecord.currentCharges),
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
      .where(and(...billingConditions))
      .then(rows => rows[0]),
    db
      .select({
        totalBilled: sum(meterReading.billedAmount),
        totalArrearsBilled: sum(meterReading.previousBalanceSnapshot),
        totalCurrentBilled: sum(meterReading.billedAmount),
        billedCount: count(meterReading.id),
      })
      .from(meterReading)
      .innerJoin(customer, eq(meterReading.customerId, customer.id))
      .innerJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
      .innerJoin(branch, eq(waterScheme.branchId, branch.id))
      .where(and(...readingConditions))
      .then(rows => rows[0]),
  ])

  // 2. BANK VERIFIED COLLECTIONS (Source: EBS Matched Records)
  const verifiedConditions = [
    eq(dailyCollectionRecord.importStatus, 'matched')
  ]
  if (params.schemeId) verifiedConditions.push(eq(customer.waterSchemeId, params.schemeId))
  if (params.branchId) verifiedConditions.push(eq(waterScheme.branchId, params.branchId))
  if (activePeriodId) verifiedConditions.push(eq(receipt.billingPeriodId, activePeriodId))
  if (customerScope) verifiedConditions.push(customerScope)

  // Optimization: Simplified collection query to reduce join complexity
  const [collectionStats] = await db
    .select({
      totalPaid: sum(dailyCollectionRecord.amount),
      // For performance on production, we'll do a simpler arrears/current split
      // or defer the split if the query is too slow.
    })
    .from(dailyCollectionRecord)
    .innerJoin(reconciliationMatch, eq(dailyCollectionRecord.id, reconciliationMatch.dailyCollectionRecordId))
    .innerJoin(receipt, eq(reconciliationMatch.receiptId, receipt.id))
    .innerJoin(customer, eq(receipt.customerId, customer.id))
    .leftJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
    .where(and(...verifiedConditions))

  // 3. OPERATIONAL CASH (Source: All Issued Receipts)
  const receiptConditions = []
  if (receiptScope) receiptConditions.push(receiptScope)
  if (params.schemeId) receiptConditions.push(eq(customer.waterSchemeId, params.schemeId))
  if (activePeriodId) receiptConditions.push(eq(receipt.billingPeriodId, activePeriodId))

  const [receiptStats] = await db
    .select({
      totalAmount: sum(receipt.amount),
      totalCount: count(receipt.id),
    })
    .from(receipt)
    .innerJoin(customer, eq(receipt.customerId, customer.id))
    // Optimization: Exclude voided receipts using LEFT JOIN + NULL check instead of NOT IN
    .leftJoin(auditLog, and(eq(receipt.id, auditLog.entityId), eq(auditLog.action, 'receipt.void')))
    .where(and(
      ...receiptConditions,
      sql`${auditLog.id} IS NULL`
    ))

  const totalBilled = Number(importStats?.totalBilled || 0) + Number(fieldStats?.totalBilled || 0)
  const arrearsBilled = Number(importStats?.totalArrearsBilled || 0) + Number(fieldStats?.totalArrearsBilled || 0)
  const currentBilled = Number(importStats?.totalCurrentBilled || 0) + Number(fieldStats?.totalCurrentBilled || 0)
  const billedCount = Number(importStats?.billedCount || 0) + Number(fieldStats?.billedCount || 0)

  // HARMONIZED COLLECTIONS logic:
  // 1. Bank Confirmed (EBS Matches)
  const verifiedTotal = Number(collectionStats?.totalPaid || 0)

  // 2. Paid via Upfront (Auto-recovered during billing import)
  // We can derive this by checking billingRecords where arrears were negative and bill was covered
  const [upfrontRecovery] = await db
    .select({ total: sum(sql`case when ${billingRecord.arrears}::numeric < 0 then least(${billingRecord.billAmount}::numeric, abs(${billingRecord.arrears}::numeric)) else 0 end`) })
    .from(billingRecord)
    .innerJoin(customer, eq(billingRecord.customerId, customer.id))
    .where(and(...billingConditions))

  const verifiedUpfront = Number(upfrontRecovery?.total || 0)

  // 3. Billing Window Recovery (Payments made between 1st and 7th)
  // Logic: (Excel Arrears - System Arrears at Import) where reduction occurred.
  const [windowRecoveryStats] = await db
    .select({
      total: sum(sql`case when ${billingRecord.currentCharges}::numeric > ${billingRecord.arrears}::numeric then ${billingRecord.currentCharges}::numeric - ${billingRecord.arrears}::numeric else 0 end`)
    })
    .from(billingRecord)
    .innerJoin(customer, eq(billingRecord.customerId, customer.id))
    .where(and(...billingConditions))

  const windowRecovery = Number(windowRecoveryStats?.total || 0)

  // Arrears Performance: Combine Matched EBS Arrears + Window Recovery
  const verifiedArrears = windowRecovery // Simplified for Phase 2B

  // Current Performance: EBS Verified + Upfront Used
  const verifiedCurrent = verifiedTotal + verifiedUpfront

  const totalHarmonizedCollected = verifiedArrears + verifiedCurrent

  const operationalCash = Number(receiptStats?.totalAmount || 0)
  const operationalCount = Number(receiptStats?.totalCount || 0)

  // Collection Rates
  const globalRate = totalBilled > 0 ? (totalHarmonizedCollected / totalBilled) * 100 : 0

  // Total System Arrears (Current Snapshot)
  const arrearsConditions = []
  if (params.schemeId) arrearsConditions.push(eq(customer.waterSchemeId, params.schemeId))
  if (customerScope) arrearsConditions.push(customerScope)

  // Optimization: Direct customer query for debt snapshot (fewer joins)
  const [arrearsSnapshot] = await db
    .select({
      totalDebt: sql<number>`sum(case when ${customer.accountBalance} > 0 then ${customer.accountBalance} else 0 end)::bigint`,
      totalCredit: sql<number>`sum(case when ${customer.accountBalance} < 0 then abs(${customer.accountBalance}) else 0 end)::bigint`,
    })
    .from(customer)
    .where(and(...arrearsConditions))

  const totalArrears = Number(arrearsSnapshot?.totalDebt || 0)
  const totalUpfront = Number(arrearsSnapshot?.totalCredit || 0)

  return {
    billing: {
      totalBilled,
      arrearsBilled,
      currentBilled,
      billedCount,
      paidCount: Number(importStats?.paidCount || 0),
      confirmedCount: Number(importStats?.confirmedCount || 0),
      partialCount: Number(importStats?.partialCount || 0),
      unpaidCount: Number(importStats?.unpaidCount || 0),
    },
    collections: {
      verifiedTotal,
      verifiedMonthly: verifiedCurrent,
      verifiedArrears,
      operationalCash,
      operationalCount,
      outstanding: Math.max(0, totalBilled - verifiedTotal),
      collectionRate: globalRate,
      arrearsRate: arrearsBilled > 0 ? (verifiedArrears / arrearsBilled) * 100 : 0,
      currentRate: currentBilled > 0 ? (verifiedCurrent / currentBilled) * 100 : 0,
    },
    arrears: {
      totalArrears,
      totalUpfront,
    }
  }
}

/**
 * Detailed Collection Trends
 */
export async function getCollectionTrends(days = 30) {
  const current = await requireUser()
  const scope = applyReceiptScope(current)

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
    totalPaid: receipts.reduce((sum, r) => sum + Number(r.amount), 0),
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
    .orderBy(desc(sql`${customer.accountBalance}::numeric`))
    .limit(limit)
}
