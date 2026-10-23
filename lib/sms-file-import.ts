import * as XLSX from "xlsx"
import { smsImportSchema, smsImportMapping } from "@/lib/crm-schemas"

import { PEGASUS_HEADERS } from "@/lib/sms-file-import-sample"

function text(value: unknown): string {
  if (typeof value === "number" && !Number.isSafeInteger(value)) throw new Error("Identifier must be a whole number with no lost digits")
  if (typeof value === "string" && /^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i.test(value.trim())) throw new Error("Use the full identifier or phone number, not scientific notation text")
  return value == null ? "" : String(value).trim()
}

/** SMS-only adapter: other modules retain their existing import behavior. */
export async function parseSmsFile(file: Pick<File, "arrayBuffer">) {
  const buffer = await file.arrayBuffer()
  if (buffer.byteLength > 10 * 1024 * 1024) throw new Error("File exceeds the 10 MB limit")
  const workbook = XLSX.read(buffer, { type: "array" })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error("The workbook has no worksheet")
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: true })
  const first = rows.findIndex(row => row.some(value => value !== "" && value != null))
  if (first < 0) throw new Error("The file is empty")
  const headers = rows[first].map(value => String(value).trim().toLowerCase())
  const isPegasus = headers.some(value => PEGASUS_HEADERS.some(header => header.toLowerCase() === value))
  if (isPegasus) {
    const missing = PEGASUS_HEADERS.filter(header => !headers.includes(header.toLowerCase()))
    if (missing.length) throw new Error(`Missing Pegasus headers: ${missing.join(", ")}. Keep the original header row.`)
    if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) throw new Error("Duplicate column headers")
  } else if (rows[first].length !== 5) {
    throw new Error("Use the original six-column Pegasus export with headers, or a legacy five-column file without headers")
  }
  const start = first + (isPegasus ? 1 : 0)
  if (rows.length - start > 50000) throw new Error("Import exceeds the 50,000 row limit")
  const results = []
  for (let index = start; index < rows.length; index++) {
    const row = rows[index]
    if (!row.some(value => value !== "" && value != null)) continue
    try {
      const get = (header: typeof PEGASUS_HEADERS[number], legacyIndex: number) => row[isPegasus ? headers.indexOf(header.toLowerCase()) : legacyIndex]
      const rawPeriod = text(get("Period", smsImportMapping.billingPeriod))
      let billingPeriod = rawPeriod
      if (/^\d{6}$/.test(rawPeriod)) {
        const month = Number(rawPeriod.slice(4))
        if (month < 1 || month > 12) throw new Error("Period must contain a valid month (YYYYMM)")
        billingPeriod = `${new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(Number(rawPeriod.slice(0, 4)), month - 1)))} ${rawPeriod.slice(0, 4)}`
      }
      const rawBalance = get("AccountBalance", smsImportMapping.balance)
      const balance = typeof rawBalance === "number" ? rawBalance : Number(String(rawBalance).replace(/,/g, "").trim())
      if (rawBalance === "" || !Number.isFinite(balance)) throw new Error("AccountBalance must be a number")
      const parsed = smsImportSchema.parse({
        customerRef: text(get("MeterRef", smsImportMapping.customerRef)),
        phoneNumber: text(get("Phone", smsImportMapping.phoneNumber)),
        customerName: text(get("CustomerName", smsImportMapping.customerName)),
        billingPeriod,
        balance,
      })
      results.push({ ...parsed, billNumber: isPegasus ? text(get("BillNumber", -1)) : "" })
    } catch (error) {
      throw new Error(`Row ${index + 1}: ${error instanceof Error ? error.message : "Invalid data"}`)
    }
  }
  if (!results.length) throw new Error("No customer rows found")
  return results
}
