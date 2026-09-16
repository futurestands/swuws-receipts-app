import { registerPlugin } from "@capacitor/core"
import { isNative } from "../mobile-hardware"
import { Browser } from "@capacitor/browser"

export const MOPRIA_PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.mopria.android.printservice"

interface OfficePrintPlugin {
  printHtml(options: { html: string; jobName?: string }): Promise<void>
}

const OfficePrint = registerPlugin<OfficePrintPlugin>("OfficePrint")

export async function printOfficeHtml(html: string, jobName = "SWUWS document") {
  if (isNative()) {
    await OfficePrint.printHtml({ html, jobName })
    return
  }

  const frame = document.createElement("iframe")
  frame.setAttribute("aria-hidden", "true")
  frame.style.position = "fixed"
  frame.style.right = "0"
  frame.style.bottom = "0"
  frame.style.width = "0"
  frame.style.height = "0"
  frame.style.border = "0"
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc) {
    document.body.removeChild(frame)
    throw new Error("Could not open a print preview")
  }
  doc.open()
  doc.write(html)
  doc.close()
  await new Promise((r) => setTimeout(r, 250))
  frame.contentWindow?.focus()
  frame.contentWindow?.print()
  setTimeout(() => document.body.removeChild(frame), 1000)
}

export async function openPrinterDriverStore() {
  await Browser.open({ url: MOPRIA_PLAY_URL })
}

export function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function money(amount: number) {
  return `UGX ${Number(amount || 0).toLocaleString()}`
}

function documentShell(title: string, body: string) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: auto; margin: 10mm; }
    html, body { width: 100%; max-width: 100%; margin: 0; }
    body { font-family: Georgia, "Times New Roman", serif; color: #0f172a; font-size: 13px; box-sizing: border-box; padding: 8px; }
    h1 { font-size: 18px; letter-spacing: 0.08em; margin: 0; }
    h2 { font-size: 12px; font-weight: 600; margin: 4px 0 16px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 6px 0; }
    .muted { color: #475569; font-size: 11px; }
    .total { font-size: 18px; font-weight: 800; border-top: 2px solid #0f172a; }
    .center { text-align: center; }
    .right { text-align: right; }
  </style>
</head>
<body>
${body}
</body>
</html>`
}

export function officeReceiptHtml(data: {
  orgName?: string
  orgPhone?: string
  receiptNumber: string
  customerName: string
  customerAccount?: string
  amount: number
  paymentMethod: string
  paymentDate: string
  agentName?: string
  isProvisional?: boolean
}) {
  const title = data.isProvisional ? "Provisional receipt" : "Collection receipt"
  return documentShell(
    title,
    `
    <div class="center">
      <h1>${escapeHtml(data.orgName || "SWUWS")}</h1>
      <h2>SOUTH WESTERN UMBRELLA OF WATER AND SANITATION</h2>
      <p><strong>${data.isProvisional ? "PROVISIONAL RECEIPT" : "COLLECTION RECEIPT"}</strong></p>
    </div>
    <table>
      <tr><td>Receipt #</td><td class="right">${escapeHtml(data.receiptNumber)}</td></tr>
      <tr><td>Date</td><td class="right">${escapeHtml(new Date(data.paymentDate).toLocaleString())}</td></tr>
      <tr><td>Customer</td><td class="right">${escapeHtml(data.customerName)}</td></tr>
      ${data.customerAccount ? `<tr><td>Account</td><td class="right">${escapeHtml(data.customerAccount)}</td></tr>` : ""}
      <tr><td>Method</td><td class="right">${escapeHtml(data.paymentMethod.toUpperCase())}</td></tr>
      ${data.agentName ? `<tr><td>Collected by</td><td class="right">${escapeHtml(data.agentName)}</td></tr>` : ""}
      <tr class="total"><td>Total paid</td><td class="right">${money(data.amount)}</td></tr>
    </table>
    <p class="muted center">Thank you. Water is life. Save it.</p>
    `,
  )
}

export function officeInvoiceHtml(data: {
  customerName: string
  customerAccount?: string
  areaName?: string
  schemeName?: string
  periodName?: string
  previousReading?: number | null
  currentReading?: number | null
  consumption?: number | null
  monthlyBill: number
  pastArrears: number
  grandTotal: number
}) {
  return documentShell(
    "Water demand note",
    `
    <div class="center">
      <h1>SOUTHWESTERN UMBRELLA</h1>
      <h2>OF WATER AND SANITATION</h2>
      <p><strong>WATER DEMAND NOTE</strong></p>
    </div>
    <table>
      <tr><td>Customer</td><td class="right">${escapeHtml(data.customerName)}</td></tr>
      <tr><td>Account</td><td class="right">${escapeHtml(data.customerAccount || "—")}</td></tr>
      <tr><td>Area</td><td class="right">${escapeHtml(data.areaName || "—")}</td></tr>
      <tr><td>Scheme</td><td class="right">${escapeHtml(data.schemeName || "—")}</td></tr>
      <tr><td>Period</td><td class="right">${escapeHtml(data.periodName || "Current")}</td></tr>
      ${
        data.previousReading != null
          ? `<tr><td>Previous reading</td><td class="right">${escapeHtml(data.previousReading)}</td></tr>`
          : ""
      }
      ${
        data.currentReading != null
          ? `<tr><td>Current reading</td><td class="right">${escapeHtml(data.currentReading)}</td></tr>`
          : ""
      }
      ${
        data.consumption != null
          ? `<tr><td>Consumption</td><td class="right">${escapeHtml(data.consumption)} m³</td></tr>`
          : ""
      }
      <tr><td>Monthly bill</td><td class="right">${money(data.monthlyBill)}</td></tr>
      <tr><td>Past arrears</td><td class="right">${money(data.pastArrears)}</td></tr>
      <tr class="total"><td>Grand total</td><td class="right">${money(data.grandTotal)}</td></tr>
    </table>
    <p class="muted center">Pay via authorised channels (bank, mobile money, cash office).</p>
    `,
  )
}
