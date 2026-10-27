/** Deliberately has no dotenv import or business-database fallback. */
export function productionTestDatabaseUrl(value = process.env.PRODUCTION_TEST_DATABASE_URL, business = process.env.DATABASE_URL) {
  if (!value) throw new Error("PRODUCTION_TEST_DATABASE_URL is required for mandatory production integration tests")
  const url = new URL(value)
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "::1"].includes(host) || !/^\/[a-zA-Z0-9_]+_production_test$/.test(url.pathname) || url.search || url.hash) throw new Error("Integration database must be an explicit loopback *_production_test database without connection overrides")
  if (business) {
    const live = new URL(business)
    const loopback = (v: string) => ["localhost", "127.0.0.1", "[::1]", "::1"].includes(v) ? "loopback" : v
    if (loopback(live.hostname) === loopback(url.hostname) && (live.port || "5432") === (url.port || "5432") && live.pathname === url.pathname) throw new Error("Integration target must differ from application database")
  }
  return value
}
