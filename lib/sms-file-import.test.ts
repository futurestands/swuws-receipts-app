import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"
import { readFileSync } from "node:fs"
import { parseSmsFile } from "./sms-file-import"
import { PEGASUS_HEADERS, PEGASUS_SAMPLE_CSV } from "./sms-file-import-sample"

function file(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Customers")
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
  return { arrayBuffer: async () => buffer }
}

describe("SMS file compatibility", () => {
  it("maps Pegasus numeric cells without shifting bill number into customer name", async () => {
    const [row] = await parseSmsFile(file([[...PEGASUS_HEADERS], [60000123, 770000001, 8820001, "Example", 202607, 45000]]))
    expect(row).toMatchObject({ customerRef: "60000123", phoneNumber: "770000001", billNumber: "8820001", customerName: "Example", billingPeriod: "July 2026", balance: 45000 })
  })
  it("maps reordered headers and preserves leading zero text identifiers", async () => {
    const [row] = await parseSmsFile(file([["Phone", "MeterRef", "CustomerName", "Period", "AccountBalance", "BillNumber"], ["0770000001", "00123", "Example", "202607", "45,000", "0009"]]))
    expect(row).toMatchObject({ customerRef: "00123", billNumber: "0009", balance: 45000 })
  })
  it("keeps legacy five-column imports", async () => {
    expect((await parseSmsFile(file([[60000123, "0770000001", "Legacy", "March 2026", 0]])))[0]).toMatchObject({ customerName: "Legacy", billingPeriod: "March 2026", balance: 0 })
  })
  it("reads the downloadable CSV sample", async () => {
    expect(await parseSmsFile({ arrayBuffer: async () => new TextEncoder().encode(PEGASUS_SAMPLE_CSV).buffer as ArrayBuffer })).toHaveLength(1)
  })
  it("rejects missing headers rather than guessing positions", async () => {
    await expect(parseSmsFile(file([["MeterRef", "Phone"], [123, 770000001]]))).rejects.toThrow("Missing Pegasus headers")
  })
  it("reports the source row for invalid numbers", async () => {
    await expect(parseSmsFile(file([[...PEGASUS_HEADERS], [123, "0700000000", 1, "Example", 202607, 0]]))).rejects.toThrow("Row 2")
  })
  it("rejects invalid periods and balances", async () => {
    await expect(parseSmsFile(file([[...PEGASUS_HEADERS], [123, 770000001, 1, "Example", 202613, 0]]))).rejects.toThrow("valid month")
    await expect(parseSmsFile(file([[...PEGASUS_HEADERS], [123, 770000001, 1, "Example", 202607, "bad"]]))).rejects.toThrow("AccountBalance")
  })
  it.skipIf(!process.env.PEGASUS_SAMPLE_FILE)("accepts every customer in the original private workbook", async () => {
    const buffer = readFileSync(process.env.PEGASUS_SAMPLE_FILE!)
    const rows = await parseSmsFile({ arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) })
    expect(rows).toHaveLength(154)
    expect(rows.every(row => row.customerName && row.billNumber && row.billingPeriod === "July 2026" && Number.isFinite(row.balance))).toBe(true)
  })
})
