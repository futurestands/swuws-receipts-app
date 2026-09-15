/**
 * Postgres bind-parameter ceiling (protocol limit). A single INSERT/UPDATE
 * that binds more than this fails with the truncated-parameter error.
 * Chunking below this limit is what makes 100k-row billing/customer/EBS
 * uploads possible — not one giant VALUES list.
 */
export const PG_MAX_BIND_PARAMS = 65_535

/**
 * Rows per INSERT so bound parameters stay under the Postgres ceiling.
 * 70% headroom covers Drizzle also binding defaulted columns (createdAt, etc.).
 */
export function pgInsertChunkSize(columnsPerRow: number): number {
  const cols = Math.max(1, columnsPerRow)
  return Math.max(100, Math.min(2_500, Math.floor((PG_MAX_BIND_PARAMS * 0.7) / cols)))
}
