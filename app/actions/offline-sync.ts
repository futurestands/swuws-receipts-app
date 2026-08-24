"use server"

import { db } from "@/lib/db"
import { customer, billingRecord, billingPeriod } from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { applyCustomerScope } from "@/lib/scopes"
import { and, eq, inArray } from "drizzle-orm"

export async function getAgentOfflineData() {
  const current = await requireUser()
  const customerScope = applyCustomerScope(current)

  // 1. Fetch the active billing period
  const [activePeriod] = await db
    .select({ id: billingPeriod.id })
    .from(billingPeriod)
    .where(eq(billingPeriod.status, "active"))
    .limit(1)

  // 2. Fetch scoped customers
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
    .where(customerScope)

  if (scopedCustomers.length === 0) {
    return {
      customers: [],
      billingRecords: [],
      activePeriodId: activePeriod?.id || null,
      timestamp: new Date().toISOString(),
    }
  }

  // 3. Fetch active-period billing records for these specific customers
  const customerIds = scopedCustomers.map((c) => c.id)

  let activeBillingRecords: any[] = []
  if (activePeriod) {
    activeBillingRecords = await db
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
          inArray(billingRecord.customerId, customerIds)
        )
      )
  }

  return {
    customers: scopedCustomers,
    billingRecords: activeBillingRecords,
    activePeriodId: activePeriod?.id || null,
    timestamp: new Date().toISOString(),
  }
}
