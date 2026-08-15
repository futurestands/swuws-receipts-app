"use server"

import { requireUser } from "@/lib/session"
import { canIssueReceipt } from "@/lib/permissions"
import { createReceipt } from "./receipts"
import { CreateReceiptInput } from "@/lib/finance-schemas"

export type OfflineSyncResult = {
  tempId: string;
  success: boolean;
  serverId?: string;
  receiptNumber?: string;
  error?: string;
}

/**
 * Batch processes receipts issued while offline.
 * Reuses the existing createReceipt logic to ensure consistency.
 */
export async function syncOfflineReceiptBatch(batch: { tempId: string; data: CreateReceiptInput }[]) {
  const current = await requireUser()
  if (!canIssueReceipt(current)) throw new Error("Forbidden")

  const results: OfflineSyncResult[] = []

  for (const item of batch) {
    try {
      // Re-validate each receipt using the core engine
      const res = await createReceipt(item.data)

      if (res.ok) {
        results.push({
          tempId: item.tempId,
          success: true,
          serverId: res.receipt.id,
          receiptNumber: res.receipt.receiptNumber
        })
      } else {
        results.push({
          tempId: item.tempId,
          success: false,
          error: res.error
        })
      }
    } catch (err: any) {
      results.push({
        tempId: item.tempId,
        success: false,
        error: err.message || "Unknown error during sync"
      })
    }
  }

  return results
}
