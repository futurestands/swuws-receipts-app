import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { SmsMessagePreview } from "./sms-message-preview"

const recipient = {
  customerName: "Updated profile name", customerAccount: "60000123",
  phoneNumber: "+256777000001", status: "queued",
  message: "Dear Original Name, your July 2026 balance is UGX 45,000.\nReference: 60000123.",
}
describe("Saved SMS message preview", () => {
  it("shows the exact saved body and line breaks rather than regenerating it from a profile", () => {
    const html = renderToStaticMarkup(createElement(SmsMessagePreview, { recipient }))
    expect(html).toContain(recipient.message)
    expect(html).not.toContain("Dear Updated profile name")
    expect(html).toContain(recipient.phoneNumber)
    expect(html).toContain("Ready to send")
    expect(html).toContain("whitespace-pre-wrap")
  })
  it("renders custom message markup as SMS text", () => {
    const html = renderToStaticMarkup(createElement(SmsMessagePreview, { recipient: { ...recipient, message: '<script>alert("test")</script> & payment' } }))
    expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain("<script>")
    expect(html).toContain("&amp; payment")
  })
  it("reports a missing stored message instead of inventing an SMS", () => {
    const html = renderToStaticMarkup(createElement(SmsMessagePreview, { recipient: { ...recipient, message: "" } }))
    expect(html).toContain("No message text was saved for this recipient.")
    expect(html).not.toContain("your July 2026 balance")
  })
})
