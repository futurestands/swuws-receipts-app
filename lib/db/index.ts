import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

/**
 * PRODUCTION-CERTIFIED DATABASE CONNECTION LAYER
 *
 * 1. SINGLETON PATTERN: In Next.js development, HMR re-evaluates modules.
 *    We store the Pool on globalThis to prevent connection leaks.
 * 2. SSL CONSOLIDATION: The pg driver's connectionString parser has known
 *    bugs where query params (like sslmode) can override the explicit ssl object.
 *    We manually parse the URL to properties to ensure { rejectUnauthorized: false }
 *    is strictly honored for Supabase.
 */

declare global {
  // eslint-disable-next-line no-var
  var __pool: Pool | undefined
}

function createPool(): Pool {
  const urlString = process.env.DATABASE_URL
  if (!urlString) {
    console.error("[DB Init] FATAL: DATABASE_URL is missing from environment")
    return new Pool()
  }

  const isProduction = process.env.NODE_ENV === "production"
  const isVercel = !!process.env.VERCEL

  // Goal Alignment: More robust SSL detection. Enable SSL for all remote hosts.
  let useSsl = false
  try {
    const url = new URL(urlString)
    useSsl = url.hostname !== "localhost" && url.hostname !== "127.0.0.1"
  } catch (e) {
    useSsl = urlString.includes("supabase.co") || urlString.includes("pooler.supabase.com")
  }
  const sslConfig = useSsl ? { rejectUnauthorized: false } : false

  try {
    const url = new URL(urlString)
    const config = {
      host: url.hostname,
      port: url.port ? parseInt(url.port) : 5432,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1) || "postgres",
      ssl: sslConfig,
      // Goal Alignment: Platform-aware pool sizing.
      // - Vercel: Cap at 1 (Serverless concurrency limit safety)
      // - Remote (Supabase): Increase to 15 for local dev breathing room.
      // - Local: Cap at 20 (Speed for development)
      max: isVercel ? 1 : (useSsl ? 15 : 20),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 60_000, // 60s timeout for slow rebuilds
    }

    console.log(`[DB Init] Connection config: ${config.user}@${config.host}:${config.port}/${config.database} (SSL: ${!!config.ssl})`)
    return new Pool(config)
  } catch (e) {
    console.warn("[DB Init] URL parsing failed, falling back to connectionString")
    return new Pool({
      connectionString: urlString,
      ssl: sslConfig,
      max: isVercel ? 1 : (useSsl ? 15 : 20),
      connectionTimeoutMillis: 60_000,
    })
  }
}

if (globalThis.__pool) {
  console.log("[DB Init] Re-using existing connection pool (Singleton)")
}

export const pool = globalThis.__pool || createPool()

if (process.env.NODE_ENV !== "production") {
  globalThis.__pool = pool
}

// Prevent the process from crashing on unhandled pool errors (e.g. connection drops)
pool.on("error", (err) => {
  console.error("Unexpected error on idle database client", err)
})

export const db = drizzle(pool, { schema })
