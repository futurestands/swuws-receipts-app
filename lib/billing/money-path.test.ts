import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * These tests lock the money rules against a one-line regression.
 * They read the action source (comments stripped) so a SET accountBalance
 * in receipts or a dropped "already billed" guard fails CI.
 */

const root = process.cwd()

function source(rel: string) {
  return readFileSync(join(root, rel), "utf8")
}

function executable(src: string) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
}

function sqlBalanceWrites(src: string) {
  return executable(src).match(/SET\s+"accountBalance"\s*=/gi) ?? []
}

const RECEIPTS = "app/actions/receipts.ts"
const READINGS = "app/actions/billing-engine.ts"
const OFFLINE = "app/actions/offline-upload.ts"
const EBS_DAILY = "app/actions/daily-collections.ts"
const MONTHLY = "app/actions/billing.ts"

describe("live accountBalance writers", () => {
  it("lets only daily EBS sync and monthly billing import SET accountBalance", () => {
    expect(sqlBalanceWrites(source(EBS_DAILY)).length).toBeGreaterThan(0)
    expect(sqlBalanceWrites(source(MONTHLY)).length).toBeGreaterThan(0)
  })

  it("does not let receipts, meter readings, or offline upload SET accountBalance", () => {
    expect(sqlBalanceWrites(source(RECEIPTS))).toEqual([])
    expect(sqlBalanceWrites(source(READINGS))).toEqual([])
    expect(sqlBalanceWrites(source(OFFLINE))).toEqual([])
  })

  it("does not update the customer row from issue or void", () => {
    const receipts = executable(source(RECEIPTS))
    expect(receipts).not.toMatch(/\.update\(\s*customer/)
    expect(receipts).toMatch(/reconciliationStatus:\s*['"]void['"]/)
  })
})

describe("meter reading double-bill guard", () => {
  it("refuses a second bill when a monthly billing_record already exists", () => {
    const readings = executable(source(READINGS))
    expect(readings).toMatch(/already been billed/)
    expect(readings).toMatch(/eq\(billingRecord\.customerId/)
    expect(readings).toMatch(/eq\(billingRecord\.billingPeriodId/)
  })

  it("refuses a second field reading in the same period", () => {
    const readings = executable(source(READINGS))
    expect(readings).toMatch(/already been recorded/)
    expect(readings).toMatch(/eq\(meterReading\.customerId/)
    expect(readings).toMatch(/eq\(meterReading\.billingPeriodId/)
  })

  it("accepting a discrepancy rewrites the bill, not the live balance", () => {
    const readings = executable(source(READINGS))
    expect(readings).toMatch(/totalDue:\s*String\(discrepancy\.attemptedValue\)/)
    expect(sqlBalanceWrites(readings)).toEqual([])
  })
})

describe("offline reading upload", () => {
  it("does not auto-send SMS on push", () => {
    expect(executable(source(OFFLINE))).toMatch(/sendSms:\s*false/)
  })

  it("treats already-billed as a filed exception, not a failed upload", () => {
    const offline = executable(source(OFFLINE))
    expect(offline).toMatch(/already been billed/)
    expect(offline).toMatch(/filedAs:\s*"discrepancy"/)
    expect(source(READINGS)).toMatch(/already been billed/)
  })

  it("treats a duplicate period reading as success so the queue can drop it", () => {
    const offline = executable(source(OFFLINE))
    expect(offline).toMatch(/already been recorded/)
    expect(offline).toMatch(/filedAs:\s*"duplicate"/)
  })
})

describe("receipt issue", () => {
  it("looks up idempotencyKey before inserting a second row", () => {
    const receipts = executable(source(RECEIPTS))
    const lookup = receipts.indexOf("idempotencyKey")
    const insert = receipts.indexOf(".insert(receipt)")
    expect(lookup).toBeGreaterThan(-1)
    expect(insert).toBeGreaterThan(lookup)
  })
})
