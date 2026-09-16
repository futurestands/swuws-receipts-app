/**
 * Capacitor SQLite's Android binder only accepts string / number / null.
 * A Date, Decimal, or nested object becomes a JSONObject and throws
 * "Object not implemented", which previously wiped the cache after
 * beginFullPull() had already deleted local_customers.
 */
export type SqliteValue = string | number | null

export function toSqliteValue(value: unknown): SqliteValue {
  if (value == null) return null
  if (typeof value === "string") return value
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "boolean") return value ? 1 : 0
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }
  if (typeof value === "bigint") return Number(value)
  if (typeof value === "object") {
    const maybeIso = (value as { toISOString?: () => string }).toISOString
    if (typeof maybeIso === "function") {
      try {
        return maybeIso.call(value)
      } catch {
        /* fall through */
      }
    }
  }
  return String(value)
}

/** Capacitor SQLite COUNT rows arrive as {total}, {["COUNT(*)"]}, or [n]. */
export function readSqliteCount(row: unknown): number {
  if (row == null) return 0
  if (typeof row === "number") return Number.isFinite(row) ? row : 0
  if (typeof row === "bigint") return Number(row)
  if (typeof row === "string") {
    const n = Number(row)
    return Number.isFinite(n) ? n : 0
  }
  if (Array.isArray(row)) return readSqliteCount(row[0])
  if (typeof row === "object") {
    const rec = row as Record<string, unknown>
    return readSqliteCount(
      rec.total ?? rec.COUNT ?? rec["COUNT(*)"] ?? rec["count(*)"] ?? rec["COUNT(id)"] ?? Object.values(rec)[0],
    )
  }
  return 0
}

export function customerInsertValues(c: {
  id: unknown
  customerAccount?: unknown
  name?: unknown
  phone?: unknown
  address?: unknown
  accountBalance?: unknown
  category?: unknown
  active?: unknown
  updatedAt?: unknown
  lastReading?: unknown
}): SqliteValue[] {
  return [
    toSqliteValue(c.id),
    toSqliteValue(c.customerAccount),
    toSqliteValue(c.name),
    toSqliteValue(c.phone),
    toSqliteValue(c.address),
    toSqliteValue(c.accountBalance != null ? String(c.accountBalance) : "0"),
    toSqliteValue(c.category),
    toSqliteValue(Boolean(c.active)),
    toSqliteValue(c.updatedAt),
    toSqliteValue(Number(c.lastReading ?? 0)),
  ]
}

export function billingInsertValues(br: {
  id: unknown
  customerId?: unknown
  totalDue?: unknown
  arrears?: unknown
  billAmount?: unknown
  status?: unknown
  billingPeriodId?: unknown
}): SqliteValue[] {
  return [
    toSqliteValue(br.id),
    toSqliteValue(br.customerId),
    toSqliteValue(br.totalDue != null ? String(br.totalDue) : "0"),
    toSqliteValue(br.arrears != null ? String(br.arrears) : "0"),
    toSqliteValue(br.billAmount != null ? String(br.billAmount) : "0"),
    toSqliteValue(br.status),
    toSqliteValue(br.billingPeriodId),
  ]
}
