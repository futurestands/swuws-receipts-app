import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { defaultSmsTemplate, previewSmsTemplate } from "@/lib/sms-template-preview"
import { SmsTemplatePreview } from "./sms-template-preview"

vi.mock("@/app/actions/crm", () => ({ getSmsCompositionPreview: vi.fn() }))

describe("composition message preview", () => {
  it("selects category-specific defaults rather than billing text for every category", () => {
    expect(defaultSmsTemplate("Bill Reminders").code).toBe("notif.billing.sms")
    expect(defaultSmsTemplate("Seasonal Greetings").content).toContain("warm greetings")
    expect(defaultSmsTemplate("Alerts").content).not.toContain("water bill")
  })
  it("renders legacy and Pegasus placeholders with clearly synthetic values", () => {
    const preview = previewSmsTemplate("{{CustomerName}} / {{name}}\n{{MeterRef}} {{BillNumber}} {{Period}} {{AccountBalance}}")
    expect(preview.missing).toEqual([])
    expect(preview.body).toBe("Example Customer / Example Customer\n60000123 8820001 July 2026 50000")
  })
  it("flags unsupported fields instead of silently hiding them", () => {
    expect(previewSmsTemplate("Notice: {{date}} {{scheme_name}}")).toEqual({ body: "Notice: [date required] [scheme_name required]", missing: ["date", "scheme_name"] })
  })
  it("does not suggest file-only placeholders are supported by the directory builder", () => {
    expect(previewSmsTemplate("{{BillNumber}} {{name}}", "directory").missing).toEqual(["BillNumber"])
  })
  it("shows a loading state before fetching a managed template", () => {
    const html = renderToStaticMarkup(<SmsTemplatePreview category="Alerts" templateId="default" source="directory" />)
    expect(html).toContain("Loading message preview")
    expect(html).toContain("Example customer and values")
  })
  it("updates custom text through props and escapes HTML while retaining line breaks", () => {
    const render = (text: string) => renderToStaticMarkup(<SmsTemplatePreview category="Alerts" templateId="default" source="csv" manualMessage={text} />)
    expect(render("Hello {{name}}\n<script>alert(1)</script>")).toContain("Hello Example Customer\n&lt;script&gt;")
    expect(render("Revised {{MeterRef}}")).toContain("Revised 60000123")
    expect(render("")).toContain("Type your message")
  })
})
