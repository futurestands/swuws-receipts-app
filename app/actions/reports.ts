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
  dailyCollectionImport,
  reconciliationMatch,
  meterReading,
} from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { applyReceiptScope, applyCustomerScope } from "@/lib/scopes"
import { and, eq, ne, sql, desc, sum, count, gte, inArray, or, ilike } from "drizzle-orm"
import { canViewReports, canUploadBilling, canViewAllData } from "@/lib/permissions"
import { ROLES } from "@/lib/permissions/roles"
import { getCategoryEquivalents } from "@/lib/utils/category"

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
  category?: string
  query?: string
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
  if (activePeriodId && activePeriodId !== "all") billingConditions.push(eq(billingRecord.billingPeriodId, activePeriodId))
  if (params.schemeId && params.schemeId !== "all") billingConditions.push(eq(customer.waterSchemeId, params.schemeId))
  if (params.branchId && params.branchId !== "all") billingConditions.push(eq(waterScheme.branchId, params.branchId))
  if (params.clusterId && params.clusterId !== "all") billingConditions.push(eq(branch.clusterId, params.clusterId))
  if (params.category && params.category !== "all") {
    billingConditions.push(inArray(customer.category, getCategoryEquivalents(params.category)))
  }
  if (params.query?.trim()) {
    const q = `%${params.query.trim().toLowerCase()}%`
    billingConditions.push(or(
      ilike(customer.name, q),
      ilike(customer.customerAccount, q)
    ))
  }

  // HIERARCHY FORCING (Universal): Every regional user is strictly trapped in their assignment.
  // We apply this to the condition arrays before they are summed or counted.
  const forceHierarchy = (conds: any[]) => {
    // If they can view all data (e.g. System Admin or Head Office with permission), do not force.
    if (canViewAllData(current)) return;

    if (current.branchId) conds.push(eq(waterScheme.branchId, current.branchId))
    else if (current.clusterId) conds.push(eq(branch.clusterId, current.clusterId))
    else if (current.schemeId) conds.push(eq(customer.waterSchemeId, current.schemeId))
  }

  forceHierarchy(billingConditions)
  if (customerScope) billingConditions.push(customerScope)

  // 1. BILLING AGGREGATION (Unified: Imports + Field Readings)
  const readingConditions = []
  if (activePeriodId && activePeriodId !== "all") readingConditions.push(eq(meterReading.billingPeriodId, activePeriodId))
  if (params.schemeId && params.schemeId !== "all") readingConditions.push(eq(customer.waterSchemeId, params.schemeId))
  if (params.branchId && params.branchId !== "all") readingConditions.push(eq(waterScheme.branchId, params.branchId))
  if (params.clusterId && params.clusterId !== "all") readingConditions.push(eq(branch.clusterId, params.clusterId))
  if (params.category && params.category !== "all") {
    readingConditions.push(inArray(customer.category, getCategoryEquivalents(params.category)))
  }
  if (params.query?.trim()) {
    const q = `%${params.query.trim().toLowerCase()}%`
    readingConditions.push(or(
      ilike(customer.name, q),
      ilike(customer.customerAccount, q)
    ))
  }

  forceHierarchy(readingConditions)
  if (customerScope) readingConditions.push(customerScope)

  const [importStats, fieldStats] = await Promise.all([
    db
      .select({
        totalBilled: sum(billingRecord.totalDue),
        totalArrearsBilled: sum(billingRecord.arrears),
        totalCurrentBilled: sum(billingRecord.billAmount),
        // ULTIMATE RECOVERY MATH (New Money + Upfront Consumption)
        // 1. Total NEW money recovered = (Old Balance + Bill) - New Balance
        totalMoneyRecovered: sum(sql`
          greatest(0, (coalesce(${billingRecord.arrears}, 0)::numeric + coalesce(${billingRecord.billAmount}, 0)::numeric) - coalesce(${billingRecord.totalDue}, 0)::numeric)
        `),
        // 2. Applied to Arrears first
        verifiedArrears: sum(sql`
          least(
            greatest(0, coalesce(${billingRecord.arrears}, 0)::numeric),
            greatest(0, (coalesce(${billingRecord.arrears}, 0)::numeric + coalesce(${billingRecord.billAmount}, 0)::numeric) - coalesce(${billingRecord.totalDue}, 0)::numeric)
          )
        `),
        // 3. Current Month recovery (Total Satisfied Bill = Bill Amount - Unpaid portion of Bill)
        // This includes portions paid by consumed advances/upfronts.
        verifiedCurrent: sum(sql`
          greatest(0, coalesce(${billingRecord.billAmount}, 0)::numeric - greatest(0, coalesce(${billingRecord.totalDue}, 0)::numeric))
        `),
        // 4. CASH PORTION (Money that physically entered the bank this period)
        cashToArrears: sum(sql`
          least(
            greatest(0, coalesce(${billingRecord.arrears}, 0)::numeric),
            greatest(0, (coalesce(${billingRecord.arrears}, 0)::numeric + coalesce(${billingRecord.billAmount}, 0)::numeric) - coalesce(${billingRecord.totalDue}, 0)::numeric)
          )
        `),
        cashToCurrent: sum(sql`
          least(
            coalesce(${billingRecord.billAmount}, 0)::numeric,
            greatest(0, ((coalesce(${billingRecord.arrears}, 0)::numeric + coalesce(${billingRecord.billAmount}, 0)::numeric) - coalesce(${billingRecord.totalDue}, 0)::numeric) -
            least(
              greatest(0, coalesce(${billingRecord.arrears}, 0)::numeric),
              greatest(0, (coalesce(${billingRecord.arrears}, 0)::numeric + coalesce(${billingRecord.billAmount}, 0)::numeric) - coalesce(${billingRecord.totalDue}, 0)::numeric)
            ))
          )
        `),
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
        verifiedArrears: sql<string>`0`,
        verifiedCurrent: sql<string>`0`,
        billedCount: count(meterReading.id),
      })
      .from(meterReading)
      .innerJoin(customer, eq(meterReading.customerId, customer.id))
      .innerJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
      .innerJoin(branch, eq(waterScheme.branchId, branch.id))
      .where(and(...readingConditions))
      .then(rows => rows[0]),
  ])

  // 3. BANK VERIFIED COLLECTIONS (Absolute Source of Truth: Daily Transaction Logs)
  // We sum every payment that physically entered the system during this period.
  const verifiedConditions = [
    eq(dailyCollectionRecord.importStatus, 'matched'),
    activePeriodId && activePeriodId !== 'all' ? eq(dailyCollectionImport.billingPeriodId, activePeriodId) : sql`true`,
  ]
  if (params.schemeId && params.schemeId !== "all") verifiedConditions.push(eq(customer.waterSchemeId, params.schemeId))
  if (params.branchId && params.branchId !== "all") verifiedConditions.push(eq(waterScheme.branchId, params.branchId))
  if (params.clusterId && params.clusterId !== "all") verifiedConditions.push(eq(branch.clusterId, params.clusterId))
  if (params.category && params.category !== "all") {
    verifiedConditions.push(inArray(customer.category, getCategoryEquivalents(params.category)))
  }
  if (params.query?.trim()) {
    const q = `%${params.query.trim().toLowerCase()}%`
    const cond = or(ilike(customer.name, q), ilike(customer.customerAccount, q))
    if (cond) verifiedConditions.push(cond)
  }
  forceHierarchy(verifiedConditions)
  if (customerScope) verifiedConditions.push(customerScope)

  // 4. OPERATIONAL CASH (Source: All Issued Receipts)
  const receiptConditions = [
    activePeriodId && activePeriodId !== 'all' ? eq(receipt.billingPeriodId, activePeriodId) : sql`true`,
  ]
  if (params.schemeId && params.schemeId !== "all") receiptConditions.push(eq(customer.waterSchemeId, params.schemeId))
  if (params.branchId && params.branchId !== "all") receiptConditions.push(eq(waterScheme.branchId, params.branchId))
  if (params.clusterId && params.clusterId !== "all") receiptConditions.push(eq(branch.clusterId, params.clusterId))
  if (params.category && params.category !== "all") {
    receiptConditions.push(inArray(customer.category, getCategoryEquivalents(params.category)))
  }
  if (params.query?.trim()) {
    const q = `%${params.query.trim().toLowerCase()}%`
    const cond = or(ilike(customer.name, q), ilike(customer.customerAccount, q))
    if (cond) receiptConditions.push(cond)
  }
  forceHierarchy(receiptConditions)
  if (receiptScope) receiptConditions.push(receiptScope)

  const [bankActivity, receiptStats] = await Promise.all([
    db
      .select({ totalCashReceived: sum(dailyCollectionRecord.amount) })
      .from(dailyCollectionRecord)
      .innerJoin(dailyCollectionImport, eq(dailyCollectionRecord.batchId, dailyCollectionImport.id))
      .innerJoin(customer, eq(dailyCollectionRecord.accountNumber, customer.customerAccount))
      .leftJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
      .leftJoin(branch, eq(waterScheme.branchId, branch.id))
      .where(and(...verifiedConditions))
      .then(rows => rows[0]),
    db
      .select({ totalAmount: sum(receipt.amount), totalCount: count(receipt.id) })
      .from(receipt)
      .innerJoin(customer, eq(receipt.customerId, customer.id))
      .leftJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
      .leftJoin(branch, eq(waterScheme.branchId, branch.id))
      .leftJoin(auditLog, and(eq(receipt.id, auditLog.entityId), eq(auditLog.action, 'receipt.void')))
      .where(and(
        ...receiptConditions,
        sql`${auditLog.id} IS NULL`
      ))
      .then(rows => rows[0])
  ])

  const verifiedTotal = Number(bankActivity?.totalCashReceived || 0)
  const arrearsBilled = Number(importStats?.totalArrearsBilled || 0) + Number(fieldStats?.totalArrearsBilled || 0)
  const currentBilled = Number(importStats?.totalCurrentBilled || 0) + Number(fieldStats?.totalCurrentBilled || 0)
  const billedCount = Number(importStats?.billedCount || 0) + Number(fieldStats?.billedCount || 0)
  const totalBilled = currentBilled + arrearsBilled

  // REVENUE REALIZATION (Derived from Bills: Money applied to Demand)
  const verifiedArrears = Number(importStats?.verifiedArrears || 0)
  const verifiedMonthlyPerformance = Number(importStats?.verifiedCurrent || 0)

  // FRESH ADVANCES CALCULATION (Aug 28 Hardening)
  // We calculate New Advances by taking Total Cash Received and subtracting the
  // portions of THAT CASH that went to Arrears and Current Bills.
  // This ensures we NEVER count old carried-over credits as new advances.
  const cashUsedForDebt = Number(importStats?.cashToArrears || 0) + Number(importStats?.cashToCurrent || 0)
  const verifiedNewAdvances = Math.max(0, verifiedTotal - cashUsedForDebt)

  // PERFORMANCE EFFICIENCY: Money that actually reduced demand vs Total Demand
  const debtRecoveryPerformance = verifiedArrears + verifiedMonthlyPerformance
  const globalRate = totalBilled > 0 ? (debtRecoveryPerformance / totalBilled) * 100 : 0

  const operationalCash = Number(receiptStats?.totalAmount || 0)
  const operationalCount = Number(receiptStats?.totalCount || 0)

  // Total System Arrears (Current Snapshot)
  const arrearsConditions = []
  if (params.schemeId && params.schemeId !== "all") arrearsConditions.push(eq(customer.waterSchemeId, params.schemeId))
  if (params.branchId && params.branchId !== "all") arrearsConditions.push(eq(waterScheme.branchId, params.branchId))
  if (params.clusterId && params.clusterId !== "all") arrearsConditions.push(eq(branch.clusterId, params.clusterId))
  if (params.category && params.category !== "all") {
    arrearsConditions.push(inArray(customer.category, getCategoryEquivalents(params.category)))
  }
  if (params.query?.trim()) {
    const q = `%${params.query.trim().toLowerCase()}%`
    const cond = or(ilike(customer.name, q), ilike(customer.customerAccount, q))
    if (cond) arrearsConditions.push(cond)
  }

  forceHierarchy(arrearsConditions)
  if (customerScope) arrearsConditions.push(customerScope)

  // Optimization: Direct customer query for debt snapshot (fewer joins)
  const [arrearsSnapshot] = await db
    .select({
      totalDebt: sql<number>`sum(case when ${customer.accountBalance} > 0 then ${customer.accountBalance} else 0 end)::numeric`,
      totalCredit: sql<number>`sum(case when ${customer.accountBalance} < 0 then abs(${customer.accountBalance}) else 0 end)::numeric`,
    })
    .from(customer)
    .leftJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
    .leftJoin(branch, eq(waterScheme.branchId, branch.id))
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
      unpaidCount: Number(importStats?.unpaidCount || 0) + Number(fieldStats?.billedCount || 0),
    },
    collections: {
      verifiedTotal,
      verifiedMonthly: verifiedMonthlyPerformance,
      verifiedArrears,
      verifiedAdvances: verifiedNewAdvances,
      operationalCash,
      operationalCount,
      outstanding: Math.max(0, totalBilled - verifiedTotal),
      collectionRate: globalRate,
      arrearsRate: arrearsBilled > 0 ? (verifiedArrears / arrearsBilled) * 100 : 0,
      currentRate: currentBilled > 0 ? (verifiedMonthlyPerformance / currentBilled) * 100 : 0,
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

  const conditions = [gte(receipt.paymentDate, startDate), ne(receipt.reconciliationStatus, 'void')]
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
  // canUploadBilling was the wrong gate here -- that permission is about
  // importing billing data, not viewing payment history. A user with
  // reports access but no upload rights was incorrectly blocked; this is
  // a read/reporting function, gate it the same as the rest of this file.
  if (!canViewReports(current)) throw new Error("Forbidden")

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

  // Excludes voided receipts -- previously a voided payment still counted
  // toward this bill's totalPaid, overstating how much was actually paid.
  const receipts = await db
    .select()
    .from(receipt)
    .where(and(eq(receipt.billingRecordId, billingRecordId), ne(receipt.reconciliationStatus, 'void')))
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
export async function getTopDebtors(params: {
  limit?: number
  category?: string
  query?: string
  schemeId?: string
  branchId?: string
  clusterId?: string
}) {
  const current = await requireUser()
  if (!canViewReports(current)) throw new Error("Forbidden")

  // Regression check: this cap was added and pushed earlier, then lost
  // when a later push overwrote this file wholesale -- re-applying.
  // Uncapped, a client could request getTopDebtors({ limit: 999999 }) and
  // cause a timeout/memory risk.
  const limit = Math.min(Math.max(1, params.limit ?? 10), 500)

  const conditions = [
    eq(customer.active, true),
    sql`${customer.accountBalance} > 0`,
    applyCustomerScope(current)
  ]

  if (params.schemeId && params.schemeId !== "all") conditions.push(eq(customer.waterSchemeId, params.schemeId))
  if (params.branchId && params.branchId !== "all") conditions.push(eq(waterScheme.branchId, params.branchId))
  if (params.clusterId && params.clusterId !== "all") conditions.push(eq(branch.clusterId, params.clusterId))
  if (params.category && params.category !== "all") {
    conditions.push(inArray(customer.category, getCategoryEquivalents(params.category)))
  }

  if (params.query?.trim()) {
    const q = `%${params.query.trim().toLowerCase()}%`
    const cond = or(ilike(customer.name, q), ilike(customer.customerAccount, q))
    if (cond) conditions.push(cond)
  }

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
    .leftJoin(branch, eq(waterScheme.branchId, branch.id))
    .where(and(...conditions))
    .orderBy(desc(sql`${customer.accountBalance}::numeric`))
    .limit(limit)
}
