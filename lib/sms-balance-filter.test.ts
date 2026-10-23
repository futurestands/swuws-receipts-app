import { describe, expect, it } from "vitest"
import { and, sql } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { parseSmsBalanceFilter, smsBalanceConditions } from "./sms-balance-filter"

describe("SMS balance selection shared by count and creation", () => {
  it("excludes zero and credit balances from bill reminders without requiring a range", () => {
    expect(parseSmsBalanceFilter({})).toEqual({ min: undefined, max: undefined, demandsOnly: true })
    const query = new PgDialect().sqlToQuery(and(...smsBalanceConditions(sql`balance`, {}))!)
    expect(query.sql).toBe("balance > 0")
  })
  it("uses inclusive boundaries and bound SQL parameters", () => {
    const query = new PgDialect().sqlToQuery(and(...smsBalanceConditions(sql`balance`, { minBalance: "50000", maxBalance: "200000" }))!)
    expect(query.sql).toBe("(balance > 0 and balance >= $1 and balance <= $2)")
    expect(query.params).toEqual([50000, 200000])
  })
  it("supports one-sided and exact amounts", () => {
    expect(parseSmsBalanceFilter({ minBalance: "50000" }).max).toBeUndefined()
    expect(parseSmsBalanceFilter({ maxBalance: "200000" }).min).toBeUndefined()
    expect(parseSmsBalanceFilter({ minBalance: "100.50", maxBalance: "100.50" }).min).toBe(100.5)
  })
  it("preserves unrestricted audiences for other categories unless a range is supplied", () => {
    expect(smsBalanceConditions(sql`balance`, { category: "General Notice" })).toEqual([])
    const query = new PgDialect().sqlToQuery(and(...smsBalanceConditions(sql`balance`, { category: "General Notice", maxBalance: "100" }))!)
    expect(query.params).toEqual([100])
    expect(query.sql).toBe("balance <= $1")
  })
  it.each(["-1", "NaN", "Infinity", "1e5", "50,000", "1.001", "1 OR 1=1", "10000000000"])("rejects invalid server input %s", value => {
    expect(() => parseSmsBalanceFilter({ minBalance: value })).toThrow()
    expect(() => parseSmsBalanceFilter({ maxBalance: value })).toThrow()
  })
  it("rejects reversed limits", () => {
    expect(() => parseSmsBalanceFilter({ minBalance: "200", maxBalance: "100" })).toThrow("cannot exceed")
  })
})
