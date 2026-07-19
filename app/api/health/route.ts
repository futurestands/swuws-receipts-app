import { db } from "@/lib/db"
import { sql } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function GET() {
  const startTime = Date.now()
  const checks: Record<string, any> = {
    timestamp: new Date().toISOString(),
    status: "healthy",
  }

  try {
    // 1. Database Connectivity Check
    await db.execute(sql`SELECT 1`)
    checks.database = { status: "connected", latency: `${Date.now() - startTime}ms` }
  } catch (err: any) {
    checks.status = "critical"
    checks.database = { status: "disconnected", error: err.message }
  }

  // 2. Storage / Environment check
  checks.environment = process.env.NODE_ENV
  checks.version = "1.0.0"

  const responseStatus = checks.status === "healthy" ? 200 : 503
  return NextResponse.json(checks, { status: responseStatus })
}
