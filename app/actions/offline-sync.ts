"use server"

import { db } from "@/lib/db"
import { customer, billingRecord, billingPeriod } from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { applyCustomerScope } from "@/lib/scopes"
import { and, eq, gt, asc, inArray, count } from "drizzle-orm"
import { OFFLINE_PULL_PAGE_SIZE } from "@/lib/offline/pull-limits"

const BILLING_ID_CHUNK = 5000

export type AgentOfflinePage = {
  customers: Array<{
    id: string
    customerAccount: string | null
    name: string
    phone: string | null
    address: string | null
    accountBalance: string
    category: string
    active: boolean
    updatedAt: Date
    lastReading: number
  }>
  billingRecords: Array<{
    id: string
    customerId: string | null
    totalDue: string | null
    arrears: string | null
    billAmount: string | null
    status: string | null
    billingPeriodId: string | null
  }>
  activePeriodId: string | null
  timestamp: string
  nextCursor: string | null
  totalCount: number
}

function scopedActiveFilter(
  customerScope: ReturnType<typeof applyCustomerScope>,
  cursor: string | null
) {
  const parts = [eq(customer.active, true)]
  if (customerScope) parts.push(customerScope)
  if (cursor) parts.push(gt(customer.id, cursor))
  return and(...parts)
}

/**
 * One page of the agent's offline cache. Never returns the full 100k+
 * customer set in a single payload — that previously OOM'd the WebView
 * and the Vercel function for HQ / global-scope users.
 */
export async function getAgentOfflinePage(input?: {
  cursor?: string | null
}): Promise<AgentOfflinePage> {
  const current = await requireUser()
  const customerScope = applyCustomerScope(current)
  const cursor = input?.cursor?.trim() || null

  const [activePeriod] = await db
    .select({ id: billingPeriod.id })
    .from(billingPeriod)
    .where(eq(billingPeriod.status, "active"))
    .limit(1)

  const filter = scopedActiveFilter(customerScope, cursor)

  let totalCount = 0
  if (!cursor) {
    const [countRow] = await db
      .select({ value: count() })
      .from(customer)
      .where(scopedActiveFilter(customerScope, null))
    totalCount = Number(countRow?.value ?? 0)
  }

  const scopedCustomers = await db
    .select({
      id: customer.id,
      customerAccount: customer.customerAccount,
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      accountBalance: customer.accountBalance,
      category: customer.category,
      active: customer.active,
      updatedAt: customer.updatedAt,
      lastReading: customer.lastReading,
    })
    .from(customer)
    .where(filter)
    .orderBy(asc(customer.id))
    .limit(OFFLINE_PULL_PAGE_SIZE + 1)

  const hasMoreInDb = scopedCustomers.length > OFFLINE_PULL_PAGE_SIZE
  const page = scopedCustomers.slice(0, OFFLINE_PULL_PAGE_SIZE)

  const empty: AgentOfflinePage = {
    customers: [],
    billingRecords: [],
    activePeriodId: activePeriod?.id || null,
    timestamp: new Date().toISOString(),
    nextCursor: null,
    totalCount,
  }

  if (page.length === 0) return empty

  const customerIds = page.map((c) => c.id)
  const activeBillingRecords: AgentOfflinePage["billingRecords"] = []

  if (activePeriod) {
    for (let i = 0; i < customerIds.length; i += BILLING_ID_CHUNK) {
      const chunk = customerIds.slice(i, i + BILLING_ID_CHUNK)
      const records = await db
        .select({
          id: billingRecord.id,
          customerId: billingRecord.customerId,
          totalDue: billingRecord.totalDue,
          arrears: billingRecord.arrears,
          billAmount: billingRecord.billAmount,
          status: billingRecord.status,
          billingPeriodId: billingRecord.billingPeriodId,
        })
        .from(billingRecord)
        .where(
          and(
            eq(billingRecord.billingPeriodId, activePeriod.id),
            inArray(billingRecord.customerId, chunk)
          )
        )
      activeBillingRecords.push(...records)
    }
  }

  return {
    customers: page,
    billingRecords: activeBillingRecords,
    activePeriodId: activePeriod?.id || null,
    timestamp: new Date().toISOString(),
    nextCursor: hasMoreInDb ? page[page.length - 1].id : null,
    totalCount,
  }
}
