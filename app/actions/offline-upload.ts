"use server"

import { requireUser } from "@/lib/session"
import { canIssueReceipt } from "@/lib/permissions"
import { createReceipt } from "./receipts"
import { CreateReceiptInput } from "@/lib/finance-schemas"
import { submitMeterReading } from "./billing-engine"

export type OfflineSyncResult = {
  tempId: string;
  success: boolean;
  serverId?: string;
  receiptNumber?: string;
  error?: string;
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
        results.push({ tempId: item.tempId, success: true, serverId: res.receipt.id, receiptNumber: res.receipt.receiptNumber })
      } else {
        results.push({ tempId: item.tempId, success: false, error: res.error })
      }
    } catch (err: any) {
      results.push({ tempId: item.tempId, success: false, error: err.message || "Sync failed" })
    }
  }
  return results
}

/**
 * Batch processes meter readings captured while offline.
 */
export async function syncOfflineMeterReadingBatch(batch: {
  tempId: string;
  data: {
    customerId: string;
    billingPeriodId: string;
    currentReading: number;
    previousReading: number;
    notes?: string;
    idempotencyKey?: string;
  }
}[]) {
  const current = await requireUser()
  if (!canIssueReceipt(current)) throw new Error("Forbidden")

  const results: OfflineSyncResult[] = []

  for (const item of batch) {
    try {
      const res = await submitMeterReading({
        ...item.data,
        sendSms: true // Default to true for offline syncs
      })

      if (res.ok) {
        results.push({ tempId: item.tempId, success: true, serverId: res.readingId })
      } else {
        // @ts-expect-error - Fix silent drop bug
        results.push({ tempId: item.tempId, success: false, error: res.error || "Reading failed" })
      }
    } catch (err: any) {
      results.push({ tempId: item.tempId, success: false, error: err.message || "Reading sync failed" })
    }
  }

  return results
}
