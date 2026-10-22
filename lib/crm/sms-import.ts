import * as XLSX from "xlsx"
import { normalizeSendablePhone } from "@/lib/phone"

import { SMS_IMPORT_MAX_BYTES, SMS_IMPORT_MAX_ROWS } from "./sms-import-constants"

type Field = "reference" | "phone" | "billNumber" | "name" | "period" | "balance"
const FIELDS: Record<Field, { label: string; aliases: string[]; required: boolean }> = {
  reference: { label: "Customer reference", aliases: ["MeterRef", "Meter Reference", "CustomerRef", "Customer Ref No", "CustomerAccount", "AccountNumber", "Account No"], required: true },
  phone: { label: "Phone number", aliases: ["Phone", "PhoneNumber", "Customer Phone Number", "Mobile", "Telephone"], required: true },
  billNumber: { label: "Bill number", aliases: ["BillNumber", "Bill No", "InvoiceNumber"], required: false },
  name: { label: "Customer name", aliases: ["CustomerName", "Customer Name", "Name"], required: true },
  period: { label: "Billing period", aliases: ["Period", "BillingPeriod", "Billing Month"], required: true },
  balance: { label: "Amount due (UGX)", aliases: ["AccountBalance", "Outstanding Balance", "Balance", "TotalDue", "TotalAmountDue", "Amount Due"], required: true },
}
const normalizeHeader = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "")
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

export type SmsContact = {
  rowNumber: number
  reference: string
  referenceHeader: string
  phoneNumber: string
  billNumber: string
  customerName: string
  billingPeriod: string
  balance: number
}
export type SmsImportRow = {
  rowNumber: number
  status: "ready" | "invalid" | "duplicate"
  contact: SmsContact | null
  reference: string
  customerName: string
  issues: string[]
}
export type ParsedSmsImport = {
  format: "Pegasus export" | "Named columns" | "Legacy five-column list"
  sheetName: string
  columns: { field: Field; label: string; source: string }[]
  rows: SmsImportRow[]
}

function identifier(value: unknown, label: string): string {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a whole, unrounded identifier`)
    return String(value)
  }
  const text = String(value ?? "").trim()
  if (/^[+-]?[\d.]+e[+-]?\d+$/i.test(text)) {
    throw new Error(`${label} is saved in scientific notation. Upload the original export or store this column as text`)
  }
  return text
}

export function normalizeSmsImportPhone(value: unknown): string {
  const text = identifier(value, "Phone number")
  // Numeric spreadsheet cells are safe integers; never infer lost digits from an E+ text value.
  if (!/^\+?[\d\s().-]+$/.test(text)) throw new Error("Phone number contains unsupported characters")
  const normalized = normalizeSendablePhone(text)
  if (!normalized || !/^\+[1-9]\d{7,14}$/.test(normalized) || (normalized.startsWith("+256") && !/^\+256[1-9]\d{8}$/.test(normalized))) {
    throw new Error("Phone number is incomplete, invalid or a placeholder. Use a full Uganda 07 or 03 number")
  }
  return normalized
}

export function formatSmsBillingPeriod(value: unknown): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return `${MONTHS[value.getUTCMonth()]} ${value.getUTCFullYear()}`
  }
  const text = String(value ?? "").trim()
  let year: number, month: number
  const numeric = /^(\d{4})[-/]?(\d{2})$/.exec(text)
  const named = /^([a-z]+)[\s/-]+(\d{2}|\d{4})$/i.exec(text)
  if (numeric) {
    year = Number(numeric[1]); month = Number(numeric[2])
  } else if (named) {
    month = MONTHS.findIndex(m => m.toLowerCase() === named[1].toLowerCase() || m.slice(0, 3).toLowerCase() === named[1].toLowerCase()) + 1
    year = Number(named[2]); if (year < 100) year += 2000
  } else {
    throw new Error("Billing period must be YYYYMM (for example 202607) or a month and year")
  }
  if (year < 1900 || year > 2100 || month < 1 || month > 12) throw new Error("Billing period has an invalid month or year")
  return `${MONTHS[month - 1]} ${year}`
}

function parseBalance(value: unknown): number {
  const text = String(value ?? "").trim().replace(/^(UGX|USh)\s*/i, "")
  if (!text || !/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) {
    throw new Error("Amount due must be a number with at most two decimal places")
  }
  const amount = Number(text.replace(/,/g, ""))
  if (!Number.isFinite(amount) || Math.abs(amount) >= 10_000_000_000) throw new Error("Amount due is outside the supported range")
  return amount
}

/** Header-based Pegasus and simple lists; legacy headerless files remain supported explicitly. */
export function parseSmsContacts(buffer: ArrayBuffer | Uint8Array): ParsedSmsImport {
  if (buffer.byteLength > SMS_IMPORT_MAX_BYTES) throw new Error("The file is too large. Maximum size is 10 MB")
  const workbook = XLSX.read(buffer, { type: "array", raw: true, cellDates: true, sheetRows: SMS_IMPORT_MAX_ROWS + 2 })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error("The workbook has no worksheets")
  const fullRange = workbook.Sheets[sheetName]["!fullref"] || workbook.Sheets[sheetName]["!ref"]
  if (fullRange && XLSX.utils.decode_range(fullRange).e.r > SMS_IMPORT_MAX_ROWS) throw new Error("Maximum size is 50,000 customer rows. Split the file and try again")
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: true, defval: "", blankrows: true })
  const first = matrix.findIndex(row => row.some(v => v !== "" && v != null))
  if (first < 0) throw new Error("The file has no customer rows")
  const headers = matrix[first].map(v => String(v ?? "").trim())
  const mapping: Partial<Record<Field, number>> = {}
  for (const [field, definition] of Object.entries(FIELDS) as [Field, typeof FIELDS[Field]][]) {
    const matches = headers.flatMap((header, i) => definition.aliases.some(a => normalizeHeader(a) === normalizeHeader(header)) ? [i] : [])
    if (matches.length > 1) throw new Error(`More than one column matches ${definition.label}. Keep one clearly named column`)
    if (matches.length) mapping[field] = matches[0]
  }
  const hasHeaders = Object.keys(mapping).length > 0
  if (!hasHeaders) {
    if (headers.length !== 5) throw new Error("Keep the Pegasus header row: MeterRef, Phone, BillNumber, CustomerName, Period, AccountBalance")
    Object.assign(mapping, { reference: 0, phone: 1, name: 2, period: 3, balance: 4 })
  }
  for (const [field, definition] of Object.entries(FIELDS) as [Field, typeof FIELDS[Field]][]) {
    if (definition.required && mapping[field] === undefined) throw new Error(`Missing ${definition.label} column. Keep the original header row or use the sample file`)
  }
  const columns = (Object.keys(mapping) as Field[]).map(field => ({ field, label: FIELDS[field].label, source: hasHeaders ? headers[mapping[field]!] : `Column ${String.fromCharCode(65 + mapping[field]!)}` }))
  const rows: SmsImportRow[] = []
  const seen = new Map<string, SmsImportRow>()
  for (let i = first + (hasHeaders ? 1 : 0); i < matrix.length; i++) {
    const raw = matrix[i]
    if (!raw.some(v => v !== "" && v != null)) continue
    if (rows.length >= SMS_IMPORT_MAX_ROWS) throw new Error("Maximum size is 50,000 customer rows. Split the file and try again")
    const read = (field: Field) => mapping[field] === undefined ? "" : raw[mapping[field]!]
    const row: SmsImportRow = { rowNumber: i + 1, status: "invalid", contact: null, reference: String(read("reference") ?? ""), customerName: String(read("name") ?? ""), issues: [] }
    try {
      const reference = identifier(read("reference"), "Customer reference")
      const customerName = String(read("name") ?? "").trim()
      if (!reference || reference.length > 100) throw new Error("Customer reference is required and must be at most 100 characters")
      if (!customerName || customerName.length > 200) throw new Error("Customer name is required and must be at most 200 characters")
      const contact: SmsContact = { rowNumber: i + 1, reference, referenceHeader: hasHeaders ? headers[mapping.reference!] : "CustomerRef", phoneNumber: normalizeSmsImportPhone(read("phone")), billNumber: identifier(read("billNumber"), "Bill number"), customerName, billingPeriod: formatSmsBillingPeriod(read("period")), balance: parseBalance(read("balance")) }
      if (contact.billNumber.length > 100) throw new Error("Bill number must be at most 100 characters")
      row.contact = contact; row.status = "ready"
      const previous = seen.get(reference)
      if (previous?.contact) {
        const same = (Object.keys(contact) as (keyof SmsContact)[]).filter(k => k !== "rowNumber").every(k => previous.contact![k] === contact[k])
        if (same) { row.status = "duplicate"; row.issues.push(`Duplicate of row ${previous.rowNumber}`) }
        else {
          row.status = "invalid"; previous.status = "invalid"
          row.issues.push("Conflicting rows for this customer reference. Keep one correct row")
          previous.issues.push(`Conflicting details also appear on row ${row.rowNumber}`)
        }
      } else seen.set(reference, row)
    } catch (error) { row.issues.push(error instanceof Error ? error.message : "Invalid customer row") }
    rows.push(row)
  }
  if (!rows.length) throw new Error("The file contains headers but no customer rows")
  return { format: hasHeaders ? headers.some(h => normalizeHeader(h) === "meterref") ? "Pegasus export" : "Named columns" : "Legacy five-column list", sheetName, columns, rows }
}
