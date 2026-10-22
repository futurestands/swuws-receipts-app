import { describe, expect, it, vi } from "vitest"
import { createElement } from "react"
import { renderToString } from "react-dom/server"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }))
vi.mock("@/app/actions/crm", () => ({
  importSmsBatch: vi.fn(), previewSmsImport: vi.fn(), listCrmSmsTemplates: vi.fn(),
  countSmsAudience: vi.fn(), createSmsBatchFromCustomers: vi.fn(),
}))
vi.mock("@/app/actions/billing", () => ({ getAuthorizedSchemes: vi.fn() }))
vi.mock("@/app/actions/receipts", () => ({ listActiveBranches: vi.fn() }))

describe("SMS list triggers on the server", () => {
  it("renders the Pegasus import label inside a single button", async () => {
    const { PegasusSmsImportModal } = await import("./pegasus-sms-import-modal")
    const html = renderToString(createElement(PegasusSmsImportModal))
    expect(html).toMatch(/<button[^>]*>.*Import Pegasus file<\/button>/)
    expect(html.match(/<button\b/g)).toHaveLength(1)
  })
  it("preserves the customer-directory entry point and its label", async () => {
    const { SmsImportModal } = await import("./sms-import-modal")
    const html = renderToString(createElement(SmsImportModal))
    expect(html).toContain("From customer directory")
    expect(html.match(/<button\b/g)).toHaveLength(1)
  })
})
