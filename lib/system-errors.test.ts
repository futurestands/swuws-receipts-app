import { describe, expect, it } from "vitest"
import { errorFingerprint, shouldIgnoreSystemError } from "./system-error-fingerprint"
import { mergeSeenBy } from "./system-error-seen-by"

describe("system error grouping", () => {
  it("ignores session and forbidden noise", () => {
    expect(shouldIgnoreSystemError("Forbidden")).toBe(true)
    expect(shouldIgnoreSystemError("Unauthorized")).toBe(true)
    expect(shouldIgnoreSystemError("NEXT_NOT_FOUND")).toBe(true)
    expect(shouldIgnoreSystemError("Failed to load invoice data")).toBe(false)
  })

  it("groups the same message and path", () => {
    const a = errorFingerprint({
      message: "  Failed to load invoice data  ",
      path: "/dashboard/billing/readings?tab=invoice",
    })
    const b = errorFingerprint({
      message: "Failed to load invoice data",
      path: "/dashboard/billing/readings",
    })
    expect(a).toBe(b)
  })

  it("keeps different pages apart", () => {
    const readings = errorFingerprint({
      message: "Failed to load invoice data",
      path: "/dashboard/billing/readings",
    })
    const crm = errorFingerprint({
      message: "Failed to load invoice data",
      path: "/dashboard/crm",
    })
    expect(readings).not.toBe(crm)
  })
})

describe("who hit the error", () => {
  it("puts the latest person first and keeps earlier names", () => {
    const first = mergeSeenBy([], { id: "a", name: "Aisha", email: "aisha@swuws.ug" })
    const both = mergeSeenBy(first, { id: "b", name: "Bosco", email: "bosco@swuws.ug" })
    expect(both.map((p) => p.name)).toEqual(["Bosco", "Aisha"])
  })

  it("does not duplicate the same person", () => {
    const once = mergeSeenBy([], { id: "a", name: "Aisha" })
    const again = mergeSeenBy(once, { id: "a", name: "Aisha N." })
    expect(again).toHaveLength(1)
    expect(again[0].name).toBe("Aisha N.")
  })
})
