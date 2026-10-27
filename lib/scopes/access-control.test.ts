import { describe, expect, it, vi } from "vitest"
import { and, eq, type SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { customer, receipt, billingRecord, billingRun, meterReading } from "@/lib/db/schema"
import type { Scope } from "@/lib/iam"
import { ROLES } from "@/lib/permissions/roles"
import {
  applyCustomerScope, applyReceiptScope, applyBillingScope, applyBillingRecordScope,
  applyMeterReadingScope, validateTargetUserScope, validateWriteScope,
  type UserPermissionsContext,
} from "./index"

vi.mock("@/lib/db", () => ({ db: {} }))

const dialect = new PgDialect()
const permissionCodes = ["customers.view", "receipts.view", "receipts.create", "billing.history.view", "reports.view", "meter_readings.view", "users.edit"]

function user(scope: string, hierarchy: Partial<UserPermissionsContext> = {}): UserPermissionsContext {
  return { id: "agent-a", role: "agent", permissions: permissionCodes.map((code) => ({ code, scope })), ...hierarchy }
}

function query(filter: SQL | undefined) {
  if (!filter) throw new Error("Expected access-control predicate")
  return dialect.sqlToQuery(filter)
}

const resources = [
  { name: "customers", filter: applyCustomerScope, table: customer, branchClause: '"branchId" = $2' },
  { name: "receipts/transactions", filter: applyReceiptScope, table: receipt, branchClause: '"receipt"."branchId" = $2' },
  { name: "billing runs", filter: applyBillingScope, table: billingRun, branchClause: '"branchId" = $2' },
  { name: "billing records", filter: applyBillingRecordScope, table: billingRecord, branchClause: '"branchId" = $2' },
  { name: "meter readings", filter: applyMeterReadingScope, table: meterReading, branchClause: '"branchId" = $2' },
]

describe.each(resources)("$name access predicates", ({ filter, table, branchClause }) => {
  it("combines a caller-supplied record ID with the authenticated branch restriction", () => {
    const compiled = query(and(eq(table.id, "record-in-branch-b"), filter(user("area", { branchId: "branch-a" }))))
    expect(compiled.sql).toContain(branchClause)
    expect(compiled.sql).toContain(" and ")
    expect(compiled.params).toEqual(["record-in-branch-b", "branch-a"])
    expect(compiled.params).not.toContain("branch-b")
  })

  it("caps inherited global grants to the assigned branch", () => {
    const scoped = user("global", { branchId: "branch-a" })
    expect(query(filter(scoped)).params).toEqual(["branch-a"])
  })

  it("keeps scheme and cluster restrictions bound to the assigned hierarchy", () => {
    expect(query(filter(user("scheme", { schemeId: "scheme-a" }))).params).toEqual(["scheme-a"])
    expect(query(filter(user("cluster", { clusterId: "cluster-a" }))).params).toEqual(["cluster-a"])
  })

  it("denies access with missing or unrecognised scope grants", () => {
    expect(query(filter({ id: "agent-a", role: "agent" })).sql).toBe("1 = 0")
    expect(query(filter(user("organisation-wide-typo"))).sql).toBe("1 = 0")
  })

  it("preserves legacy string permission grants", () => {
    const legacy: UserPermissionsContext = {
      id: "agent-a", role: "agent", branchId: "branch-a", permissions: permissionCodes,
      grants: permissionCodes.map((code) => ({ code, scope: "area" })),
    }
    expect(query(filter(legacy))).toEqual(query(filter(user("area", { branchId: "branch-a" }))))
  })

  it("preserves unrestricted system administrators without regional assignments", () => {
    expect(filter({ id: "admin", role: ROLES.SYSTEM_ADMIN })).toBeUndefined()
  })
})

describe("scope resolution and hierarchy preservation", () => {
  it.each<Scope>(["own", "scheme", "area", "cluster", "global"])("recognises the existing %s scope", async (scope) => {
    const current = user(scope, { schemeId: "scheme-a", branchId: "branch-a", clusterId: "cluster-a" })
    expect(await validateTargetUserScope(current, { id: current.id, schemeId: "scheme-a", branchId: "branch-a", clusterId: "cluster-a" }, "users.edit")).toBe(true)
    expect(await validateTargetUserScope(current, { id: "other", schemeId: "scheme-b", branchId: "branch-b", clusterId: "cluster-b" }, "users.edit")).toBe(false)
  })

  it("rejects invalid write scopes instead of falling through to own access", async () => {
    expect(await validateWriteScope(user("invalid"), "users.edit", { branchId: "branch-b" })).toBe(false)
  })

  it("does not grant permissions merely because legacy grants exist", () => {
    const current: UserPermissionsContext = { id: "a", role: "agent", grants: [{ code: "receipts.view", scope: "global" }] }
    expect(query(applyReceiptScope(current)).sql).toBe("1 = 0")
  })

  it("preserves branch-based own receipts and creator-based own customers", () => {
    expect(query(applyReceiptScope(user("own", { branchId: "branch-a" }))).params).toEqual(["branch-a"])
    expect(query(applyCustomerScope(user("own"))).sql).toContain('"customer"."createdById" =')
    expect(query(applyCustomerScope(user("own"))).params).toEqual(["agent-a"])
  })

  it("does not substitute view permissions for receipt-creation authority", () => {
    const viewer: UserPermissionsContext = { id: "a", role: "agent", permissions: [{ code: "receipts.view", scope: "area" }], branchId: "branch-a" }
    expect(query(applyReceiptScope(viewer, "receipts.create")).sql).toBe("1 = 0")
  })

  it.each([
    { scope: "area", branchId: "branch-a", schemeId: undefined, clusterId: undefined, value: "branch-a", snapshot: "branchId" },
    { scope: "scheme", branchId: undefined, schemeId: "scheme-a", clusterId: undefined, value: "scheme-a", snapshot: "schemeId" },
    { scope: "cluster", branchId: undefined, schemeId: undefined, clusterId: "cluster-a", value: "cluster-a", snapshot: "branchId" },
    { scope: "own", branchId: "branch-a", schemeId: undefined, clusterId: undefined, value: "branch-a", snapshot: "branchId" },
  ])("restricts missing retry snapshots through the linked customer ($scope)", ({ scope, branchId, schemeId, clusterId, value, snapshot }) => {
    const current = user(scope, { branchId, schemeId, clusterId })
    const compiled = query(applyReceiptScope(current, "receipts.create"))
    expect(compiled.sql).toContain(`"receipt"."${snapshot}" is null`)
    expect(compiled.sql).toContain('"receipt"."customerId" in (SELECT id FROM customer')
    if (snapshot === "branchId") {
      expect(compiled.sql).toContain('"receipt"."schemeId" in (SELECT id FROM water_scheme')
      expect(compiled.sql).toContain('"receipt"."schemeId" is null and "receipt"."customerId" in')
      expect(compiled.params).toEqual([value, value, value])
    } else {
      expect(compiled.sql).toContain('"receipt"."schemeId" is null and ("receipt"."branchId" is null and')
      expect(compiled.params).toEqual([value, value])
    }
    expect(query(applyReceiptScope(current)).sql).not.toContain("is null")
  })
})
