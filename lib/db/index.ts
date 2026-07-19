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

  // Supabase/Pooler require SSL with rejectUnauthorized: false
  const useSsl = urlString.includes("supabase.com") || urlString.includes("pooler.supabase.com")
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
      max: 20, // Increased pool size
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 30_000, // Increased timeout to 30s
    }

    console.log(`[DB Init] Connection config: ${config.user}@${config.host}:${config.port}/${config.database} (SSL: ${!!config.ssl})`)
    return new Pool(config)
  } catch (e) {
    console.warn("[DB Init] URL parsing failed, falling back to connectionString")
    return new Pool({
      connectionString: urlString,
      ssl: sslConfig,
      connectionTimeoutMillis: 30_000,
    })
  }
}

export const pool = globalThis.__pool || createPool()

// Prevent the process from crashing on unhandled pool errors (e.g. connection drops)
pool.on("error", (err) => {
  console.error("Unexpected error on idle database client", err)
})

if (process.env.NODE_ENV !== "production") {
  globalThis.__pool = pool
}

export const db = drizzle(pool, { schema })
