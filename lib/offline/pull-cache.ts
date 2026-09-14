import { getAgentOfflinePage } from "@/app/actions/offline-sync"
import { sqliteService } from "./sqlite-service"
import { MAX_OFFLINE_CUSTOMERS, shouldStopOfflinePull } from "./pull-limits"

export type OfflinePullProgress = {
  loaded: number
  total: number
  truncated: boolean
}

export type OfflinePullResult = OfflinePullProgress & {
  activePeriodId: string | null
}

/**
 * Pulls the agent's scoped customers in pages and writes them to SQLite
 * without ever holding the full 100k set in JS memory.
 */
export async function pullOfflineCache(opts: {
  agentId: string
  onProgress?: (progress: OfflinePullProgress) => void
}): Promise<OfflinePullResult> {
  let cursor: string | null = null
  let loaded = 0
  let total = 0
  let first = true
  let activePeriodId: string | null = null
  let timestamp = new Date().toISOString()

  while (true) {
    const page = await getAgentOfflinePage({ cursor })
    if (first) {
      total = page.totalCount
      activePeriodId = page.activePeriodId
      timestamp = page.timestamp
      await sqliteService.beginFullPull()
      first = false
    }

    if (page.customers.length > 0) {
      const remaining = MAX_OFFLINE_CUSTOMERS - loaded
      const customers = remaining < page.customers.length
        ? page.customers.slice(0, remaining)
        : page.customers
      const allowedIds = new Set(customers.map((c) => c.id))
      const billingRecords = remaining < page.customers.length
        ? page.billingRecords.filter((br) => br.customerId && allowedIds.has(br.customerId))
        : page.billingRecords

      await sqliteService.insertPullPage(customers, billingRecords)
      loaded += customers.length
    }

    const truncated = loaded >= MAX_OFFLINE_CUSTOMERS && Boolean(page.nextCursor)
    opts.onProgress?.({ loaded, total, truncated })

    if (shouldStopOfflinePull(loaded, page.nextCursor)) break
    cursor = page.nextCursor
  }

  await sqliteService.finishFullPull({
    timestamp,
    agentId: opts.agentId,
    activePeriodId,
    customerCount: loaded,
  })

  return {
    loaded,
    total,
    truncated: loaded < total && loaded >= MAX_OFFLINE_CUSTOMERS,
    activePeriodId,
  }
}
