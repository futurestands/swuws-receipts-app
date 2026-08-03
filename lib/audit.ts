import "server-only"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/db/schema"
import { headers } from "next/headers"
import { randomUUID } from "crypto"
import type { PgTransaction } from "drizzle-orm/pg-core"
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js"

type LogInput = {
  user?: { id: string; name: string; email: string } | null
  action: string
  entityType?: string
  entityId?: string
  details?: Record<string, unknown>
}

/**
 * Writes an entry to the audit log.
 * Accepts an optional transaction client (tx) to ensure audit logging
 * happens within the same atomic boundary as the main action.
 */
export async function writeAudit(input: LogInput, tx?: PgTransaction<PostgresJsQueryResultHKT, Record<string, unknown>, Record<string, unknown>>) {
  let ip: string | null = null
  let userAgent: string | null = null
  try {
    const h = await headers()
    ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      null
    userAgent = h.get("user-agent")
  } catch {
    ip = null
    userAgent = null
  }

  const client = tx || db
  await client.insert(auditLog).values({
    id: randomUUID(),
    userId: input.user?.id ?? null,
    userName: input.user?.name ?? null,
    userEmail: input.user?.email ?? null,
    action: input.action,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    details: input.details ?? null,
    ipAddress: ip,
    userAgent,
  })
}
