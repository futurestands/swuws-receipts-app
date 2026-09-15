import { describe, it, expect, vi } from "vitest"
import { renderToString } from "react-dom/server"
import { createElement } from "react"
import type { CrmDepartment } from "@/lib/db/schema"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}))

vi.mock("@/app/actions/crm", () => ({
  upsertCrmDepartment: async () => ({ ok: true }),
}))

const department: CrmDepartment = {
  id: "dept-admin",
  name: "Administration",
  description: null,
  active: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
}

describe("DepartmentDialog SSR", () => {
  it("includes the Update label in server HTML", async () => {
    const { DepartmentDialog } = await import("./department-dialog")
    const html = renderToString(createElement(DepartmentDialog, { department }))
    expect(html).toContain("Update")
  })

  it("includes the Add Dept label when creating", async () => {
    const { DepartmentDialog } = await import("./department-dialog")
    const html = renderToString(createElement(DepartmentDialog, {}))
    expect(html).toContain("Add Dept")
  })
})
