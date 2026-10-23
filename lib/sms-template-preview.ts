import { getPlaceholders, renderTemplate } from "@/lib/templates/template-engine"

export function defaultSmsTemplate(category: string) {
  if (category === "Seasonal Greetings") return { code: "crm.bulk.seasonal.sms", label: "Seasonal greeting", content: "Dear {{customer_name}}, warm greetings from SWUWS. Thank you for being our valued customer." }
  if (category === "Alerts") return { code: "crm.bulk.alert.sms", label: "General alert", content: "Dear {{customer_name}}, please contact SWUWS Customer Care for the latest water supply information in your area." }
  return { code: "notif.billing.sms", label: "Billing reminder", content: "Dear {{customer_name}}, your water bill for {{period}} is due. Balance: USh {{balance}}. SWUWS." }
}

const SAMPLE_DATA = {
  customer_name: "Example Customer", name: "Example Customer", CustomerName: "Example Customer",
  account: "60000123", MeterRef: "60000123", Phone: "+256770000001", bill_number: "8820001", BillNumber: "8820001",
  period: "July 2026", Period: "July 2026", balance: 50000, AccountBalance: 50000, total_due: 50000, amount: 50000,
}

export function previewSmsTemplate(content: string) {
  const missing = getPlaceholders(content).filter(key => !(key in SAMPLE_DATA))
  const values = { ...SAMPLE_DATA, ...Object.fromEntries(missing.map(key => [key, `[${key} required]`])) }
  return { body: renderTemplate(content, values), missing }
}
