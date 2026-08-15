import { db } from "@/lib/db"
import { receipt } from "@/lib/db/schema"
import { createReceipt } from "@/app/actions/receipts"
import { requireUser } from "@/lib/session"
import { canIssueReceipt } from "@/lib/permissions"
import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"

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

    for (const item of batch) {
      try {
        // 1. Double check idempotency even before calling createReceipt
        // This is a safety layer in case the action's guard is bypassed
        if (item.data.idempotencyKey) {
          const [existing] = await db
            .select({ id: receipt.id, receiptNumber: receipt.receiptNumber })
            .from(receipt)
            .where(eq(receipt.idempotencyKey, item.data.idempotencyKey))
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
      } catch (err: any) {
        // Handle the specific DUPLICATE_RECEIPT error thrown by the action if a race occurred
        if (err.message === "DUPLICATE_RECEIPT" && err.duplicateReceiptId) {
           // Fetch the number for the response
           const [existing] = await db
             .select({ receiptNumber: receipt.receiptNumber })
             .from(receipt)
             .where(eq(receipt.id, err.duplicateReceiptId))
             .limit(1)

           results.push({
             tempId: item.tempId,
             success: true,
             serverId: err.duplicateReceiptId,
             receiptNumber: existing?.receiptNumber,
             deduplicated: true
           })
        } else {
          results.push({ tempId: item.tempId, success: false, error: err.message || "Sync failed" })
        }
      }
    }

    return NextResponse.json(results)
  } catch (err: any) {
    console.error("Batch receipt sync error:", err)
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 })
  }
}
