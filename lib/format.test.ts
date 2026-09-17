import { describe, expect, it } from "vitest"
import { formatCount, formatDate, formatDateTime, formatUGX } from "./format"

describe("stable display formats (en-GB, UTC)", () => {
  it("prints shillings with a fixed grouping, not the host locale", () => {
    expect(formatUGX(1330586024)).toBe("USh 1,330,586,024")
    expect(formatUGX(0)).toBe("USh 0")
  })

  it("prints counts the same on server and browser", () => {
    expect(formatCount(18968)).toBe("18,968")
    expect(formatCount(0)).toBe("0")
  })

  it("prints dates in UTC so SSR HTML matches hydration", () => {
    expect(formatDate("2026-08-08T09:55:00.000Z")).toBe("08 Aug 2026")
    expect(formatDateTime("2026-08-08T09:55:00.000Z")).toBe("08 Aug 2026, 09:55")
  })

  it("never uses locale month names like Sept", () => {
    expect(formatDate("2026-09-17T16:22:00.000Z")).toBe("17 Sep 2026")
    expect(formatDateTime("2026-09-17T16:22:00.000Z")).toBe("17 Sep 2026, 16:22")
  })
})
