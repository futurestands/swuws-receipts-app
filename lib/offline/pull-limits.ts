/** Page size for one offline cache pull. ~1–2MB JSON with billing rows. */
export const OFFLINE_PULL_PAGE_SIZE = 1500

/**
 * Hard cap on customers stored on a phone. 100k rows is fine in SQLite;
 * loading them as one JSON blob is what used to crash the WebView.
 */
export const MAX_OFFLINE_CUSTOMERS = 100_000

export function shouldStopOfflinePull(loaded: number, nextCursor: string | null, max = MAX_OFFLINE_CUSTOMERS) {
  if (!nextCursor) return true
  if (loaded >= max) return true
  return false
}
