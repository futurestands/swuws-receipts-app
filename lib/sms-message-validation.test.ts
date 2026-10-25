import { describe, expect, it } from "vitest"
import { renderValidatedSms, uniqueSmsRecipients } from "./sms-message-validation"

describe("SMS creation validation", () => {
  it("blocks missing placeholders before persistence", () => {
    expect(() => renderValidatedSms("Supply interrupted on {{date}}", { name: "Example" })).toThrow("Missing fields: date")
    expect(() => renderValidatedSms("{{name}}", { name: "" })).toThrow()
    expect(() => renderValidatedSms(" ", {})).toThrow("cannot be empty")
  })
  it("keeps zero amounts and renders supported variables", () => {
    expect(renderValidatedSms("Dear {{name}}, balance {{balance}}", { name: "Example", balance: 0 })).toBe("Dear Example, balance 0")
  })
  it("deduplicates normalized phones and linked customers", () => {
    const rows = [
      { phoneNumber: "+256770000001", customerId: "a" },
      { phoneNumber: "+256770000001", customerId: "b" },
      { phoneNumber: "+256770000002", customerId: "a" },
      { phoneNumber: "+256770000003", customerId: null },
    ]
    expect(uniqueSmsRecipients(rows)).toEqual([rows[0], rows[3]])
  })
})
