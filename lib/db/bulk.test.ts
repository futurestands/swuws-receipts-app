import { describe, it, expect } from "vitest"
import { PG_MAX_BIND_PARAMS, pgInsertChunkSize } from "./bulk"

describe("pgInsertChunkSize", () => {
  it("stays under the Postgres bind-parameter ceiling", () => {
    for (const cols of [2, 8, 14, 16, 24, 40]) {
      const rows = pgInsertChunkSize(cols)
      expect(rows * cols).toBeLessThan(PG_MAX_BIND_PARAMS)
    }
  })

  it("is large enough that 100k rows need a few dozen round-trips, not thousands", () => {
    const billingCols = 16
    const chunk = pgInsertChunkSize(billingCols)
    const roundTrips = Math.ceil(100_000 / chunk)
    expect(chunk).toBeGreaterThanOrEqual(1000)
    expect(roundTrips).toBeLessThanOrEqual(100)
  })
})
