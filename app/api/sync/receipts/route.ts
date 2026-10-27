import { db } from "@/lib/db"
import { receipt } from "@/lib/db/schema"
import { createReceipt } from "@/app/actions/receipts"
import { requireUser } from "@/lib/session"
import { canIssueReceipt } from "@/lib/permissions"
import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { applyReceiptScope, validateWriteScope } from "@/lib/scopes"

/**
 * IDEMPOTENT BATCH SYNC FOR RECEIPTS
 */
export async function POST(req: Request) {
  try {
    const current = await requireUser()
    if (!canIssueReceipt(current)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json()
    const { batch } = body

    if (!Array.isArray(batch)) {
      return NextResponse.json({ error: "Invalid batch format" }, { status: 400 })
    }

    const results = []
    const retryScope = applyReceiptScope(current, "receipts.create")

    for (const item of batch) {
      try {
        if (!(await validateWriteScope(current, "receipts.create", { branchId: item.data.branchId }))) {
          results.push({ tempId: item.tempId, success: false, error: "You are not authorized to issue receipts for this branch" })
          continue
        }
        // 1. Double check idempotency even before calling createReceipt
        // This is a safety layer in case the action's guard is bypassed
        if (item.data.idempotencyKey) {
          const [existing] = await db
            .select({ id: receipt.id, receiptNumber: receipt.receiptNumber })
            .from(receipt)
            .where(and(eq(receipt.idempotencyKey, item.data.idempotencyKey), retryScope))
            .limit(1)

          if (existing) {
            results.push({
              tempId: item.tempId,
              success: true,
              serverId: existing.id,
              receiptNumber: existing.receiptNumber,
              deduplicated: true
            })
            continue
          }
        }

        // 2. Call the standard creation logic (which has its own guards/locking)
        const res = await createReceipt(item.data)

        if (res.ok) {
          results.push({
            tempId: item.tempId,
            success: true,
            serverId: res.receipt.id,
            receiptNumber: res.receipt.receiptNumber
          })
        } else {
          results.push({ tempId: item.tempId, success: false, error: res.error })
        }
      } catch (err: unknown) {
        const message = typeof err === "object" && err !== null && "message" in err && typeof err.message === "string"
          ? err.message
          : undefined
        const duplicateReceiptId = typeof err === "object" && err !== null && "duplicateReceiptId" in err && typeof err.duplicateReceiptId === "string"
          ? err.duplicateReceiptId
          : undefined
        // Handle the specific DUPLICATE_RECEIPT error thrown by the action if a race occurred
        if (message === "DUPLICATE_RECEIPT" && duplicateReceiptId) {
           // Fetch the number for the response
           const [existing] = await db
             .select({ receiptNumber: receipt.receiptNumber })
             .from(receipt)
             .where(and(eq(receipt.id, duplicateReceiptId), retryScope))
             .limit(1)

           if (!existing) {
             results.push({ tempId: item.tempId, success: false, error: "Receipt not found or access denied" })
             continue
           }

           results.push({
             tempId: item.tempId,
             success: true,
             serverId: duplicateReceiptId,
             receiptNumber: existing?.receiptNumber,
             deduplicated: true
           })
        } else {
          results.push({ tempId: item.tempId, success: false, error: message || "Sync failed" })
        }
      }
    }

    return NextResponse.json(results)
  } catch (err: unknown) {
    console.error("Batch receipt sync error:", err)
    const message = typeof err === "object" && err !== null && "message" in err && typeof err.message === "string"
      ? err.message
      : undefined
    return NextResponse.json({ error: message || "Internal server error" }, { status: 500 })
  }
}
