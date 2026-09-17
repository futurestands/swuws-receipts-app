import { describe, expect, it } from "vitest"
import { getNavSections } from "./nav-config"
import type { UserPermissionsContext } from "@/lib/permissions"

const officer = {
  id: "co-1",
  role: "commercial_officer",
  roleLevel: 4,
  permissions: [
    { code: "billing.import", scope: "area" },
    { code: "reconciliation.view", scope: "area" },
  ],
}

const reconManager = {
  ...officer,
  permissions: [
    { code: "billing.import", scope: "area" },
    { code: "reconciliation.view", scope: "area" },
    { code: "reconciliation.exceptions.manage", scope: "area" },
  ],
}

function hrefs(user: UserPermissionsContext) {
  return getNavSections(user).flatMap((s) => s.items.map((i) => i.href))
}

describe("finance nav vs page gates", () => {
  it("hides Recon Exceptions when the user can only view recon", () => {
    const links = hrefs(officer)
    expect(links).toContain("/dashboard/reconciliation/stats")
    expect(links).not.toContain("/dashboard/reconciliation/exceptions")
  })

  it("shows Recon Exceptions only with exceptions.manage", () => {
    const links = hrefs(reconManager)
    expect(links).toContain("/dashboard/reconciliation/exceptions")
    expect(links).toContain("/dashboard/reconciliation/stats")
  })

  it("keeps Control Center for admin without widening exceptions", () => {
    const links = hrefs({
      id: "admin-1",
      role: "admin",
      roleLevel: 100,
      permissions: [],
    })
    expect(links).toContain("/dashboard/reconciliation/stats")
    expect(links).not.toContain("/dashboard/reconciliation/exceptions")
  })
})
