import { getPlaceholders, renderTemplate, type TemplateData } from "@/lib/templates/template-engine"

export function renderValidatedSms(content: string, data: TemplateData) {
  const missing = getPlaceholders(content).filter(key => !Object.prototype.hasOwnProperty.call(data, key) || data[key] == null || data[key] === "")
  if (missing.length) throw new Error(`Complete the message before saving. Missing fields: ${missing.join(", ")}`)
  const message = renderTemplate(content, data).trim()
  if (!message) throw new Error("The message cannot be empty")
  return message
}

export function uniqueSmsRecipients<T extends { phoneNumber: string; customerId?: string | null }>(rows: T[]) {
  const phones = new Set<string>()
  const customers = new Set<string>()
  return rows.filter(row => {
    if (phones.has(row.phoneNumber) || (row.customerId && customers.has(row.customerId))) return false
    phones.add(row.phoneNumber)
    if (row.customerId) customers.add(row.customerId)
    return true
  })
}
