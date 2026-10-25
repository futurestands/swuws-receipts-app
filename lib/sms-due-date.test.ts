import { describe, expect, it } from "vitest"
import { applySmsDueDate, parseSmsDueDate } from "./sms-due-date"
import { renderTemplate } from "./templates/template-engine"

describe("manual upload payment deadline", () => {
  it("keeps absent dates optional and does not invent a deadline", () => {
    expect(parseSmsDueDate("")).toBeNull()
    expect(applySmsDueDate("Balance: {{balance}}.", "", true)).toBe("Balance: {{balance}}.")
  })
  it("stores a date-only value and uses an unambiguous English date", () => {
    expect(parseSmsDueDate("2026-10-31")).toEqual({ iso: "2026-10-31", display: "31 October 2026" })
    expect(applySmsDueDate("Your bill.", "2026-10-31", true)).toBe("Your bill.\nPlease pay by 31 October 2026.")
  })
  it("replaces every due-date placeholder without adding a second deadline", () => {
    expect(applySmsDueDate("Pay by {{due_date}}. Deadline: {{ due_date }}.", "2026-10-31", true)).toBe("Pay by 31 October 2026. Deadline: 31 October 2026.")
  })
  it("rejects missing required dates server-side", () => {
    expect(() => applySmsDueDate("Pay by {{due_date}}", "")).toThrow("requires a payment due date")
  })
  it.each(["2026-02-29", "2026-04-31", "2026-13-01", "31/10/2026", "2026-1-1", "not-a-date", "0000-01-01"])("rejects malformed or impossible dates: %s", value => {
    expect(() => parseSmsDueDate(value)).toThrow("valid payment due date")
  })
  it("accepts leap day and has no timezone-dependent date shift", () => {
    expect(parseSmsDueDate("2028-02-29")?.display).toBe("29 February 2028")
  })
  it("preserves custom/no-deadline and payment-appreciation wording", () => {
    expect(applySmsDueDate("Thank you for paying.", "2026-10-31")).toBe("Thank you for paying.")
  })
  it("binds the same entered deadline into preview and saved personalised text", () => {
    const text = applySmsDueDate("Dear {{name}}, pay {{balance}} by {{due_date}}.", "2026-10-31")
    expect(renderTemplate(text, { name: "Example", balance: 50000 })).toBe("Dear Example, pay 50000 by 31 October 2026.")
  })
})
