import { describe, it, expect, vi } from "vitest"
import { renderToString } from "react-dom/server"
import { createElement } from "react"
import type { CrmComplaintCategory, CrmDepartment } from "@/lib/db/schema"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}))

vi.mock("@/app/actions/crm", () => ({
  upsertCrmComplaintCategory: async () => ({ ok: true }),
}))

const category: CrmComplaintCategory = {
  id: "cat-1",
  name: "Faulty Meter",
  description: null,
  defaultHandlerDepartmentId: null,
  active: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
}

const departments: CrmDepartment[] = []

describe("CategoryDialog SSR", () => {
  it("includes the Update label in server HTML", async () => {
    const { CategoryDialog } = await import("./category-dialog")
    const html = renderToString(createElement(CategoryDialog, { category, departments }))
    expect(html).toMatch(/<button[^>]*>Update<\/button>/)
  })

  it("includes the Add Category label when creating", async () => {
    const { CategoryDialog } = await import("./category-dialog")
    const html = renderToString(createElement(CategoryDialog, { departments }))
    expect(html).toContain("Add Category")
  })
})
