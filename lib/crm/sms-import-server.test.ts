import { beforeEach, describe, expect, it, vi } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"
import { SMS_SAMPLE_CSV } from "./sms-import-constants"

const state = vi.hoisted(() => ({ user: {} as Record<string, unknown>, rows: {} as Record<string, unknown[]>, writes: [] as { table: string; values: unknown }[], queries: [] as string[] }))
vi.mock("@/lib/session", () => ({ requireUser: async () => state.user }))
vi.mock("@/lib/auth", () => ({ auth: { api: {} } }))
vi.mock("@/lib/iam", () => ({ hasPermission: async () => false }))
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn(async () => {}) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/db", async () => {
  const { getTableName } = await import("drizzle-orm")
  const { PgDialect } = await import("drizzle-orm/pg-core")
  const db = {
    select: () => {
      let table = ""
      const query = {
        from(t: Parameters<typeof getTableName>[0]) { table = getTableName(t); return query },
        innerJoin: () => query,
        where(filter: Parameters<PgDialect["sqlToQuery"]>[0] | undefined) { if (filter) state.queries.push(new PgDialect().sqlToQuery(filter).sql); return query },
        limit: () => query,
        then(resolve: (rows: unknown[]) => unknown) { return Promise.resolve(state.rows[table] || []).then(resolve) },
      }
      return query
    },
    insert: (table: Parameters<typeof getTableName>[0]) => ({ values: async (values: unknown) => { state.writes.push({ table: getTableName(table), values }) } }),
    transaction: async (fn: (tx: unknown) => unknown): Promise<unknown> => fn(db),
  }
  return { db }
})

import { prepareSmsImport } from "./sms-import-server"
import { previewSmsImport, importSmsBatch } from "@/app/actions/crm"

const data = (csv = SMS_SAMPLE_CSV) => {
  const form = new FormData()
  form.set("file", new File([csv], "test.csv", { type: "text/csv" }))
  form.set("name", "Test SMS list"); form.set("category", "Bill Reminders"); form.set("schemeId", "all")
  return form
}
beforeEach(() => {
  state.user = { id: "admin", name: "Admin", email: "admin@example.invalid", role: "admin", permissions: [] }
  state.rows = {}; state.writes = []; state.queries = []
})
describe("SMS list preview and commit", () => {
  it("previews without writes or sending and renders source fields into the message", async () => {
    const preview = await previewSmsImport(data())
    expect(preview.counts).toMatchObject({ total: 2, ready: 2, unlinked: 2 })
    expect(preview.recipients[0].message).toContain("July 2026")
    expect(preview.recipients[0].message).toContain("45,000")
    expect(state.writes).toHaveLength(0)
  })
  it("requires a current preview and saves imported snapshots only in SMS tables", async () => {
    const form = data()
    await expect(importSmsBatch(form)).rejects.toThrow("Review the import again")
    const preview = await previewSmsImport(form)
    form.set("previewKey", preview.previewKey)
    expect((await importSmsBatch(form)).summary.ready).toBe(2)
    expect(state.writes.map(w => w.table)).toEqual(["crm_sms_batch", "crm_sms_record"])
    expect(state.writes[0].values).toMatchObject({ status: "draft" })
    expect(state.writes[1].values).toEqual(expect.arrayContaining([expect.objectContaining({ recipientName: "Example Customer One", customerReference: "60000123", billNumber: "880001", billingPeriod: "July 2026", accountBalance: "45000", phoneNumber: "+256770000001", status: "queued" })]))
  })
  it("rejects changed files, options and templates after preview", async () => {
    const form = data()
    form.set("previewKey", (await previewSmsImport(form)).previewKey)
    form.set("name", "Changed")
    await expect(importSmsBatch(form)).rejects.toThrow("changed")
    expect(state.writes).toHaveLength(0)
  })
  it("requires explicit review of excluded rows", async () => {
    const form = data(SMS_SAMPLE_CSV + "\n60000125,12,880003,Bad number,202607,10")
    const preview = await previewSmsImport(form)
    expect(preview.counts.invalid).toBe(1)
    form.set("previewKey", preview.previewKey)
    await expect(importSmsBatch(form)).rejects.toThrow("reviewed the excluded")
    form.set("acceptExcluded", "true")
    expect((await importSmsBatch(form)).summary.ready).toBe(2)
  })
  it("does not silently replace an empty custom message or unsupported placeholder", async () => {
    const form = data(); form.set("messageMode", "custom")
    await expect(prepareSmsImport(form)).rejects.toThrow("custom SMS")
    form.set("manualMessage", "Please pay by {{due_date}}")
    await expect(prepareSmsImport(form)).rejects.toThrow("unsupported field")
  })
  it("uses the selected purpose for the default message", async () => {
    const form = data(); form.set("category", "Seasonal Greetings")
    expect((await previewSmsImport(form)).recipients[0].message).toContain("season's greetings")
    form.set("category", "Alerts")
    expect((await previewSmsImport(form)).recipients[0].message).toContain("contact SWUWS")
  })
  it("keeps main's thank-you and current-period contact protection in the reviewed list", async () => {
    state.rows.billing_period = [{ periodName: "July 2026", startDate: new Date("2026-07-01"), endDate: new Date("2026-07-31") }]
    state.rows.crm_sms_record = [{ customerId: null, phoneNumber: "+256770000001" }]
    const form = data(SMS_SAMPLE_CSV + "\n60000125,0777000003,880003,Paid customer,202607,100")
    const preview = await previewSmsImport(form)
    expect(preview.counts).toMatchObject({ ready: 2, alreadyContacted: 1, thanked: 1 })
    expect(preview.recipients[1].message).toContain("thank you")
    expect(preview.issues[0].reason).toBe("Already messaged this billing period")
    form.set("previewKey", preview.previewKey); form.set("acceptExcluded", "true")
    state.rows.crm_sms_record.push({ customerId: null, phoneNumber: "+256782000002" })
    await expect(importSmsBatch(form)).rejects.toThrow("changed")
    expect(state.writes).toHaveLength(0)
  })
  it("allows a creator to save drafts without granting approval or sending", async () => {
    state.user = { id: "creator", role: "agent", schemeId: "scheme-a", permissions: [{ code: "crm.sms.create", scope: "scheme" }, { code: "customers.view", scope: "scheme" }] }
    state.rows.customer = [{ id: "c1", account: "60000123", meterRef: null, active: true }]
    const preview = await previewSmsImport(data())
    expect(preview.counts).toMatchObject({ ready: 1, outsideScope: 1 })
    expect(state.writes).toHaveLength(0)
  })
  it("treats MeterRef as an exact external reference and rejects ambiguous profile matches", async () => {
    state.rows.customer = [{ id: "a", meterRef: "60000123", account: "other", active: true }, { id: "b", account: "60000123", meterRef: null, active: true }]
    expect((await previewSmsImport(data())).counts).toMatchObject({ ready: 1, invalid: 1 })
  })
  it("excludes zero and credit balances only when the operator enables the filter", async () => {
    const form = data(SMS_SAMPLE_CSV + "\n60000125,0777000003,880003,Zero,202607,0\n60000126,0777000004,880004,Credit,202607,-10")
    expect((await previewSmsImport(form)).counts.ready).toBe(4)
    form.set("onlyWithBalance", "true")
    expect((await previewSmsImport(form)).counts).toMatchObject({ ready: 2, withoutDebt: 2 })
  })
  it("denies imports without SMS permission and excludes unlinked customers for local staff", async () => {
    state.user = { id: "local", role: "agent", branchId: "area-a", permissions: [] }
    await expect(previewSmsImport(data())).rejects.toThrow("Forbidden")
    state.user.permissions = [{ code: "crm.sms.send", scope: "area" }, { code: "customers.view", scope: "area" }]
    expect((await previewSmsImport(data())).counts).toMatchObject({ ready: 0, outsideScope: 2 })
    expect(state.queries.some(q => q.includes('"waterSchemeId"'))).toBe(true)
    expect(state.writes).toHaveLength(0)
  })
})
