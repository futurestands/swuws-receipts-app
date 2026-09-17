import { syncOfflineMeterReadingBatch } from "@/app/actions/offline-upload"
import { requireUser } from "@/lib/session"
import { canIssueReceipt, canViewMeterReadings } from "@/lib/permissions"
import { NextResponse } from "next/server"

/**
 * IDEMPOTENT BATCH SYNC FOR METER READINGS
 */
export async function POST(req: Request) {
  try {
    const current = await requireUser()
    if (!canIssueReceipt(current) && !canViewMeterReadings(current)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json()
    const { batch } = body

    if (!Array.isArray(batch)) {
      return NextResponse.json({ error: "Invalid batch format" }, { status: 400 })
    }

    const results = await syncOfflineMeterReadingBatch(batch)
    return NextResponse.json(results)
  } catch (err: unknown) {
    console.error("Batch reading sync error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    )
  }
}
