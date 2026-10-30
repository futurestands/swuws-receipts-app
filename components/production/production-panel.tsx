"use client"

import { useRef, useState, type FormEvent } from "react"
import { archiveWaterSchemeSource, editWaterProduction, getProductionHistory, getProductionWorkspace, logWaterProduction, reviewLegacyProduction, transitionWaterProduction, upsertWaterSchemeSource } from "@/app/actions/intelligence"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ProductionResult } from "@/lib/production/schemas"

export type Workspace = Extract<Awaited<ReturnType<typeof getProductionWorkspace>>, { ok: true }>["data"]
type Log = Workspace["records"][number]
type Source = Workspace["sources"][number]
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
const selectClass = "block w-full rounded border bg-background p-2"

export function ProductionPanel({ data, reload, nextPage }: { data: Workspace; reload: () => Promise<void>; nextPage: () => Promise<void> }) {
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID())
  const [editing, setEditing] = useState<Log | null>(null)
  const [legacy, setLegacy] = useState(false)
  const [sourceEdit, setSourceEdit] = useState<Source | null | undefined>(undefined)
  const [formKey, setFormKey] = useState(0)
  const [history, setHistory] = useState<Extract<Awaited<ReturnType<typeof getProductionHistory>>, { ok: true }>["data"] | null>(null)
  const [review, setReview] = useState<{ row: Log; operation: "verify" | "flag" | "revoke" | "void" } | null>(null)
  const [reason, setReason] = useState("")
  const [sourceId, setSourceId] = useState("")
  async function perform<T>(action: () => Promise<ProductionResult<T>>, done?: () => void) {
    if (lock.current) return
    lock.current = true; setBusy(true); setMessage("")
    try {
      const result = await action()
      if (!result.ok) { setMessage(`${result.message}${result.fieldErrors ? " — " + Object.entries(result.fieldErrors).map(([k,v]) => `${k}: ${v?.join(", ")}`).join("; ") : ""}`); return }
      done?.(); setMessage("Production saved."); await reload()
    } catch { setMessage("The result could not be confirmed. Retry the unchanged submission to avoid a duplicate.") }
    finally { lock.current = false; setBusy(false) }
  }
  function reset() { setEditing(null); setLegacy(false); setSourceId(""); setRequestKey(crypto.randomUUID()); setFormKey(k => k + 1) }
  function beginEdit(row: Log, isLegacy = false) { setEditing(row); setLegacy(isLegacy); setSourceId(row.sourceId ?? ""); setRequestKey(crypto.randomUUID()); setFormKey(k => k + 1); setMessage("") }
  function saveLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const f = new FormData(event.currentTarget)
    const measurement = { schemeId: data.scheme!.id, sourceId: String(f.get("sourceId") ?? editing?.sourceId ?? ""), productionDate: String(f.get("productionDate") ?? editing?.productionDate ?? ""), waterProducedM3: String(f.get("waterProducedM3")), waterSuppliedM3: String(f.get("waterSuppliedM3") ?? ""), operatingHours: String(f.get("operatingHours") ?? ""), notes: String(f.get("notes") ?? "") }
    const action = legacy && editing ? () => reviewLegacyProduction({ ...measurement, id: editing.id, expectedVersion: editing.version, requestKey, reason: String(f.get("legacyReason") ?? "") }) : editing ? () => editWaterProduction({ ...measurement, id: editing.id, expectedVersion: editing.version }) : () => logWaterProduction({ ...measurement, requestKey })
    void perform(action, reset)
  }
  function saveSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget)
    const text = (name: string) => String(f.get(name) ?? "")
    void perform(() => upsertWaterSchemeSource({ ...(sourceEdit ? { id: sourceEdit.id, expectedVersion: sourceEdit.version } : {}), schemeId: data.scheme!.id, sourceName: text("sourceName"), technology: text("technology"), capacityMethod: text("capacityMethod"), installedPumpCapacityM3Hr: text("installedPumpCapacityM3Hr"), regimeHoursPerDay: text("regimeHoursPerDay"), containerVolumeLitres: text("containerVolumeLitres"), averageFillTimeSeconds: text("averageFillTimeSeconds") }), () => setSourceEdit(undefined))
  }
  const summary = data.summary
  if (!data.scheme) return <p>No production schemes are available in your scope. Contact your IAM administrator.</p>
  return <div className="space-y-6">
    <h2 className="text-xl font-semibold">{data.scheme.name} — {data.month}</h2>
    {message && <p role="status" className="rounded border p-3">{message} <Button variant="outline" size="sm" disabled={busy} onClick={() => { reset(); void reload() }}>Reload latest records</Button></p>}
    {summary && <div className="grid gap-3 text-sm md:grid-cols-2">
      <p>Official water produced: <strong>{summary.available ? `${summary.totalWaterProducedM3} m³ (verified)` : "Unavailable — no verified observations"}</strong></p>
      <p>Official water supplied: <strong>{summary.suppliedComplete ? `${summary.totalWaterSuppliedM3} m³ (verified)` : "Incomplete supplied data"}</strong></p>
      <p>Provisional production: {summary.provisionalProducedM3} m³ ({summary.provisionalCount} entries)</p>
      <p>Days with verified entries: {summary.loggedDaysCount}/{summary.expectedDays} ({summary.coveragePercent}%). This is not all-source completeness.</p>
      <p>Current-configuration capacity benchmark: {summary.currentCapacityM3Month === null ? "Unavailable — confirm source configuration" : `${summary.currentCapacityM3Month.toLocaleString()} m³/month`}. Historical capacity is not inferred.</p>
      <p>Legacy records awaiting date/source review: {summary.legacyCount}. These are excluded from official totals.</p>
    </div>}
    <section className="space-y-3" aria-label="Production sources">
      <h3 className="font-semibold">Water sources</h3>
      {data.sources.length === 0 && <p>No source is configured. A source manager must add one before recording.</p>}
      {data.sources.map(source => <div key={source.id} className="flex flex-wrap items-center gap-3 rounded border p-3 text-sm"><span>{source.sourceName} — {source.technology} {source.active ? "" : "(archived)"}</span><span>{source.capacityConfirmedAt ? `Method: ${source.capacityMethod}; ${source.currentCapacityM3Day ?? "unknown"} m³/day` : "Legacy capacity — unconfirmed"}</span>{data.capabilities.sources && <><Button variant="outline" size="sm" disabled={busy} onClick={() => setSourceEdit(source)}>Edit {source.sourceName}</Button>{source.active && <Button variant="outline" size="sm" disabled={busy} onClick={() => void perform(() => archiveWaterSchemeSource({ id: source.id, expectedVersion: source.version }))}>Archive {source.sourceName}</Button>}</>}</div>)}
      {data.capabilities.sources && <Button variant="outline" disabled={busy} onClick={() => setSourceEdit(null)}>Add water source</Button>}
      {sourceEdit !== undefined && data.capabilities.sources && <form key={sourceEdit?.id ?? "new-source"} onSubmit={saveSource} className="grid gap-3 rounded border p-4 md:grid-cols-2" aria-label="Source configuration">
        <label>Source name<Input name="sourceName" required maxLength={150} defaultValue={sourceEdit?.sourceName ?? ""} /></label>
        <label>Technology<select name="technology" className={selectClass} defaultValue={sourceEdit?.technology ?? "gravity"}>{["gravity","pumped_grid","pumped_solar","pumped_generator","hybrid"].map(v => <option key={v}>{v}</option>)}</select></label>
        <label>Authoritative capacity method<select name="capacityMethod" className={selectClass} defaultValue={sourceEdit?.capacityMethod ?? "unknown"}>{["unknown","measured_hourly","bucket_test"].map(v => <option key={v}>{v}</option>)}</select></label>
        <label>Measured yield (m³/hour)<Input name="installedPumpCapacityM3Hr" inputMode="decimal" defaultValue={sourceEdit?.installedPumpCapacityM3Hr ?? ""} /></label>
        <label>Regime (hours/day, 0–24)<Input name="regimeHoursPerDay" inputMode="decimal" defaultValue={sourceEdit?.regimeHoursPerDay ?? ""} /></label>
        <label>Bucket volume (litres)<Input name="containerVolumeLitres" inputMode="decimal" defaultValue={Number(sourceEdit?.containerVolumeLitres) > 0 ? sourceEdit!.containerVolumeLitres! : ""} /></label>
        <label>Bucket fill time (seconds)<Input name="averageFillTimeSeconds" inputMode="decimal" defaultValue={Number(sourceEdit?.averageFillTimeSeconds) > 0 ? sourceEdit!.averageFillTimeSeconds! : ""} /></label>
        <p className="text-sm">Blank inputs mean unknown. Saving confirms the selected method and current configuration.</p>
        <Button disabled={busy} type="submit">Save source configuration</Button><Button type="button" variant="outline" onClick={() => setSourceEdit(undefined)}>Cancel source edit</Button>
      </form>}
    </section>
    {(data.capabilities.create || (legacy && data.capabilities.verify)) && <form key={formKey} onSubmit={saveLog} className="grid gap-3 rounded border p-4 md:grid-cols-2" aria-label="Daily production entry">
      <h3 className="font-semibold md:col-span-2">{legacy ? "Review legacy daily record" : editing ? "Correct unverified daily record" : "Record daily production"}</h3>
      <label>Production source<select name="sourceId" aria-label="Production source" required className={selectClass} disabled={!!editing && !legacy} value={sourceId} onChange={e => setSourceId(e.target.value)}><option value="">Select source</option>{data.sources.filter(s => s.active || s.id === editing?.sourceId).map(s => <option key={s.id} value={s.id}>{s.sourceName}{s.active ? "" : " (archived)"}</option>)}</select></label>
      <label>Production date<Input name="productionDate" aria-label="Production date" required type="date" max={today()} disabled={!!editing && !legacy} defaultValue={editing?.productionDate ?? today()} /></label>
      <label>Water produced (m³)<Input name="waterProducedM3" aria-label="Water produced (m³)" required inputMode="decimal" defaultValue={editing?.waterProducedM3 ?? ""} /></label>
      <label>Water supplied (m³)<Input name="waterSuppliedM3" aria-label="Water supplied (m³)" inputMode="decimal" defaultValue={editing?.waterSuppliedM3 ?? ""} /></label>
      <label>Operating hours (0–24)<Input name="operatingHours" aria-label="Operating hours" inputMode="decimal" defaultValue={editing?.operatingHours ?? ""} /></label>
      <label>Notes<Input name="notes" aria-label="Production notes" maxLength={2000} defaultValue={editing?.notes ?? ""} /></label>
      {legacy && <label>Legacy review reason<Input name="legacyReason" required minLength={10} maxLength={1000} /></label>}
      <p className="text-sm md:col-span-2">One source per day. Supplied is water leaving the source into the supply system. Blank supplied/hours means unknown; zero is a measurement. Reporting follows the production calendar month, not the collection window. A missing billing period does not prevent recording.</p>
      <Button type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Save corrected entry" : "Save daily production"}</Button><Button type="button" variant="outline" disabled={busy} onClick={reset}>Start a new entry</Button>
    </form>}
    <section aria-label="Production records" className="space-y-3">
      <h3 className="font-semibold">Production history</h3>
      {!data.records.length && <p>No daily records for this month.</p>}
      {data.records.map(row => <article key={row.id} className="space-y-2 rounded border p-3 text-sm">
        <p><strong>{row.productionDate ?? "Legacy date unreviewed"}</strong> — {data.sources.find(s => s.id === row.sourceId)?.sourceName ?? "Source unreviewed"} — {row.status} — version {row.version}</p>
        <p>Produced: {row.waterProducedM3} m³; supplied: {row.waterSuppliedM3 ?? "unknown"} m³; hours: {row.operatingHours ?? "unknown"}. {row.billingPeriodId ? "Billing month linked." : "Billing period not yet available."}</p>
        {row.waterSuppliedM3 !== null && Number(row.waterSuppliedM3) > Number(row.waterProducedM3) && <p className="text-amber-700">Review warning: supplied exceeds produced; an explanatory note is required before verification.</p>}
        {row.notes && <p>{row.notes}</p>}
        <div className="flex flex-wrap gap-2">
          {row.workflowVersion === 1 && data.capabilities.create && row.recordedById === data.userId && ["entered","flagged"].includes(row.status) && <Button variant="outline" size="sm" disabled={busy} onClick={() => beginEdit(row)}>Correct entry</Button>}
          {row.workflowVersion === 0 && data.capabilities.verify && ["entered","flagged"].includes(row.status) && <Button variant="outline" size="sm" disabled={busy} onClick={() => beginEdit(row, true)}>Review legacy entry</Button>}
          {data.capabilities.verify && row.recordedById !== data.userId && row.status !== "void" && ([...(row.workflowVersion === 1 && row.status === "entered" ? [...(!row.legacyReviewerIds?.includes(data.userId) ? ["verify"] : []), "flag"] : []), ...(row.status === "verified" ? ["revoke"] : []), "void"] as const).map(op => <Button key={op} variant="outline" size="sm" disabled={busy} onClick={() => { setReview({ row, operation: op as "verify" | "flag" | "revoke" | "void" }); setReason("") }}>{op === "revoke" ? "Revoke verification" : op.charAt(0).toUpperCase()+op.slice(1)}</Button>)}
          <Button variant="outline" size="sm" disabled={busy} onClick={async () => { const result = await getProductionHistory(row.id); if (result.ok) setHistory(result.data); else setMessage(result.message) }}>View audit history</Button>
        </div>
      </article>)}
      {data.nextCursor && <Button variant="outline" disabled={busy} onClick={() => void nextPage()}>Next records</Button>}
      {review && <form aria-label="Review production" className="space-y-3 rounded border p-4" onSubmit={e => { e.preventDefault(); void perform(() => transitionWaterProduction({ id: review.row.id, expectedVersion: review.row.version, operation: review.operation, reason }), () => setReview(null)) }}>
        <p>{review.operation} production dated {review.row.productionDate ?? "unreviewed"}. {review.operation === "revoke" && "This removes the entry from official totals until independently reverified."}</p>
        <label>Review reason<Input value={reason} onChange={e => setReason(e.target.value)} required={review.operation !== "verify"} minLength={review.operation !== "verify" ? 10 : undefined} maxLength={1000} /></label>
        <Button type="submit" disabled={busy}>Confirm {review.operation}</Button><Button type="button" variant="outline" onClick={() => setReview(null)}>Cancel review</Button>
      </form>}
      {history && <section aria-label="Production audit history"><h4 className="font-semibold">Audit history (latest 100 events)</h4>{history.map(h => <details key={h.id}><summary>{h.action} — {h.userName || h.userId || "Unknown historical actor"} — {new Date(h.createdAt).toLocaleString()}</summary><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(h.details, null, 2)}</pre></details>)}<Button variant="outline" onClick={() => setHistory(null)}>Close audit history</Button></section>}
    </section>
  </div>
}
