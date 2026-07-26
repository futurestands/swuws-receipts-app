import "server-only"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

/**
 * Atomic sliding-window counter backed by a single-row upsert. Safe under
 * concurrent requests because the INSERT ... ON CONFLICT DO UPDATE holds a
 * row lock for the duration of the statement — two simultaneous requests
 * for the same key cannot both read-then-write the same stale count.
 *
 * Deliberately implemented with the database already in this stack rather
 * than adding Redis/Upstash or another external service, per the
 * instruction to keep this compatible with the existing stack.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  options?: { failClosed?: boolean },
): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
  try {
    const result = await db.execute<{ count: number }>(sql`
      insert into rate_limit (key, "windowStart", count)
      values (${key}, now(), 1)
      on conflict (key) do update set
        count = case
          when rate_limit."windowStart" < now() - (${windowSeconds}::text || ' seconds')::interval
          then 1
          else rate_limit.count + 1
        end,
        "windowStart" = case
          when rate_limit."windowStart" < now() - (${windowSeconds}::text || ' seconds')::interval
          then now()
          else rate_limit."windowStart"
        end
      returning count
    `)

    const row = (result as unknown as { rows: { count: number }[] }).rows[0]
    const count = Number(row?.count ?? 0)

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: windowSeconds,
    }
  } catch (e) {
    // Stability fix: this is defensive/auxiliary infrastructure. If it
    // fails (rate_limit table not yet migrated, transient connection
    // issue, etc.), it must never take down the feature it's protecting —
    // login, receipt creation, and password reset are all certified core
    // functionality and must keep working even if rate limiting can't be
    // evaluated right now.
    //
    // However, for high-risk public endpoints (Login, Verify), we may
    // choose to fail closed to prevent automated abuse during outages.
    const allowed = options?.failClosed ? false : true
    console.error(
      `checkRateLimit failed for key "${key}" — failing ${allowed ? "open" : "closed"}`,
      e,
    )
    return { allowed, remaining: 0, retryAfterSeconds: windowSeconds }
  }
}
