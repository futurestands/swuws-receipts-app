import { beforeEach, describe, expect, it, vi } from "vitest"
import * as XLSX from "xlsx"

const mocks = vi.hoisted(() => {
  const nextSelect = vi.fn<() => unknown[]>().mockReturnValue([])
  const values = vi.fn<(value: unknown) => Promise<void>>().mockResolvedValue(undefined)
  const set = vi.fn<(value: unknown) => { where: () => Promise<void> }>(() => ({ where: async () => {} }))
  const select = vi.fn(() => {
    const rows = nextSelect()
    const chain = {
      from: () => chain,
      where: () => chain,
      innerJoin: () => chain,
      limit: async () => rows,
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
    }
    return chain
  })
  const tx = {
    select,
    insert: vi.fn(() => ({ values })),
    update: vi.fn(() => ({ set })),
    delete: vi.fn(() => ({ where: async () => {} })),
    execute: vi.fn(async () => ({ rows: [] })),
  }
  return {
    nextSelect, values, set, tx,
    transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    writeAudit: vi.fn(),
  }
})

vi.mock("@/lib/db", () => ({ db: { ...mocks.tx, transaction: mocks.transaction } }))
vi.mock("@/lib/session", () => ({ requireUser: async () => ({ id: "importer-1" }) }))
vi.mock("@/lib/permissions", () => ({ canUploadBilling: () => true }))
vi.mock("@/lib/scopes", () => ({
  applyCustomerScope: () => undefined,
  validateWriteScope: async () => true,
}))
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.writeAudit }))
vi.mock("@/lib/logger", () => ({ logEvent: vi.fn(), logFinancial: vi.fn() }))
vi.mock("@/lib/billing/close-expired", () => ({ closeExpiredActivePeriods: async () => {} }))
vi.mock("@/app/actions/settings", () => ({ getSettings: vi.fn() }))
vi.mock("@/app/actions/notifications", () => ({ createNotification: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/import-engine", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/import-engine")>(),
  getImportMapping: async () => null,
}))

import {
  validateDailyCollectionImport,
  validateDailyBalanceSync,
  commitDailyCollectionImport,
} from "@/app/actions/daily-collections"
import { importBilling, validateBillingImport, type BillingImportSummary } from "@/app/actions/billing"

function upload(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Import")
  const buffer: Buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
  const form = new FormData()
  form.set("file", new File([new Uint8Array(buffer)], "financial.xlsx"))
  form.set("schemeId", "scheme-1")
  form.set("billingPeriodId", "period-1")
  return form
}

function selections(...results: unknown[][]) {
  for (const result of results) mocks.nextSelect.mockReturnValueOnce(result)
}

const dailyHeaders = ["Account Number", "Customer Name", "Amount Paid", "Payment Date", "External Reference", "Payment Channel"]
const period = { id: "period-1", status: "active", startDate: new Date("2026-10-01"), endDate: new Date("2026-10-31") }
const customers = [
  { id: "customer-1", account: "A1", accountBalance: "100.25", waterSchemeId: "scheme-1" },
  { id: "customer-2", account: "A2", accountBalance: "-10.5", waterSchemeId: "scheme-1" },
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.nextSelect.mockReset().mockReturnValue([])
  mocks.transaction.mockReset().mockImplementation(async (work) => work(mocks.tx))
  mocks.values.mockReset().mockResolvedValue(undefined)
})

describe("standard daily collection imports", () => {
  it("keeps valid totals, invalid records, duplicate errors and duplicate-file metadata", async () => {
    selections([{ id: "already-uploaded" }])
    const result = await validateDailyCollectionImport(upload([
      dailyHeaders,
      ["A1", "One", 10.25, "2026-10-01", "REF-1", "cash"],
      ["A2", "Two", 20.5, "2026-10-02", "REF-2", "bank"],
      ["A3", "Three", -2, "2026-10-03", "REF-3", "cash"],
      ["A4", "Four", 99, "2026-10-03", "REF-1", "cash"],
    ]))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.summary).toMatchObject({
      totalRecords: 4, validRecords: 2, failedRecords: 2, totalAmount: 30.75,
      businessDate: "2026-10-01", isDuplicateFile: true,
    })
    expect(result.summary.previewRows[2].errors).toContain("Amount must be greater than zero")
    expect(result.summary.previewRows[3].errors).toContain("Duplicate Ref: REF-1")
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it("rejects missing columns without starting a transaction", async () => {
    expect(await validateDailyCollectionImport(upload([["Account Number"], ["A1"]])))
      .toMatchObject({ ok: false, error: expect.stringContaining("Missing columns:") })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it("commits only schema-valid rows and preserves fractional totals", async () => {
    selections([period])
    const result = await commitDailyCollectionImport(upload([
      dailyHeaders,
      ["A1", "One", 10.25, "2026-10-01", "REF-1", "cash"],
      ["A2", "Two", -1, "2026-10-01", "REF-2", "cash"],
      ["A3", "Three", 20.5, "2026-10-01", "REF-3", "bank"],
    ]))
    expect(result.ok).toBe(true)
    expect(mocks.values.mock.calls[0][0]).toMatchObject({ totalRecords: 3, totalAmount: 30.75 })
    expect(mocks.values.mock.calls[1][0]).toEqual([
      expect.objectContaining({ accountNumber: "A1", amount: 10.25 }),
      expect.objectContaining({ accountNumber: "A3", amount: 20.5 }),
    ])
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ amount: 30.75, records: 2 }),
    }), mocks.tx)
  })
})

describe("daily balance sync previews", () => {
  it("preserves reductions, zero for increases, rejected raw values, and current duplicate semantics", async () => {
    selections([
      { id: "one", account: "A1", balance: "100.75" },
      { id: "two", account: "A2", balance: "10" },
    ])
    const result = await validateDailyBalanceSync(upload([
      ["AccountNumber", "TotalAmountDue"],
      ["A1", 70.5], ["A2", 20], ["missing", 5], ["A1", "bad amount"], ["A1", 70.5],
    ]))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.summary).toMatchObject({ totalRecords: 5, validRecords: 3, failedRecords: 2, totalCollection: 60.5 })
    expect(result.summary.previewRows.map((row) => row.collection)).toEqual([30.25, 0, 0, 0, 30.25])
    expect(result.summary.previewRows[2]).toMatchObject({ valid: false, data: { accountNumber: "missing", totalDue: 5 } })
    expect(result.summary.previewRows[3]).toMatchObject({ valid: false, data: { totalDue: "bad amount" } })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it("counts the whole file while limiting preview rows to 100", async () => {
    selections([{ id: "one", account: "A1", balance: "100.75" }])
    const result = await validateDailyBalanceSync(upload([
      ["AccountNumber", "TotalAmountDue"], ...Array.from({ length: 101 }, () => ["A1", 70.5]),
    ]))
    if (!result.ok) throw new Error(result.error)
    expect(result.summary).toMatchObject({ totalRecords: 101, validRecords: 101, failedRecords: 0, totalCollection: 3055.25 })
    expect(result.summary.previewRows).toHaveLength(100)
  })
})

describe("monthly billing validation and partial imports", () => {
  it("preserves balance-brought-forward calculations, duplicate detection, and raw rejected rows", async () => {
    selections([period], [{ branchId: "branch-1" }], [], customers, [])
    const result = await validateBillingImport(upload([
      ["Account Number", "Bill Amount", "Arrears", "Due Date"],
      ["A1", 20.25, 80.75, "2026-10-31"],
      ["A2", 5.25, 0, "2026-10-31"],
      ["a1", 9, 30, "2026-10-31"],
      ["missing", 2, 0, "2026-10-31"],
      ["A2", -1, 0, "2026-10-31"],
    ]))
    if (!result.ok) throw new Error(result.error)
    expect(result.summary).toMatchObject({ totalRows: 5, validRows: 2, errorRows: 3, warningRows: 0 })
    expect(result.summary.rows[0]).toMatchObject({ valid: true, data: { totalDue: 80.75, arrears: 60.5, billAmount: 20.25 } })
    expect(result.summary.rows[1]).toMatchObject({ valid: true, data: { totalDue: -5.25, arrears: -10.5 } })
    expect(result.summary.rows[2]).toMatchObject({ valid: false, raw: { accountNumber: "a1", arrears: 30 }, errors: ["Duplicate account number in the upload file"] })
    expect(result.summary.rows[3].errors).toContain("Customer account missing not found in this scheme")
  })

  function monthlySummary(): BillingImportSummary {
    return {
      schemeId: "all", billingPeriodId: "period-1", totalRows: 3, validRows: 2, errorRows: 1, warningRows: 0,
      rows: [
        { valid: true, sourceRow: 2, errors: [], warnings: [], data: { accountNumber: "A1", billAmount: 20.25, arrears: 0, currentCharges: 0, totalDue: 80.75, dueDate: "2026-10-31" } },
        { valid: true, sourceRow: 3, errors: [], warnings: [], data: { accountNumber: "A2", billAmount: 5.25, arrears: 0, currentCharges: 0, totalDue: -5.25, dueDate: "2026-10-31" } },
        { valid: false, sourceRow: 4, errors: ["Invalid amount"], warnings: [], raw: { accountNumber: "bad", billAmount: -1 } },
      ],
    }
  }

  it("preserves written amounts, existing run rounding, and rejected-row export", async () => {
    selections([period], customers, [])
    const result = await importBilling(monthlySummary(), "monthly.xlsx")
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result).toMatchObject({ imported: 2, failed: 1 })
    expect(result.report).toContain("Failed")
    expect(result.report).toContain("Invalid amount")
    expect(mocks.values.mock.calls[1][0]).toEqual([
      expect.objectContaining({ billAmount: "20.25", arrears: "100.25", totalDue: "80.75", recoveryAmount: "0", arrearsRecovery: "39.75" }),
      expect.objectContaining({ billAmount: "5.25", arrears: "-10.5", totalDue: "-5.25", recoveryAmount: "0", status: "paid" }),
    ])
    expect(mocks.set).toHaveBeenCalledWith({ totalAmount: 26, totalRecovered: "0", arrearsRecovered: "39.75" })
  })

  it("retains per-scheme partial failure behaviour and failure audit", async () => {
    selections([period], [customers[0], { ...customers[1], waterSchemeId: "scheme-2" }], [])
    mocks.transaction.mockImplementationOnce(async (work) => work(mocks.tx))
      .mockRejectedValueOnce(new Error("second scheme unavailable"))
    expect(await importBilling(monthlySummary(), "monthly.xlsx"))
      .toEqual({ ok: false, error: "second scheme unavailable" })
    expect(mocks.transaction).toHaveBeenCalledTimes(2)
    expect(mocks.values.mock.calls[1][0]).toEqual([expect.objectContaining({ accountNumber: "A1", billAmount: "20.25" })])
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "billing.import.failed" }))
  })
})
