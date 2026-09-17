"use server"

import { db } from "@/lib/db"
import { billingRecord } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { requireUser } from "@/lib/session"
import { canIssueReceipt, canViewMeterReadings } from "@/lib/permissions"
import { createReceipt } from "./receipts"
import { CreateReceiptInput } from "@/lib/finance-schemas"
import { reportBillingDiscrepancy, submitMeterReading } from "./billing-engine"

export type OfflineSyncResult = {
  tempId: string
  success: boolean
  serverId?: string
  receiptNumber?: string
  error?: string
  filedAs?: "reading" | "receipt" | "discrepancy" | "duplicate"
}

/**
 * Batch processes receipts issued while offline.
 */
export async function syncOfflineReceiptBatch(batch: { tempId: string; data: CreateReceiptInput & { idempotencyKey?: string } }[]) {
  const current = await requireUser()
  if (!canIssueReceipt(current)) throw new Error("Forbidden")

  const results: OfflineSyncResult[] = []

  for (const item of batch) {
    try {
      const res = await createReceipt(item.data)
      if (res.ok) {
        results.push({ tempId: item.tempId, success: true, serverId: res.receipt.id, receiptNumber: res.receipt.receiptNumber, filedAs: "receipt" })
      } else {
        results.push({ tempId: item.tempId, success: false, error: res.error })
      }
    } catch (err: unknown) {
      results.push({ tempId: item.tempId, success: false, error: err instanceof Error ? err.message : "Sync failed" })
    }
  }
  return results
}

async function fileReadingAsDiscrepancy(data: {
  customerId: string
  billingPeriodId: string
  currentReading: number
  previousReading: number
  notes?: string
}) {
  const [bill] = await db
    .select({
      currentCharges: billingRecord.currentCharges,
      totalDue: billingRecord.totalDue,
    })
    .from(billingRecord)
    .where(and(
      eq(billingRecord.customerId, data.customerId),
      eq(billingRecord.billingPeriodId, data.billingPeriodId),
    ))
    .limit(1)

  const existingAmount = Number(bill?.currentCharges ?? bill?.totalDue ?? 0)
  await reportBillingDiscrepancy({
    customerId: data.customerId,
    billingPeriodId: data.billingPeriodId,
    attemptedReading: data.currentReading,
    existingAmount,
    reason: [
      `Offline reading ${data.currentReading} m³ (previous ${data.previousReading}).`,
      "Customer already has a monthly bill for this period, so this was filed as a billing exception instead of a second bill.",
      data.notes ? `Notes: ${data.notes}` : "",
    ].filter(Boolean).join(" "),
  })
}

async function pushOneOfflineReading(item: {
  tempId: string
  data: {
    customerId: string
    billingPeriodId: string
    currentReading: number
    previousReading: number
    notes?: string
    idempotencyKey?: string
  }
}): Promise<OfflineSyncResult> {
  try {
    const res = await submitMeterReading({
      ...item.data,
      // Field capture is the bill. SMS is a separate, opt-in action.
      sendSms: false,
    })

    if (res.ok) {
      return { tempId: item.tempId, success: true, serverId: res.readingId, filedAs: "reading" }
    }
    return { tempId: item.tempId, success: false, error: "Reading failed" }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Reading sync failed"

    if (/already been recorded/i.test(message)) {
      return { tempId: item.tempId, success: true, filedAs: "duplicate" }
    }

    if (/already been billed/i.test(message)) {
      try {
        await fileReadingAsDiscrepancy(item.data)
        return { tempId: item.tempId, success: true, filedAs: "discrepancy" }
      } catch {
        return { tempId: item.tempId, success: false, error: message }
      }
    }

    return { tempId: item.tempId, success: false, error: message }
  }
}

/**
 * Batch processes meter readings captured while offline.
 */
export async function syncOfflineMeterReadingBatch(batch: {
  tempId: string
  data: {
    customerId: string
    billingPeriodId: string
    currentReading: number
    previousReading: number
    notes?: string
    idempotencyKey?: string
  }
}[]) {
  const current = await requireUser()

  if (!canIssueReceipt(current) && !canViewMeterReadings(current)) {
    throw new Error("Forbidden")
  }

  const results: OfflineSyncResult[] = []
  for (const item of batch) {
    results.push(await pushOneOfflineReading(item))
  }
  return results
}
