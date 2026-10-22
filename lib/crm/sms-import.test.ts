import { describe, it, expect } from "vitest"
import * as XLSX from "xlsx"
import { readFileSync } from "node:fs"
import { parseSmsContacts, normalizeSmsImportPhone, formatSmsBillingPeriod } from "./sms-import"
import { SMS_SAMPLE_CSV } from "./sms-import-constants"

const headers = ["MeterRef", "Phone", "BillNumber", "CustomerName", "Period", "AccountBalance"]
const row = [60000123, 777000001, 880001, "Example Customer", 202607, 607523]
const workbook = (rows: unknown[][]) => {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Contacts")
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" })
}
describe("Pegasus SMS contact import", () => {
  it("maps all six Pegasus columns and converts numeric identifiers, phones and YYYYMM", () => {
    const result = parseSmsContacts(workbook([headers, row]))
    expect(result.format).toBe("Pegasus export")
    expect(result.rows[0].contact).toMatchObject({ reference: "60000123", phoneNumber: "+256777000001", billNumber: "880001", customerName: "Example Customer", billingPeriod: "July 2026", balance: 607523 })
  })
  it("maps reordered columns by header, never treats BillNumber as a customer name", () => {
    const order = [5, 3, 2, 0, 4, 1]
    expect(parseSmsContacts(workbook([order.map(i => headers[i]), order.map(i => row[i])])).rows[0].contact?.customerName).toBe("Example Customer")
  })
  it("reads a BOM CSV with headers, quoted commas and a zero balance", () => {
    const csv = '\uFEFFMeterRef,Phone,BillNumber,CustomerName,Period,AccountBalance\r\n00123,0777000001,00088,"Example, Customer",202607,"607,523"\r\n00124,0777000002,00089,Other,202607,0'
    const result = parseSmsContacts(new TextEncoder().encode(csv))
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].contact).toMatchObject({ reference: "00123", billNumber: "00088", customerName: "Example, Customer", balance: 607523 })
    expect(result.rows[1].contact?.balance).toBe(0)
  })
  it("supports the old five-column headerless template without losing its first recipient", () => {
    const result = parseSmsContacts(workbook([["00123", "0777000001", "Example", "MARCH 2026", 45000]]))
    expect(result.format).toBe("Legacy five-column list")
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].contact?.billingPeriod).toBe("March 2026")
  })
  it("accepts named simple lists and an optional BillNumber", () => {
    const result = parseSmsContacts(workbook([["Customer Ref No", "Customer Phone Number", "Customer Name", "Billing Period", "Outstanding Balance"], ["001", "0777000001", "Example", "Mar-26", -25.5]]))
    expect(result.rows[0].contact).toMatchObject({ reference: "001", balance: -25.5, billNumber: "" })
  })
  it("does not skip the first real recipient after a header", () => {
    const result = parseSmsContacts(workbook([headers, row, ["002", 777000002, 2, "Second", 202607, 1]]))
    expect(result.rows.map(r => r.rowNumber)).toEqual([2, 3])
  })
  it("rejects missing required and duplicate matching headers", () => {
    expect(() => parseSmsContacts(workbook([headers.filter(h => h !== "Phone"), row]))).toThrow("Missing Phone number")
    expect(() => parseSmsContacts(workbook([[...headers, "PhoneNumber"], [...row, 777000002]]))).toThrow("More than one column")
  })
  it("reports invalid rows and blank rows using original Excel row numbers", () => {
    const result = parseSmsContacts(workbook([headers, [], ["001", "12", 1, "Example", 202613, "bad"]]))
    expect(result.rows[0]).toMatchObject({ rowNumber: 3, status: "invalid" })
  })
  it("removes exact duplicates but rejects conflicting customer-reference rows", () => {
    const duplicate = parseSmsContacts(workbook([headers, row, row]))
    expect(duplicate.rows.map(r => r.status)).toEqual(["ready", "duplicate"])
    const conflict = parseSmsContacts(workbook([headers, row, [row[0], 777000002, ...row.slice(2)]]))
    expect(conflict.rows.map(r => r.status)).toEqual(["invalid", "invalid"])
  })
  it("preserves separate customers who share a household phone", () => {
    expect(parseSmsContacts(workbook([headers, row, ["002", ...row.slice(1)]])).rows.filter(r => r.status === "ready")).toHaveLength(2)
  })
  it("parses its downloadable sample without counting the header as a contact", () => {
    expect(parseSmsContacts(new TextEncoder().encode(SMS_SAMPLE_CSV)).rows.filter(r => r.status === "ready")).toHaveLength(2)
  })
  it("does not silently round identifiers or accept nonnumeric balances", () => {
    expect(parseSmsContacts(workbook([headers, [60000123.5, ...row.slice(1)]])).rows[0].status).toBe("invalid")
    expect(parseSmsContacts(workbook([headers, [...row.slice(0, 5), "unknown"]])).rows[0].status).toBe("invalid")
  })
})

describe("Phone and billing-period display", () => {
  it.each([777000001, "0777000001", "256777000001", "+256 777 000 001", "00256777000001"])("normalizes full Uganda number %s", value => {
    expect(normalizeSmsImportPhone(value)).toBe("+256777000001")
  })
  it.each(["2.5677E+11", "07770", "+256777000001234", "not a phone", "777000001 ext2", "777+000001"])("rejects incomplete or corrupted phone %s", value => {
    expect(() => normalizeSmsImportPhone(value)).toThrow()
  })
  it.each([202607, "2026-07", "Jul-26", "July 2026", new Date("2026-07-01T00:00:00Z")])("displays month and year for %s", value => {
    expect(formatSmsBillingPeriod(value)).toBe("July 2026")
  })
})

// The user workbook stays outside git. Enable this check locally without committing contact data.
it.skipIf(!process.env.PEGASUS_SAMPLE_FILE)("validates the supplied katagata workbook", () => {
  const result = parseSmsContacts(readFileSync(process.env.PEGASUS_SAMPLE_FILE!))
  expect(result.rows).toHaveLength(154)
  expect(result.rows.every(r => r.status === "ready" && r.contact?.billingPeriod === "July 2026" && /^\+256\d{9}$/.test(r.contact.phoneNumber))).toBe(true)
})
