import { describe, expect, it, vi } from "vitest"
import * as XLSX from "xlsx"

vi.mock("@/lib/db", () => ({ db: {} }))

import { processExcelImport } from "@/lib/import-engine"
import { DEFAULT_BILLING_IMPORT_MAPPING } from "@/lib/import-mappings"
import { billingImportSchema } from "@/lib/import-schemas"

function workbookFile(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Billing")
  const buffer: Buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
  return new File([new Uint8Array(buffer)], "billing.xlsx")
}

describe("monthly billing import parsing", () => {
  it("parses default aliases containing numeric hints and schema defaults", async () => {
    const summary = await processExcelImport({
      file: workbookFile([
        ["Account Number", "Bill Amount", "Due Date"],
        [6000000000, 50000, "2026-10-31"],
      ]),
      schema: billingImportSchema,
      mapping: DEFAULT_BILLING_IMPORT_MAPPING,
    })
    expect(summary.validRows).toBe(1)
    expect(summary.rows[0]).toMatchObject({
      valid: true,
      data: { accountNumber: "6000000000", billAmount: 50000, arrears: 0, totalDue: 0, dueDate: "2026-10-31" },
    })
  })

  it("keeps positional mappings working for files without headers", async () => {
    const summary = await processExcelImport({
      file: workbookFile([["6000000000", 25000, 10000, "2026-10-31"]]),
      schema: billingImportSchema,
      mapping: { accountNumber: 0, billAmount: 1, arrears: 2, dueDate: 3 },
      headerMode: "none",
    })
    expect(summary.rows[0]).toMatchObject({
      valid: true, data: { billAmount: 25000, arrears: 10000 },
    })
  })

  it("rejects negative bill amounts through the concrete billing schema", async () => {
    const summary = await processExcelImport({
      file: workbookFile([
        ["Account Number", "Bill Amount", "Due Date"],
        ["6000000000", -100, "2026-10-31"],
      ]),
      schema: billingImportSchema,
      mapping: DEFAULT_BILLING_IMPORT_MAPPING,
    })
    expect(summary.validRows).toBe(0)
    expect(summary.errorRows).toBe(1)
    expect(summary.rows[0].valid).toBe(false)
  })
})
