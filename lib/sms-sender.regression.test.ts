import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { expect, it } from "vitest"

it("regresses the actual server sender with a synthetic database and gateway", () => {
  const output = execFileSync(process.execPath, [resolve("scripts/verify-crm-sender.cjs")], { encoding: "utf8" })
  expect(output).toContain("PASS: actual sender resumes")
})
