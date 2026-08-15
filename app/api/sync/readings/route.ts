import { db } from "@/lib/db"
import { meterReading } from "@/lib/db/schema"
import { submitMeterReading } from "@/app/actions/billing-engine"
import { requireUser } from "@/lib/session"
import { canIssueReceipt } from "@/lib/permissions"
import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"

/**
 * IDEMPOTENT BATCH SYNC FOR METER READINGS
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
        // 1. Double check idempotency
        if (item.data.idempotencyKey) {
          const [existing] = await db
            .select({ id: meterReading.id })
            .from(meterReading)
            .where(eq(meterReading.idempotencyKey, item.data.idempotencyKey))
            .limit(1)

          if (existing) {
            results.push({
              tempId: item.tempId,
              success: true,
              serverId: existing.id,
              deduplicated: true
            })
            continue
          }
        }

        // 2. Call standard logic
        const res = await submitMeterReading({
          ...item.data,
          sendSms: true
        })

        if (res.ok) {
          results.push({
            tempId: item.tempId,
            success: true,
            serverId: res.readingId
          })
        } else {
          // Fix silent drop bug: ensure error is returned
          results.push({
            tempId: item.tempId,
            success: false,
            error: res.error || "Submission failed"
          })
        }
      } catch (err: any) {
        results.push({
          tempId: item.tempId,
          success: false,
          error: err.message || "Sync failed"
        })
      }
    }

    return NextResponse.json(results)
  } catch (err: any) {
    console.error("Batch reading sync error:", err)
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 })
  }
}
