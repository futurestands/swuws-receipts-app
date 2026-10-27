"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { sqliteService } from "./sqlite-service"
import { watchNetwork } from "./network-watch"
import { searchCustomers } from "@/app/actions/customers"
import {
  cachedCustomersSchema, queuedReceiptsSchema, queuedReadingsSchema, syncMetaSchema,
  type CachedCustomer, type QueuedReceipt, type QueuedReading, type SyncMeta,
} from "./records"

export const OFFLINE_PAGE_SIZE = 50
type RemoteCustomer = Awaited<ReturnType<typeof searchCustomers>>["customers"][number]
type PendingSnapshot = { connected: boolean; hasNewItems: boolean }

export function useOfflineSearch(agentId: string) {
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [localCustomers, setLocalCustomers] = useState<CachedCustomer[]>([])
  const [localTotal, setLocalTotal] = useState(0)
  const [localTotalPages, setLocalTotalPages] = useState(1)
  const [serverCustomers, setServerCustomers] = useState<RemoteCustomer[]>([])
  const [syncMeta, setSyncMeta] = useState<SyncMeta>(null)
  const [queuedReceipts, setQueuedReceipts] = useState<QueuedReceipt[]>([])
  const [queuedReadings, setQueuedReadings] = useState<QueuedReading[]>([])
  const [isOnline, setIsOnline] = useState(true)
  const [searchingServer, setSearchingServer] = useState(false)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const lifetime = useRef(0)
  const refreshTicket = useRef(0)
  const online = useRef(true)
  const pending = useRef(false)
  const pendingListeners = useRef(new Set<(snapshot: PendingSnapshot) => void>())

  useEffect(() => {
    const generation = ++lifetime.current
    return () => { lifetime.current = generation + 1 }
  }, [agentId])
  const captureLifetime = useCallback(() => {
    const generation = lifetime.current
    return () => generation === lifetime.current
  }, [])
  const getIsOnline = useCallback(() => online.current, [])
  const subscribeToPending = useCallback((listener: (snapshot: PendingSnapshot) => void) => {
    const listeners = pendingListeners.current
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])
  const notifyPending = useCallback(() => {
    const snapshot = { connected: online.current, hasNewItems: pending.current }
    for (const listener of pendingListeners.current) listener(snapshot)
  }, [])

  const refreshData = useCallback(async (pageNum?: number) => {
    const isCurrent = captureLifetime()
    const ticket = ++refreshTicket.current
    const [meta, receipts, readings] = await Promise.all([
      sqliteService.getSyncMeta(), sqliteService.getQueuedReceipts(), sqliteService.getQueuedMeterReadings(),
    ])
    if (!isCurrent() || ticket !== refreshTicket.current) return
    const parsedMeta = syncMetaSchema.parse(meta)
    const parsedReceipts = queuedReceiptsSchema.parse(receipts)
    const parsedReadings = queuedReadingsSchema.parse(readings)
    setSyncMeta(parsedMeta)
    setQueuedReceipts(parsedReceipts)
    setQueuedReadings(parsedReadings)
    pending.current = parsedReceipts.some((row) => row.status === "queued") || parsedReadings.some((row) => row.status === "queued")
    notifyPending()
    if (pageNum !== undefined) setPage(pageNum)
    setRefreshVersion((version) => version + 1)
  }, [captureLifetime, notifyPending])

  useEffect(() => {
    const isCurrent = captureLifetime()
    const init = async () => {
      try {
        await sqliteService.initialize()
        if (isCurrent()) await refreshData()
      } catch (error) {
        if (isCurrent()) console.error("Offline data refresh failed", error)
      }
    }
    void init()
    return watchNetwork(({ connected }) => {
      if (!isCurrent()) return
      online.current = connected
      setIsOnline(connected)
      notifyPending()
    })
  }, [agentId, captureLifetime, refreshData, notifyPending])

  useEffect(() => {
    let active = true
    const timer = setTimeout(async () => {
      try {
        await sqliteService.initialize()
        if (!active) return
        const local = await sqliteService.searchCustomers(query, page, OFFLINE_PAGE_SIZE)
        if (!active) return
        setLocalCustomers(cachedCustomersSchema.parse(local.customers))
        setLocalTotal(local.total)
        setLocalTotalPages(local.totalPages)
        if (local.page !== page) setPage(local.page)
        if (isOnline && query.trim().length >= 2) {
          setSearchingServer(true)
          try {
            const remote = await searchCustomers({ query })
            if (!active) return
            const cachedIds = await sqliteService.filterCachedIds(remote.customers.map((customer) => customer.id))
            if (active) setServerCustomers(remote.customers.filter((customer) => !cachedIds.has(customer.id)))
          } finally {
            if (active) setSearchingServer(false)
          }
        } else {
          setServerCustomers([])
          setSearchingServer(false)
        }
      } catch (error) {
        if (active) {
          setSearchingServer(false)
          console.warn("Customer search failed", error)
        }
      }
    }, 300)
    return () => { active = false; clearTimeout(timer) }
  }, [query, isOnline, page, refreshVersion, agentId])

  return {
    query, setQuery, page, setPage, localCustomers, localTotal, localTotalPages,
    serverCustomers, syncMeta, queuedReceipts, queuedReadings, isOnline, searchingServer,
    refreshData, captureLifetime, getIsOnline, subscribeToPending,
  }
}
