import { describe, expect, it } from "vitest"
import { MAX_OFFLINE_CUSTOMERS, OFFLINE_PULL_PAGE_SIZE, shouldStopOfflinePull } from "./pull-limits"

describe("offline pull limits", () => {
  it("uses a page size small enough for a phone payload", () => {
    expect(OFFLINE_PULL_PAGE_SIZE).toBeGreaterThan(0)
    expect(OFFLINE_PULL_PAGE_SIZE).toBeLessThanOrEqual(2000)
  })

  it("allows a full 100k cache across many pages", () => {
    expect(MAX_OFFLINE_CUSTOMERS).toBe(100_000)
    expect(Math.ceil(MAX_OFFLINE_CUSTOMERS / OFFLINE_PULL_PAGE_SIZE)).toBeGreaterThan(50)
  })

  it("stops when the server has no next page", () => {
    expect(shouldStopOfflinePull(1500, null)).toBe(true)
  })

  it("stops once the device cap is reached even if more pages exist", () => {
    expect(shouldStopOfflinePull(100_000, "next-id")).toBe(true)
  })

  it("keeps paging while under the cap", () => {
    expect(shouldStopOfflinePull(45_000, "next-id")).toBe(false)
  })
})
