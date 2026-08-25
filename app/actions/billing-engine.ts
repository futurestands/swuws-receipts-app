"use server"

import { db } from "@/lib/db"
import { customer, tariffConfiguration, meterReading, waterScheme, billingPeriod, managedTemplate, templateVersion, branch, billingRecord, billingDiscrepancy, user as userTable } from "@/lib/db/schema"
import { eq, and, desc, or, ilike, inArray } from "drizzle-orm"
import { randomUUID } from "crypto"
import { requireUser } from "@/lib/session"
import { calculateBill } from "@/lib/billing/math"
import { revalidatePath, revalidateTag } from "next/cache"
import { canConfigureSystem, canIssueReceipt } from "@/lib/permissions"
import { ROLES } from "@/lib/permissions/roles"
import { writeAudit } from "@/lib/audit"
import { applyCustomerScope } from "@/lib/scopes"
import { renderTemplate } from "@/lib/templates/template-engine"
import { sendSMS } from "@/lib/sms-service"
import { createNotification } from "./notifications"
import { getSettings } from "./settings"
import { normalizeCategory, getCategoryEquivalents } from "@/lib/utils/category"

/**
 * Searches customers by name, account, or meter ref.
 * Finding 1 Fix: Added permission check and scope filter.
 */
export async function searchCustomersForReading(query: string) {
  const user = await requireUser()
  if (!canIssueReceipt(user)) throw new Error("Forbidden")

  return db
    .select()
    .from(customer)
    .where(
      and(
        or(
          ilike(customer.name, `%${query}%`),
          ilike(customer.customerAccount, `%${query}%`),
          ilike(customer.meterRef, `%${query}%`)
        ),
        applyCustomerScope(user)
      )
    )
    .limit(10)
}

export async function getTariffForCustomer(customerId: string) {
  const [cust] = await db
    .select({
      id: customer.id,
      waterSchemeId: customer.waterSchemeId,
      branchId: waterScheme.branchId,
      category: customer.category,
    })
    .from(customer)
    .leftJoin(waterScheme, eq(customer.waterSchemeId, waterScheme.id))
    .where(eq(customer.id, customerId))
    .limit(1)

  if (!cust) return null

  const category = normalizeCategory(cust.category)

  if (cust.waterSchemeId) {
    const [schemeTariff] = await db
      .select()
      .from(tariffConfiguration)
      .where(
        and(
          eq(tariffConfiguration.targetType, "scheme"),
          eq(tariffConfiguration.targetId, cust.waterSchemeId),
          inArray(tariffConfiguration.customerCategory, getCategoryEquivalents(category)),
          eq(tariffConfiguration.active, true)
        )
      )
      .limit(1)

    if (schemeTariff) return schemeTariff
  }

  if (cust.branchId) {
    const [branchTariff] = await db
      .select()
      .from(tariffConfiguration)
      .where(
        and(
          eq(tariffConfiguration.targetType, "branch"),
          eq(tariffConfiguration.targetId, cust.branchId),
          inArray(tariffConfiguration.customerCategory, getCategoryEquivalents(category)),
          eq(tariffConfiguration.active, true)
        )
      )
      .limit(1)

    if (branchTariff) return branchTariff
  }

  return null
}

export async function submitMeterReading(data: {
  customerId: string
  billingPeriodId: string
  currentReading: number
  previousReading?: number // Allow manual override
  notes?: string
  phoneNumber?: string
  sendSms?: boolean
  idempotencyKey?: string
}) {
  const user = await requireUser()
  if (!canIssueReceipt(user)) throw new Error("Forbidden")

  // 0. Idempotency Guard
  if (data.idempotencyKey) {
    const [existing] = await db
      .select({ id: meterReading.id })
      .from(meterReading)
      .where(eq(meterReading.idempotencyKey, data.idempotencyKey))
      .limit(1)

    if (existing) {
      return { ok: true, readingId: existing.id }
    }
  }

  // Finding 2 Fix: Verify Active Billing Period in the action
  const [period] = await db
    .select()
    .from(billingPeriod)
    .where(and(
      eq(billingPeriod.id, data.billingPeriodId),
      eq(billingPeriod.status, "active")
    ))
    .limit(1)

  if (!period) throw new Error("Meter readings can only be submitted for an ACTIVE billing period.")

  const [cust] = await db
    .select()
    .from(customer)
    .where(and(
      eq(customer.id, data.customerId),
      applyCustomerScope(user) // Finding 2 Fix: Apply scope check
    ))
    .limit(1)

  if (!cust) throw new Error("Customer not found or access denied")

  // Use manual override if provided, otherwise fallback to system last reading
  const effectivePreviousReading = data.previousReading !== undefined ? data.previousReading : cust.lastReading

  // Finding 3 Fix: Server-side validation of reading value
  if (data.currentReading < effectivePreviousReading) {
    throw new Error(`Invalid reading: ${data.currentReading} is lower than the previous reading of ${effectivePreviousReading}`)
  }

  // Check for duplicate reading in this period
  const [existing] = await db
    .select({ id: meterReading.id })
    .from(meterReading)
    .where(and(
      eq(meterReading.customerId, data.customerId),
      eq(meterReading.billingPeriodId, data.billingPeriodId)
    ))
    .limit(1)

  if (existing) {
    throw new Error(`A meter reading for ${cust.name} in this period has already been recorded. Search your history below if you need to reprint the ticket.`)
  }

  // Check if a monthly bill has already been imported for this customer
  const [existingBill] = await db
    .select({ id: billingRecord.id })
    .from(billingRecord)
    .where(and(
      eq(billingRecord.customerId, data.customerId),
      eq(billingRecord.billingPeriodId, data.billingPeriodId)
    ))
    .limit(1)

  if (existingBill) {
    throw new Error(`This customer has already been billed via the monthly import for this period. Manual readings are disabled for this customer to prevent double billing. If you believe the imported data is incorrect, please report this to your supervisor.`)
  }

  const tariff = await getTariffForCustomer(data.customerId)
  if (!tariff) throw new Error("No active tariff configured for this area. Contact Admin.")

  // Handle numeric strings from DB
  const unitPrice = Number(tariff.unitPrice)
  const serviceFee = Number(tariff.serviceFee)
  const calc = calculateBill(effectivePreviousReading, data.currentReading, { ...tariff, unitPrice, serviceFee })

  // Finding 8 Fix: Calculate Grand Total (New Bill + Existing Arrears)
  const totalArrears = Number(cust.accountBalance) || 0
  const grandTotalDue = calc.totalNewBill + totalArrears

  const readingId = randomUUID()
  const finalPhone = data.phoneNumber?.trim() || cust.phone

  await db.transaction(async (tx) => {
    await tx.insert(meterReading).values({
      id: readingId,
      customerId: data.customerId,
      billingPeriodId: data.billingPeriodId,
      previousReading: effectivePreviousReading,
      currentReading: data.currentReading,
      consumption: calc.consumption,
      billedAmount: String(calc.totalNewBill),
      previousBalanceSnapshot: String(totalArrears),
      totalDueSnapshot: String(grandTotalDue),
      customerNameSnapshot: cust.name,
      customerAccountSnapshot: cust.customerAccount,
      phoneSnapshot: finalPhone,
      meterRefSnapshot: cust.meterRef,
      recordedById: user.id,
      notes: data.notes,
      idempotencyKey: data.idempotencyKey || null,
    })

    // EBS (the daily collection sync / monthly bill import) is the single
    // source of truth for customer.accountBalance -- a meter reading is a
    // field observation of what the customer should be billed, the same
    // way a receipt is a field observation of what was paid. Neither
    // should move the live balance directly. The bill this reading
    // produces lives on the meterReading row itself (billedAmount,
    // previousBalanceSnapshot, totalDueSnapshot) for reconciliation and
    // reporting; only an EBS event may change accountBalance.
    await tx
      .update(customer)
      .set({
        lastReading: data.currentReading,
        lastReadingDate: new Date(),
        phone: finalPhone, // Update phone if changed
        updatedAt: new Date(),
      })
      .where(eq(customer.id, data.customerId))
  })

  // SMS Notification
  if (data.sendSms && finalPhone) {
    const [template] = await db.select().from(managedTemplate).where(eq(managedTemplate.code, 'notif.billing.sms')).limit(1)
    if (template?.activeVersionId) {
      const [version] = await db.select().from(templateVersion).where(eq(templateVersion.id, template.activeVersionId)).limit(1)
      if (version) {
        const settings = await getSettings()
        const dueDate = new Date(period.endDate)
        dueDate.setDate(dueDate.getDate() + settings.billingGraceDays)

        const message = renderTemplate(
          version.content,
          {
            customer_name: cust.name,
            amount: calc.totalNewBill.toLocaleString(),
            period: period?.periodName || "Current",
            due_date: dueDate.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            }),
          },
          { escape: template.type === "HTML" },
        )
        await sendSMS(finalPhone, message, user.id)

        await db.update(meterReading)
          .set({ isNotified: true, notifiedAt: new Date() })
          .where(eq(meterReading.id, readingId))
      }
    }
  }

  // @ts-expect-error - External library types mismatch
  revalidateTag("dashboard-stats")
  return { ok: true, readingId }
}

/**
 * Reports a discrepancy when a field agent finds that an imported bill is wrong.
 */
export async function reportBillingDiscrepancy(data: {
  customerId: string
  billingPeriodId: string
  attemptedReading: number
  existingAmount: number
  reason: string
}) {
  const user = await requireUser()
  if (!canIssueReceipt(user)) throw new Error("Forbidden")

  const id = randomUUID()
  await db.insert(billingDiscrepancy).values({
    id,
    customerId: data.customerId,
    billingPeriodId: data.billingPeriodId,
    sourceType: 'field_reading',
    reportedById: user.id,
    existingValue: data.existingAmount,
    attemptedValue: data.attemptedReading,
    reason: data.reason,
    status: 'open',
  })

  // Notify Admins
  const admins = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.role, 'admin'))
  for (const admin of admins) {
    await createNotification({
      userId: admin.id,
      type: "billing_discrepancy",
      title: "Billing Discrepancy Reported",
      message: `Agent ${user.name} reported a conflict for a customer in the ${data.billingPeriodId} period.`,
      priority: "high",
      relatedEntityType: "customer",
      relatedEntityId: data.customerId
    })
  }

  return { ok: true }
}

/**
 * Fetches billing discrepancies for admin review.
 */
export async function getBillingDiscrepancies() {
  const user = await requireUser()
  if (user.role !== 'admin') throw new Error("Forbidden")

  return db
    .select({
      id: billingDiscrepancy.id,
      customerName: customer.name,
      customerAccount: customer.customerAccount,
      periodName: billingPeriod.periodName,
      sourceType: billingDiscrepancy.sourceType,
      existingValue: billingDiscrepancy.existingValue,
      attemptedValue: billingDiscrepancy.attemptedValue,
      reason: billingDiscrepancy.reason,
      status: billingDiscrepancy.status,
      reportedByName: userTable.name,
      createdAt: billingDiscrepancy.createdAt,
    })
    .from(billingDiscrepancy)
    .innerJoin(customer, eq(billingDiscrepancy.customerId, customer.id))
    .innerJoin(billingPeriod, eq(billingDiscrepancy.billingPeriodId, billingPeriod.id))
    .leftJoin(userTable, eq(billingDiscrepancy.reportedById, userTable.id))
    .orderBy(desc(billingDiscrepancy.createdAt))
}

export async function listAllTariffs() {
  const user = await requireUser()
  if (!canConfigureSystem(user)) throw new Error("Unauthorized")

  const tariffs = await db.select().from(tariffConfiguration).orderBy(desc(tariffConfiguration.createdAt))
  const branchList = await db.select().from(branch)
  const schemeList = await db.select().from(waterScheme)

  return tariffs.map(t => {
    let targetName = "Unknown"
    if (t.targetType === "branch") {
      targetName = branchList.find(b => b.id === t.targetId)?.name || "Unknown Branch"
    } else {
      targetName = schemeList.find(s => s.id === t.targetId)?.name || "Unknown Scheme"
    }
    return { ...t, targetName }
  })
}

export async function upsertTariff(data: {
  id?: string
  targetType: "branch" | "scheme"
  targetId: string
  customerCategory: string
  unitPrice: number
  serviceFee: number
  vatPercentage: number
}) {
  const user = await requireUser()
  if (!canConfigureSystem(user)) throw new Error("Unauthorized")

  const id = data.id || randomUUID()
  const category = data.customerCategory.toLowerCase().trim()

  await db
    .insert(tariffConfiguration)
    .values({
      id,
      targetType: data.targetType,
      targetId: data.targetId,
      customerCategory: category,
      unitPrice: String(data.unitPrice),
      serviceFee: String(data.serviceFee),
      vatPercentage: data.vatPercentage,
      active: true,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [tariffConfiguration.targetType, tariffConfiguration.targetId, tariffConfiguration.customerCategory],
      set: {
        unitPrice: String(data.unitPrice),
        serviceFee: String(data.serviceFee),
        vatPercentage: data.vatPercentage,
        updatedAt: new Date(),
      },
    })

  revalidatePath("/admin")
  return { ok: true }
}

export async function deleteTariff(id: string) {
  const user = await requireUser()
  if (!canConfigureSystem(user)) throw new Error("Unauthorized")

  await db.delete(tariffConfiguration).where(eq(tariffConfiguration.id, id))

  revalidatePath("/admin")
  return { ok: true }
}

/**
 * Resolves a reported billing discrepancy.
 * Actions: 'accept' (overwrites bill with field data) or 'reject' (keeps original).
 */
export async function resolveBillingDiscrepancy(id: string, action: 'accept' | 'reject', notes: string) {
  const current = await requireUser()
  if (current.role !== ROLES.SYSTEM_ADMIN && (current.roleLevel ?? 0) < 10) throw new Error("Forbidden")

  const [discrepancy] = await db
    .select()
    .from(billingDiscrepancy)
    .where(eq(billingDiscrepancy.id, id))
    .limit(1)

  if (!discrepancy) throw new Error("Discrepancy not found")

  await db.transaction(async (tx) => {
    if (action === 'accept') {
      // EBS (daily collection sync / monthly bill import) is the single
      // source of truth for customer.accountBalance -- accepting a field
      // discrepancy corrects the BILL (billingRecord.totalDue), not the
      // live balance. The live balance is left untouched here; the next
      // EBS sync reconciles it against the corrected bill. Previously this
      // blindly overwrote accountBalance with a value frozen at the moment
      // the discrepancy was reported, silently erasing any real payment
      // collected while it sat open.
      await tx.update(billingRecord)
        .set({ totalDue: String(discrepancy.attemptedValue), updatedAt: new Date() })
        .where(and(
          eq(billingRecord.customerId, discrepancy.customerId),
          eq(billingRecord.billingPeriodId, discrepancy.billingPeriodId)
        ))
    }

    // Close the discrepancy record
    await tx.update(billingDiscrepancy)
      .set({
        status: action === 'accept' ? 'resolved' : 'ignored',
        resolutionNotes: notes,
        resolvedById: current.id,
        resolvedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(billingDiscrepancy.id, id))

    await writeAudit({
      user: current,
      action: action === 'accept' ? "billing.discrepancy.resolved" : "billing.discrepancy.ignored",
      entityType: "billing_discrepancy",
      entityId: id,
      details: { action, customerId: discrepancy.customerId, notes }
    }, tx)
  })

  revalidatePath("/dashboard/billing/exceptions")
  return { ok: true }
}

export async function getRecentMeterReadings(limit = 20) {
  try {
    const user = await requireUser()
    if (!canIssueReceipt(user)) throw new Error("Forbidden")

    const rows = await db
      .select({
        id: meterReading.id,
        customerName: meterReading.customerNameSnapshot,
        meterRef: meterReading.meterRefSnapshot,
        previousReading: meterReading.previousReading,
        currentReading: meterReading.currentReading,
        consumption: meterReading.consumption,
        billedAmount: meterReading.billedAmount,
        previousBalance: meterReading.previousBalanceSnapshot,
        totalDue: meterReading.totalDueSnapshot,
        createdAt: meterReading.createdAt,
        periodName: billingPeriod.periodName,
        recordedById: meterReading.recordedById, // Needed for permission check in UI
        phone: meterReading.phoneSnapshot,
        isNotified: meterReading.isNotified,
      })
      .from(meterReading)
      .innerJoin(billingPeriod, eq(meterReading.billingPeriodId, billingPeriod.id))
      .where(eq(meterReading.recordedById, user.id))
      .orderBy(desc(meterReading.createdAt))
      .limit(limit)

    if (!rows) return []

    return rows.map(r => ({
      ...r,
      billedAmount: Number(r.billedAmount || 0),
      previousBalance: Number(r.previousBalance || 0),
      totalDue: Number(r.totalDue || 0)
    }))
  } catch (err) {
    console.error("getRecentMeterReadings failed:", err)
    return [] // Return empty array instead of crashing the page
  }
}

export async function cancelMeterReading(readingId: string) {
  const user = await requireUser()

  const [reading] = await db
    .select({
      id: meterReading.id,
      customerId: meterReading.customerId,
      billedAmount: meterReading.billedAmount,
      previousReading: meterReading.previousReading,
      recordedById: meterReading.recordedById,
      billingPeriodId: meterReading.billingPeriodId,
      status: billingPeriod.status,
    })
    .from(meterReading)
    .innerJoin(billingPeriod, eq(meterReading.billingPeriodId, billingPeriod.id))
    .where(eq(meterReading.id, readingId))
    .limit(1)

  if (!reading) throw new Error("Reading not found")

  // Authorization: Only the creator or an admin
  const isCreator = reading.recordedById === user.id
  const isAdmin = user.role === ROLES.SYSTEM_ADMIN || (user.roleLevel ?? 0) >= 10
  if (!isCreator && !isAdmin) {
    throw new Error("You are not authorized to cancel this reading.")
  }

  // Lifecycle Check: Only ACTIVE periods
  if (reading.status !== 'active') {
    throw new Error("Only readings in an ACTIVE billing period can be cancelled.")
  }

  await db.transaction(async (tx) => {
    // EBS (daily collection sync / monthly bill import) is the single
    // source of truth for customer.accountBalance -- cancelling a reading
    // removes the bill it produced (the meterReading row itself) but does
    // not touch the live balance. Previously this subtracted the reading's
    // billed amount straight out of accountBalance, which silently erases
    // any real payment collected since the reading was submitted (e.g. if
    // an EBS sync already reduced the balance based on this bill, this
    // reversal would double-subtract on top of that).
    await tx.delete(meterReading).where(eq(meterReading.id, readingId))

    await tx.update(customer)
      .set({
        lastReading: reading.previousReading, // Restore previous reading state
        updatedAt: new Date(),
      })
      .where(eq(customer.id, reading.customerId))

    await writeAudit({
      user,
      action: "meter_reading.cancel",
      entityType: "meter_reading",
      entityId: readingId,
      details: {
        customerId: reading.customerId,
        amountReversed: reading.billedAmount,
        reason: "User requested cancellation"
      }
    }, tx)

    // Notify Original Agent (if different from canceller)
    if (reading.recordedById !== user.id) {
      const [custInfo] = await tx.select({ name: customer.name }).from(customer).where(eq(customer.id, reading.customerId)).limit(1)
      await createNotification({
        userId: reading.recordedById,
        type: "reading_cancelled",
        title: "Meter Reading Cancelled",
        message: `Your reading for ${custInfo?.name || 'a customer'} was reversed by ${user.name}.`,
        priority: "normal",
        relatedEntityType: "customer",
        relatedEntityId: reading.customerId
      }, tx)
    }
  })

  revalidatePath("/dashboard/billing/readings")
  // @ts-expect-error - External library types mismatch
  revalidateTag("dashboard-stats")
  return { ok: true }
}

/**
 * Sends or resends an SMS notification for a meter reading.
 */
export async function sendReadingSms(readingId: string) {
  const user = await requireUser()
  if (!canIssueReceipt(user)) throw new Error("Forbidden")

  const [reading] = await db
    .select({
      id: meterReading.id,
      customerId: meterReading.customerId,
      billingPeriodId: meterReading.billingPeriodId,
      billedAmount: meterReading.billedAmount,
      phone: meterReading.phoneSnapshot,
      customerName: meterReading.customerNameSnapshot,
    })
    .from(meterReading)
    .where(eq(meterReading.id, readingId))
    .limit(1)

  if (!reading) throw new Error("Reading not found")
  if (!reading.phone) throw new Error("No phone number found for this customer")

  const [period] = await db
    .select({ periodName: billingPeriod.periodName, endDate: billingPeriod.endDate })
    .from(billingPeriod)
    .where(eq(billingPeriod.id, reading.billingPeriodId))
    .limit(1)

  const [template] = await db
    .select()
    .from(managedTemplate)
    .where(eq(managedTemplate.code, "notif.billing.sms"))
    .limit(1)

  if (template?.activeVersionId) {
    const [version] = await db
      .select()
      .from(templateVersion)
      .where(eq(templateVersion.id, template.activeVersionId))
      .limit(1)

    if (version) {
      const settings = await getSettings()
      const dueDate = period ? new Date(period.endDate) : new Date()
      if (period) dueDate.setDate(dueDate.getDate() + settings.billingGraceDays)

      const message = renderTemplate(
        version.content,
        {
          customer_name: reading.customerName,
          amount: Number(reading.billedAmount).toLocaleString(),
          period: period?.periodName || "Current",
          due_date: dueDate.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          }),
        },
        { escape: template.type === "HTML" },
      )

      await sendSMS(reading.phone, message, user.id)

      await db
        .update(meterReading)
        .set({ isNotified: true, notifiedAt: new Date() })
        .where(eq(meterReading.id, readingId))

      return { ok: true }
    }
  }

  throw new Error("SMS template not configured")
}

/**
 * Fetches data for a customer invoice (demand note).
 * Combines profile info, arrears, and latest monthly bill.
 */
export async function getCustomerInvoiceData(customerId: string) {
  const user = await requireUser()
  if (!canIssueReceipt(user)) throw new Error("Forbidden")

  // 1. Get Customer Profile
  const [cust] = await db
    .select()
    .from(customer)
    .where(and(eq(customer.id, customerId), applyCustomerScope(user)))
    .limit(1)

  if (!cust) return null

  // 2. Get latest manual reading for this period
  const [reading] = await db
    .select()
    .from(meterReading)
    .innerJoin(billingPeriod, eq(meterReading.billingPeriodId, billingPeriod.id))
    .where(and(eq(meterReading.customerId, customerId), eq(billingPeriod.status, 'active')))
    .orderBy(desc(meterReading.createdAt))
    .limit(1)

  // 3. Get latest imported bill if no reading
  const [importBill] = await db
    .select({
      id: billingRecord.id,
      totalDue: billingRecord.totalDue,
      arrears: billingRecord.arrears,
      currentCharges: billingRecord.currentCharges,
      dueDate: billingRecord.dueDate,
      periodName: billingPeriod.periodName,
    })
    .from(billingRecord)
    .innerJoin(billingPeriod, eq(billingRecord.billingPeriodId, billingPeriod.id))
    .where(and(eq(billingRecord.customerId, customerId), eq(billingPeriod.status, 'active')))
    .limit(1)

  // 4. Get Scheme & Area info
  const [schemeData] = await db
     .select({
        schemeName: waterScheme.name,
        branchName: branch.name
     })
     .from(waterScheme)
     .leftJoin(branch, eq(waterScheme.branchId, branch.id))
     .where(eq(waterScheme.id, cust.waterSchemeId || 'none'))
     .limit(1)

  return {
    customer: {
       ...cust,
       accountBalance: Number(cust.accountBalance)
    },
    reading: reading ? {
      ...reading.meter_reading,
      billedAmount: Number(reading.meter_reading.billedAmount),
      previousBalanceSnapshot: Number(reading.meter_reading.previousBalanceSnapshot),
      totalDueSnapshot: Number(reading.meter_reading.totalDueSnapshot),
      periodName: reading.billing_period.periodName,
      endDate: reading.billing_period.endDate
    } : null,
    importBill: importBill ? {
      ...importBill,
      totalDue: Number(importBill.totalDue),
      arrears: Number(importBill.arrears),
      currentCharges: Number(importBill.currentCharges)
    } : null,
    schemeName: schemeData?.schemeName || "Unknown Scheme",
    areaName: schemeData?.branchName || "Unknown Area",
  }
}

