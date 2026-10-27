"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { getProductionWorkspace } from "@/app/actions/intelligence"
import { ProductionPanel, type Workspace } from "./production-panel"
import { Button } from "@/components/ui/button"

export function ProductionWorkspace({ schemeId }: { schemeId?: string }) {
  const [data, setData] = useState<Workspace | null>(null)
  const [selected, setSelected] = useState(schemeId)
  const [month, setMonth] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const request = useRef(0)
  const load = useCallback(async (cursor?: string, signal?: { cancelled: boolean }) => {
    const sequence = ++request.current
    setLoading(true); setError("")
    try {
      const result = await getProductionWorkspace(selected, month || undefined, cursor)
      if (sequence !== request.current || signal?.cancelled) return
      if (!result.ok) { setError(result.message); return }
      setData(result.data)
    } catch { if (sequence === request.current && !signal?.cancelled) setError("Production could not be loaded. Retry or contact an administrator.") }
    finally { if (sequence === request.current && !signal?.cancelled) setLoading(false) }
  }, [selected, month])
  useEffect(() => { const signal = { cancelled: false }; queueMicrotask(() => { if (!signal.cancelled) void load(undefined, signal) }); return () => { signal.cancelled = true } }, [load])
  return <section className="space-y-4 rounded-lg border p-4" aria-label="Water production">
    <h1 className="text-2xl font-semibold">Water production</h1>
    <p className="text-sm text-muted-foreground">Daily source records, independent verification and monthly reporting.</p>
    <div className="flex flex-wrap items-end gap-3">
      {!schemeId && <label>Scheme<select aria-label="Production scheme" className="block rounded border p-2" value={selected ?? data?.scheme?.id ?? ""} onChange={e => { setData(null); setSelected(e.target.value) }}><option value="">Select a scheme</option>{data?.schemes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
      <label>Production month<input aria-label="Production month" className="block rounded border p-2" type="month" value={month || data?.month || ""} onChange={e => { setData(null); setMonth(e.target.value) }} /></label>
      <Button variant="outline" disabled={loading} onClick={() => void load()}>Refresh production</Button>
    </div>
    {loading && <p role="status">Loading production…</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!loading && data && <ProductionPanel data={data} reload={() => load()} nextPage={() => load(data.nextCursor ?? undefined)} />}
  </section>
}
