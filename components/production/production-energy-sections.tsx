"use client"

import { useState, type FormEvent } from "react"
import {
  archiveWaterSchemeEnergyAsset,
  assignEnergyAssetSourcesAction,
  getProductionMeasurementHistory,
  logProductionElectricityAction,
  logProductionFuelAction,
  logProductionIntervalAction,
  transitionProductionMeasurement,
  upsertWaterSchemeEnergyAsset,
} from "@/app/actions/intelligence"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ProductionResult, ReviewableMeasurementKind } from "@/lib/production/schemas"
import type { Workspace } from "./production-panel"

type EnergyAsset = NonNullable<Workspace["energyAssets"]>[number]
type AssetAssignment = NonNullable<Workspace["assetAssignments"]>[number]
type IntervalRow = NonNullable<Workspace["intervals"]>[number]
type ElectricityRow = NonNullable<Workspace["electricityRecords"]>[number]
type FuelRow = NonNullable<Workspace["fuelRecords"]>[number]
type AuditEvents = Extract<Awaited<ReturnType<typeof getProductionMeasurementHistory>>, { ok: true }>["data"]

export type EntryMode = "daily" | "interval" | "electricity" | "fuel"

const selectClass = "block w-full rounded border bg-background p-2"

const kampalaToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())

/** Converts an EAT (Africa/Kampala, fixed UTC+03:00) datetime-local input to an ISO-8601 UTC timestamp. */
export function eatLocalToIso(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (trimmed.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(trimmed)) return trimmed
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed) ? `${trimmed}:00` : trimmed
  const parsed = new Date(`${withSeconds}+03:00`)
  return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString()
}

function formatEatTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date) + " EAT"
}

export function MonthlyProductionEnergySummary({ summary }: { summary: NonNullable<Workspace["summary"]> }) {
  if (!summary.energy) return null
  const { energy, estimatedAllocation } = summary

  const qualityVariant =
    summary.dataQualityStatus === "COMPLETE"
      ? "default"
      : summary.dataQualityStatus === "PARTIAL"
      ? "secondary"
      : "outline"

  return (
    <section aria-label="Monthly production and energy summary" className="space-y-4 rounded-lg border bg-muted/20 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Monthly Production &amp; Energy Summary ({summary.month})</h3>
        <Badge variant={qualityVariant}>Source Completeness: {summary.dataQualityStatus}</Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1 rounded border bg-background p-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">Water Production Breakdown</p>
          <p>Daily verified: <strong>{summary.dailyVerifiedProducedM3} m³</strong> ({summary.logsCount} daily logs)</p>
          <p>Whole-month intervals: <strong>{summary.intervalMeasuredProducedM3} m³</strong> ({summary.intervalMeasuredCount} intervals)</p>
          <p>Source-day coverage: <strong>{summary.verifiedSourceDays}/{summary.requiredSourceDays}</strong> ({summary.missingSourceDays} missing)</p>
          {summary.provisionalIntervalCount > 0 && (
            <p className="text-amber-700">
              Provisional intervals: {summary.provisionalIntervalTotalM3} m³ ({summary.provisionalIntervalCount} awaiting verification)
            </p>
          )}
          {summary.intervalConflictCount > 0 && (
            <p className="text-destructive">
              Excluded daily/interval conflicts: {summary.excludedConflictedIntervalM3} m³ ({summary.intervalConflictCount} interval(s) overlap daily logs)
            </p>
          )}
        </div>

        <div className="space-y-1 rounded border bg-background p-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">Grid Electricity (Measured)</p>
          <p>Verified electricity: <strong>{energy.totalKwh.toLocaleString()} kWh</strong></p>
          <p>
            Specific power:{" "}
            <strong>
              {energy.kwhPerM3 !== null
                ? `${energy.kwhPerM3} kWh/m³`
                : "Unavailable (requires complete water & meter coverage)"}
            </strong>
          </p>
          <p className="text-xs text-muted-foreground">
            Meter coverage: {energy.electricityCoverageComplete ? "Complete for period" : "Incomplete or no active meter"}
          </p>
          {(energy.provisionalElectricityCount ?? 0) > 0 && (
            <p className="text-amber-700">
              Provisional electricity: {(energy.provisionalElectricityKwh ?? 0).toLocaleString()} kWh ({energy.provisionalElectricityCount} unverified)
            </p>
          )}
        </div>

        <div className="space-y-1 rounded border bg-background p-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">Generator Fuel &amp; Energy OpEx</p>
          <p>Verified stock-reconciled fuel: <strong>{energy.totalFuelLitres.toLocaleString()} L</strong></p>
          <p>
            Specific fuel:{" "}
            <strong>
              {energy.fuelPerM3 !== null
                ? `${energy.fuelPerM3} L/m³`
                : "Unavailable (requires complete water & generator stock coverage)"}
            </strong>
          </p>
          <p>Measured energy OpEx: <strong>UGX {energy.totalEnergyCostUgx.toLocaleString()}</strong></p>
          {energy.fuelUnavailableCount > 0 && (
            <p className="text-amber-700">
              Purchase-only fuel logs (consumption unknown): {energy.fuelUnavailableCount} log(s), UGX{" "}
              {energy.fuelUnreconciledExpenditureUgx.toLocaleString()} spend
            </p>
          )}
          {(energy.provisionalFuelCount ?? 0) > 0 && (
            <p className="text-amber-700">
              Provisional fuel: {(energy.provisionalFuelLitres ?? 0).toLocaleString()} L reconciled ({energy.provisionalFuelCount} unverified)
            </p>
          )}
        </div>
      </div>

      {estimatedAllocation?.present && (
        <div className="space-y-2 rounded border border-amber-500/40 bg-amber-50/50 p-3 dark:bg-amber-950/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-amber-900 dark:text-amber-200">
              Cross-Month Estimated Allocations (ESTIMATED_ALLOCATION — Kept Separate from Measured Actuals)
            </p>
            <Badge variant="outline">Not Merged into Official Measured Totals</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Estimated shares for {summary.month}: Water <strong>{estimatedAllocation.producedM3} m³</strong> | Electricity{" "}
            <strong>{estimatedAllocation.electricityKwh.toLocaleString()} kWh</strong> (UGX{" "}
            {estimatedAllocation.electricityCostUgx.toLocaleString()}) | Fuel{" "}
            <strong>{estimatedAllocation.fuelLitres.toLocaleString()} L</strong> (UGX{" "}
            {estimatedAllocation.fuelExpenditureUgx.toLocaleString()}).
          </p>
          <ul className="space-y-1 text-xs">
            {estimatedAllocation.records.map((rec) => (
              <li key={`${rec.kind}:${rec.recordId}`}>
                <strong>{rec.kind}</strong>: allocated <strong>{rec.allocatedToMonth} {rec.unit}</strong> of measured{" "}
                <strong>{rec.measuredTotal} {rec.unit}</strong> via <code>{rec.method}</code> (max error ±{rec.maxAbsoluteError} {rec.unit})
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

export function EnergyAssetsSection({
  data,
  busy,
  perform,
}: {
  data: Workspace
  busy: boolean
  perform: <T>(action: () => Promise<ProductionResult<T>>, done?: () => void) => Promise<void>
}) {
  const assets = data.energyAssets ?? []
  const assignments = data.assetAssignments ?? []
  const [assetEdit, setAssetEdit] = useState<EnergyAsset | null | undefined>(undefined)
  const [assetTypeDraft, setAssetTypeDraft] = useState<"electricity_meter" | "generator">("electricity_meter")
  const [assigningAsset, setAssigningAsset] = useState<EnergyAsset | null>(null)
  const [selectedSources, setSelectedSources] = useState<string[]>([])

  function openNewAsset() {
    setAssetTypeDraft("electricity_meter")
    setAssetEdit(null)
  }

  function openEditAsset(asset: EnergyAsset) {
    setAssetTypeDraft(asset.assetType as "electricity_meter" | "generator")
    setAssetEdit(asset)
  }

  function openAssignAsset(asset: EnergyAsset) {
    const currentSourceIds = assignments.filter((a) => a.assetId === asset.id).map((a) => a.sourceId)
    setSelectedSources(currentSourceIds)
    setAssigningAsset(asset)
  }

  function toggleSource(sourceId: string) {
    setSelectedSources((prev) =>
      prev.includes(sourceId) ? prev.filter((id) => id !== sourceId) : [...prev, sourceId],
    )
  }

  function saveAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const f = new FormData(event.currentTarget)
    const assetType = assetEdit ? assetEdit.assetType : String(f.get("assetType") ?? assetTypeDraft)
    const fuelType = assetType === "generator" ? String(f.get("fuelType") ?? "diesel") : ""
    const assetRef = String(f.get("assetRef") ?? "")
    void perform(
      () =>
        upsertWaterSchemeEnergyAsset({
          ...(assetEdit ? { id: assetEdit.id } : {}),
          schemeId: data.scheme!.id,
          assetType,
          assetRef,
          fuelType,
        }),
      () => setAssetEdit(undefined),
    )
  }

  function saveAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!assigningAsset) return
    void perform(
      () =>
        assignEnergyAssetSourcesAction({
          schemeId: data.scheme!.id,
          assetId: assigningAsset.id,
          sourceIds: selectedSources,
        }),
      () => setAssigningAsset(null),
    )
  }

  return (
    <section className="space-y-3" aria-label="Energy assets and assignments">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">Energy meters &amp; generators</h3>
          <p className="text-xs text-muted-foreground">
            Shared meters or generators assigned to multiple water sources record consumption once per asset without duplication.
          </p>
        </div>
        {data.capabilities.sources && (
          <Button variant="outline" size="sm" disabled={busy} onClick={openNewAsset}>
            Add energy asset
          </Button>
        )}
      </div>

      {assets.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No electricity meters or generators are registered for this scheme yet.
        </p>
      )}

      {assets.map((asset) => {
        const linkedSourceIds = assignments.filter((a: AssetAssignment) => a.assetId === asset.id).map((a) => a.sourceId)
        const linkedNames = linkedSourceIds
          .map((id) => data.sources.find((s) => s.id === id)?.sourceName ?? id)
          .join(", ")
        return (
          <div key={asset.id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-3 text-sm">
            <div className="space-y-1">
              <p>
                <strong>{asset.assetRef}</strong> —{" "}
                {asset.assetType === "electricity_meter"
                  ? "Grid electricity meter"
                  : `Generator (${asset.fuelType ?? "fuel"})`}{" "}
                {asset.active ? "" : "(archived)"}
              </p>
              <p className="text-xs text-muted-foreground">
                Assigned sources ({linkedSourceIds.length || 0}; max supported units {Math.max(1, linkedSourceIds.length)}):{" "}
                {linkedNames || "Scheme-level / unassigned"}
              </p>
            </div>
            {data.capabilities.sources && (
              <div className="flex flex-wrap gap-2">
                {asset.active && (
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => openAssignAsset(asset)}>
                    Assign sources ({asset.assetRef})
                  </Button>
                )}
                <Button variant="outline" size="sm" disabled={busy} onClick={() => openEditAsset(asset)}>
                  Edit {asset.assetRef}
                </Button>
                {asset.active && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void perform(() => archiveWaterSchemeEnergyAsset({ id: asset.id }))}
                  >
                    Archive {asset.assetRef}
                  </Button>
                )}
              </div>
            )}
          </div>
        )
      })}

      {assetEdit !== undefined && data.capabilities.sources && (
        <form
          key={assetEdit?.id ?? "new-energy-asset"}
          onSubmit={saveAsset}
          aria-label="Energy asset configuration"
          className="grid gap-3 rounded border p-4 md:grid-cols-3"
        >
          <label>
            Asset type
            <select
              name="assetType"
              aria-label="Energy asset type"
              className={selectClass}
              disabled={!!assetEdit}
              value={assetTypeDraft}
              onChange={(e) => setAssetTypeDraft(e.target.value as "electricity_meter" | "generator")}
            >
              <option value="electricity_meter">electricity_meter</option>
              <option value="generator">generator</option>
            </select>
          </label>
          <label>
            Asset reference / meter serial
            <Input
              name="assetRef"
              aria-label="Asset reference"
              required
              maxLength={150}
              defaultValue={assetEdit?.assetRef ?? ""}
            />
          </label>
          {assetTypeDraft === "generator" ? (
            <label>
              Generator fuel type
              <select
                name="fuelType"
                aria-label="Generator fuel type"
                className={selectClass}
                defaultValue={assetEdit?.fuelType ?? "diesel"}
              >
                <option value="diesel">diesel</option>
                <option value="petrol">petrol</option>
              </select>
            </label>
          ) : (
            <div className="flex items-end text-xs text-muted-foreground">
              Electricity meters record kWh readings and do not take a fuel type.
            </div>
          )}
          <div className="flex flex-wrap gap-2 md:col-span-3">
            <Button type="submit" disabled={busy}>
              Save energy asset
            </Button>
            <Button type="button" variant="outline" onClick={() => setAssetEdit(undefined)}>
              Cancel asset edit
            </Button>
          </div>
        </form>
      )}

      {assigningAsset && data.capabilities.sources && (
        <form
          onSubmit={saveAssignment}
          aria-label="Assign asset sources"
          className="space-y-3 rounded border p-4 text-sm"
        >
          <p className="font-semibold">
            Assign authorised water sources to {assigningAsset.assetRef} ({assigningAsset.assetType})
          </p>
          {data.sources.length === 0 ? (
            <p className="text-muted-foreground">Add at least one water source in this scheme first.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {data.sources.map((src) => (
                <label key={src.id} className="flex items-center gap-2 rounded border p-2">
                  <input
                    type="checkbox"
                    checked={selectedSources.includes(src.id)}
                    onChange={() => toggleSource(src.id)}
                  />
                  <span>
                    {src.sourceName} ({src.technology}) {src.active ? "" : "(archived)"}
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              Save source assignments
            </Button>
            <Button type="button" variant="outline" onClick={() => setAssigningAsset(null)}>
              Cancel assignment
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}

export function ExtendedMeasurementForms({
  data,
  mode,
  busy,
  perform,
}: {
  data: Workspace
  mode: Exclude<EntryMode, "daily">
  busy: boolean
  perform: <T>(action: () => Promise<ProductionResult<T>>, done?: () => void) => Promise<void>
}) {
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID())
  const [formKey, setFormKey] = useState(0)
  const [isReset, setIsReset] = useState(false)
  const [selectedGeneratorId, setSelectedGeneratorId] = useState("")
  const [openingStock, setOpeningStock] = useState("")
  const [closingStock, setClosingStock] = useState("")

  const assets = (data.energyAssets ?? []).filter((a) => a.active)
  const meters = assets.filter((a) => a.assetType === "electricity_meter")
  const generators = assets.filter((a) => a.assetType === "generator")
  const assignments = data.assetAssignments ?? []

  function resetForm() {
    setRequestKey(crypto.randomUUID())
    setFormKey((k) => k + 1)
    setIsReset(false)
    setOpeningStock("")
    setClosingStock("")
  }

  if (mode === "interval") {
    const submitInterval = (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const f = new FormData(event.currentTarget)
      const text = (k: string) => String(f.get(k) ?? "")
      void perform(
        () =>
          logProductionIntervalAction({
            schemeId: data.scheme!.id,
            sourceId: text("sourceId"),
            meterRef: text("meterRef"),
            meterUnit: text("meterUnit") || "m3",
            multiplier: text("multiplier") || "1.00",
            openingReading: text("openingReading"),
            openingTimestamp: eatLocalToIso(text("openingTimestamp")),
            closingReading: text("closingReading"),
            closingTimestamp: eatLocalToIso(text("closingTimestamp")),
            rolloverValue: text("rolloverValue"),
            isReset,
            notes: text("notes"),
            requestKey,
          }),
        resetForm,
      )
    }

    return (
      <form
        key={`interval-${formKey}`}
        onSubmit={submitInterval}
        aria-label="Multi-day water interval entry"
        className="grid gap-3 rounded border p-4 md:grid-cols-2"
      >
        <h3 className="font-semibold md:col-span-2">Record multi-day water meter interval</h3>
        <label>
          Water source
          <select name="sourceId" aria-label="Interval source" required className={selectClass} defaultValue="">
            <option value="">Select active source</option>
            {data.sources
              .filter((s) => s.active)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sourceName}
                </option>
              ))}
          </select>
        </label>
        <label>
          Bulk meter reference
          <Input name="meterRef" aria-label="Bulk meter reference" required maxLength={100} />
        </label>
        <label>
          Opening reading
          <Input name="openingReading" aria-label="Opening meter reading" required inputMode="decimal" />
        </label>
        <label>
          Opening timestamp (EAT)
          <Input name="openingTimestamp" aria-label="Opening timestamp" required type="datetime-local" />
        </label>
        <label>
          Closing reading
          <Input name="closingReading" aria-label="Closing meter reading" required inputMode="decimal" />
        </label>
        <label>
          Closing timestamp (EAT)
          <Input name="closingTimestamp" aria-label="Closing timestamp" required type="datetime-local" />
        </label>
        <label>
          Meter unit
          <select name="meterUnit" aria-label="Meter unit" className={selectClass} defaultValue="m3">
            <option value="m3">m3</option>
            <option value="litres">litres</option>
            <option value="gallons">gallons (Imperial)</option>
          </select>
        </label>
        <label>
          Pulse / dial multiplier
          <Input name="multiplier" aria-label="Meter multiplier" inputMode="decimal" defaultValue="1.00" />
        </label>
        <label>
          Rollover maximum (optional)
          <Input name="rolloverValue" aria-label="Rollover maximum" inputMode="decimal" disabled={isReset} />
        </label>
        <label className="flex items-center gap-2 pt-6 text-sm">
          <input
            type="checkbox"
            checked={isReset}
            onChange={(e) => setIsReset(e.target.checked)}
            aria-label="Meter reset to zero"
          />
          Meter replaced or reset to zero at opening
        </label>
        <label className="md:col-span-2">
          Notes
          <Input name="notes" aria-label="Interval notes" maxLength={2000} />
        </label>
        <p className="text-xs text-muted-foreground md:col-span-2">
          Non-overlapping per source + meter reference. Whole-month verified intervals count as measured actuals unless they overlap a daily log on the same source. Cross-month intervals preserve their measured total and report any single-month share separately as ESTIMATED_ALLOCATION.
        </p>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save water interval"}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={resetForm}>
          Reset interval form
        </Button>
      </form>
    )
  }

  if (mode === "electricity") {
    const submitElectricity = (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const f = new FormData(event.currentTarget)
      const text = (k: string) => String(f.get(k) ?? "")
      void perform(
        () =>
          logProductionElectricityAction({
            schemeId: data.scheme!.id,
            assetId: text("assetId"),
            openingReadingKwh: text("openingReadingKwh"),
            openingTimestamp: eatLocalToIso(text("openingTimestamp")),
            closingReadingKwh: text("closingReadingKwh"),
            closingTimestamp: eatLocalToIso(text("closingTimestamp")),
            multiplier: text("multiplier") || "1.00",
            rolloverValueKwh: text("rolloverValueKwh"),
            isReset,
            pumpOperatingHours: text("pumpOperatingHours"),
            electricityCostUgx: text("electricityCostUgx"),
            notes: text("notes"),
            requestKey,
          }),
        resetForm,
      )
    }

    return (
      <form
        key={`electricity-${formKey}`}
        onSubmit={submitElectricity}
        aria-label="Electricity consumption entry"
        className="grid gap-3 rounded border p-4 md:grid-cols-2"
      >
        <h3 className="font-semibold md:col-span-2">Record electricity meter interval (kWh)</h3>
        <label className="md:col-span-2">
          Electricity meter asset
          <select name="assetId" aria-label="Electricity meter asset" required className={selectClass} defaultValue="">
            <option value="">Select active electricity meter</option>
            {meters.map((m) => {
              const count = Math.max(1, assignments.filter((a) => a.assetId === m.id).length)
              return (
                <option key={m.id} value={m.id}>
                  {m.assetRef} (supports up to {count} pump unit{count > 1 ? "s" : ""})
                </option>
              )
            })}
          </select>
        </label>
        <label>
          Opening reading (kWh)
          <Input name="openingReadingKwh" aria-label="Opening kWh" required inputMode="decimal" />
        </label>
        <label>
          Opening timestamp (EAT)
          <Input name="openingTimestamp" aria-label="Electricity opening timestamp" required type="datetime-local" />
        </label>
        <label>
          Closing reading (kWh)
          <Input name="closingReadingKwh" aria-label="Closing kWh" required inputMode="decimal" />
        </label>
        <label>
          Closing timestamp (EAT)
          <Input name="closingTimestamp" aria-label="Electricity closing timestamp" required type="datetime-local" />
        </label>
        <label>
          CT / meter multiplier
          <Input name="multiplier" aria-label="CT multiplier" inputMode="decimal" defaultValue="1.00" />
        </label>
        <label>
          Aggregate pump operating hours (optional)
          <Input name="pumpOperatingHours" aria-label="Aggregate pump operating hours" inputMode="decimal" />
        </label>
        <label>
          Electricity cost (UGX, optional)
          <Input name="electricityCostUgx" aria-label="Electricity cost (UGX)" inputMode="decimal" />
        </label>
        <label>
          Rollover maximum kWh (optional)
          <Input name="rolloverValueKwh" aria-label="Electricity rollover maximum" inputMode="decimal" disabled={isReset} />
        </label>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={isReset}
            onChange={(e) => setIsReset(e.target.checked)}
            aria-label="Electricity meter reset"
          />
          Electricity meter replaced or reset to zero at opening
        </label>
        <label className="md:col-span-2">
          Notes
          <Input name="notes" aria-label="Electricity notes" maxLength={2000} />
        </label>
        <p className="text-xs text-muted-foreground md:col-span-2">
          Aggregate pump operating hours are validated against actual elapsed interval hours × assigned water sources on the meter (never a fixed 24-hour cap for multi-day periods).
        </p>
        <Button type="submit" disabled={busy || meters.length === 0}>
          {busy ? "Saving…" : "Save electricity reading"}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={resetForm}>
          Reset electricity form
        </Button>
      </form>
    )
  }

  // Fuel mode
  const selectedGenerator = generators.find((g) => g.id === selectedGeneratorId)
  const bothStocksEntered = openingStock.trim() !== "" && closingStock.trim() !== ""
  const oneStockOnly = (openingStock.trim() !== "") !== (closingStock.trim() !== "")

  const submitFuel = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const f = new FormData(event.currentTarget)
    const text = (k: string) => String(f.get(k) ?? "")
    const generator = generators.find((g) => g.id === text("assetId"))
    void perform(
      () =>
        logProductionFuelAction({
          schemeId: data.scheme!.id,
          assetId: text("assetId"),
          fuelType: generator?.fuelType ?? "diesel",
          coverageStartDate: text("coverageStartDate"),
          coverageEndDate: text("coverageEndDate"),
          openingStockLitres: openingStock,
          closingStockLitres: closingStock,
          fuelPurchasedLitres: text("fuelPurchasedLitres"),
          fuelTransfersInLitres: text("fuelTransfersInLitres"),
          fuelTransfersOutLitres: text("fuelTransfersOutLitres"),
          fuelAdjustmentsLitres: text("fuelAdjustmentsLitres"),
          generatorOperatingHours: text("generatorOperatingHours"),
          fuelExpenditureUgx: text("fuelExpenditureUgx"),
          notes: text("notes"),
          requestKey,
        }),
      resetForm,
    )
  }

  return (
    <form
      key={`fuel-${formKey}`}
      onSubmit={submitFuel}
      aria-label="Generator fuel entry"
      className="grid gap-3 rounded border p-4 md:grid-cols-2"
    >
      <h3 className="font-semibold md:col-span-2">Record generator fuel purchases, stock movements &amp; reconciliation</h3>
      <label className="md:col-span-2">
        Generator asset
        <select
          name="assetId"
          aria-label="Generator asset"
          required
          className={selectClass}
          value={selectedGeneratorId}
          onChange={(e) => setSelectedGeneratorId(e.target.value)}
        >
          <option value="">Select active generator</option>
          {generators.map((g) => (
            <option key={g.id} value={g.id}>
              {g.assetRef} ({g.fuelType ?? "diesel"})
            </option>
          ))}
        </select>
      </label>
      <label>
        Coverage start date
        <Input
          name="coverageStartDate"
          aria-label="Fuel coverage start date"
          required
          type="date"
          max={kampalaToday()}
          defaultValue={kampalaToday()}
        />
      </label>
      <label>
        Coverage end date
        <Input
          name="coverageEndDate"
          aria-label="Fuel coverage end date"
          required
          type="date"
          max={kampalaToday()}
          defaultValue={kampalaToday()}
        />
      </label>
      <label>
        Opening tank stock (litres, optional)
        <Input
          name="openingStockLitres"
          aria-label="Opening stock (litres)"
          inputMode="decimal"
          value={openingStock}
          onChange={(e) => setOpeningStock(e.target.value)}
        />
      </label>
      <label>
        Closing tank stock (litres, optional)
        <Input
          name="closingStockLitres"
          aria-label="Closing stock (litres)"
          inputMode="decimal"
          value={closingStock}
          onChange={(e) => setClosingStock(e.target.value)}
        />
      </label>
      <label>
        Fuel purchased (litres, optional)
        <Input name="fuelPurchasedLitres" aria-label="Fuel purchased (litres)" inputMode="decimal" />
      </label>
      <label>
        Fuel expenditure (UGX, optional)
        <Input name="fuelExpenditureUgx" aria-label="Fuel expenditure (UGX)" inputMode="decimal" />
      </label>
      <label>
        Transfers in (litres, optional)
        <Input name="fuelTransfersInLitres" aria-label="Transfers in (litres)" inputMode="decimal" />
      </label>
      <label>
        Transfers out (litres, optional)
        <Input name="fuelTransfersOutLitres" aria-label="Transfers out (litres)" inputMode="decimal" />
      </label>
      <label>
        Stock adjustments (litres, optional)
        <Input name="fuelAdjustmentsLitres" aria-label="Stock adjustments (litres)" inputMode="decimal" />
      </label>
      <label>
        Generator operating hours (optional)
        <Input name="generatorOperatingHours" aria-label="Generator operating hours" inputMode="decimal" />
      </label>
      <label className="md:col-span-2">
        Notes
        <Input name="notes" aria-label="Fuel notes" maxLength={2000} />
      </label>
      <p className="rounded border bg-muted/30 p-2 text-xs md:col-span-2">
        {oneStockOnly
          ? "Stock warning: enter BOTH opening and closing stock readings to reconcile consumption, or leave both blank for a purchase-only entry."
          : bothStocksEntered
          ? `Mode: Stock-reconciled (${selectedGenerator?.fuelType ?? "generator fuel"}) — exact consumption will be computed from opening + purchases + transfers in − transfers out + adjustments − closing.`
          : "Mode: Purchase / stock-movement only — fuel purchased will be recorded without fabricating fuel consumed (consumption remains UNKNOWN until stock is reconciled)."}
      </p>
      <Button type="submit" disabled={busy || generators.length === 0}>
        {busy ? "Saving…" : "Save fuel record"}
      </Button>
      <Button type="button" variant="outline" disabled={busy} onClick={resetForm}>
        Reset fuel form
      </Button>
    </form>
  )
}

export function ExtendedMeasurementsLedger({
  data,
  busy,
  perform,
  onError,
}: {
  data: Workspace
  busy: boolean
  perform: <T>(action: () => Promise<ProductionResult<T>>, done?: () => void) => Promise<void>
  onError: (msg: string) => void
}) {
  const intervals = data.intervals ?? []
  const electricity = data.electricityRecords ?? []
  const fuel = data.fuelRecords ?? []
  const assets = data.energyAssets ?? []

  const [reviewTarget, setReviewTarget] = useState<{
    recordKind: ReviewableMeasurementKind
    id: string
    version: number
    label: string
    operation: "verify" | "flag" | "revoke" | "void"
  } | null>(null)
  const [reason, setReason] = useState("")
  const [auditState, setAuditState] = useState<{ label: string; events: AuditEvents } | null>(null)

  const hasAny = intervals.length > 0 || electricity.length > 0 || fuel.length > 0
  if (!hasAny && assets.length === 0) return null

  function availableOps(status: string): Array<"verify" | "flag" | "revoke" | "void"> {
    if (status === "void") return []
    if (status === "entered") return ["verify", "flag", "void"]
    if (status === "verified") return ["revoke", "void"]
    return ["void"]
  }

  async function viewHistory(kind: ReviewableMeasurementKind, id: string, label: string) {
    const result = await getProductionMeasurementHistory(kind, id)
    if (result.ok) setAuditState({ label, events: result.data })
    else onError(result.message)
  }

  function renderActions(
    kind: ReviewableMeasurementKind,
    row: { id: string; status: string; version: number; recordedById: string },
    label: string,
  ) {
    const canReview = data.capabilities.verify && row.recordedById !== data.userId && row.status !== "void"
    return (
      <div className="flex flex-wrap gap-2">
        {canReview &&
          availableOps(row.status).map((op) => (
            <Button
              key={op}
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setReviewTarget({ recordKind: kind, id: row.id, version: row.version, label, operation: op })
                setReason("")
              }}
            >
              {op === "revoke" ? "Revoke verification" : op.charAt(0).toUpperCase() + op.slice(1)}
            </Button>
          ))}
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void viewHistory(kind, row.id, label)}>
          View audit history
        </Button>
      </div>
    )
  }

  return (
    <section aria-label="Interval and energy records" className="space-y-4">
      <h3 className="font-semibold">Multi-day water intervals, electricity &amp; generator fuel ledger</h3>

      {!hasAny && (
        <p className="text-sm text-muted-foreground">
          No multi-day water intervals, electricity readings, or generator fuel records overlap {data.month}.
        </p>
      )}

      {intervals.map((row: IntervalRow) => {
        const srcName = data.sources.find((s) => s.id === row.sourceId)?.sourceName ?? row.sourceId
        const crossMonth = row.coverageStartDate.slice(0, 7) !== row.coverageEndDate.slice(0, 7)
        const label = `water interval ${srcName} (${row.coverageStartDate} to ${row.coverageEndDate})`
        return (
          <article key={row.id} className="space-y-2 rounded border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>
                <strong>Water Interval — {srcName}</strong> (Meter <code>{row.meterRef}</code>) —{" "}
                <strong>{row.status}</strong> — version {row.version}
              </p>
              {crossMonth && <Badge variant="outline">Cross-month (ESTIMATED_ALLOCATION)</Badge>}
            </div>
            <p>
              {formatEatTimestamp(row.openingTimestamp)} ({row.openingReading} {row.meterUnit}) →{" "}
              {formatEatTimestamp(row.closingTimestamp)} ({row.closingReading} {row.meterUnit}) | Measured volume:{" "}
              <strong>{row.calculatedVolumeM3} m³</strong>
            </p>
            {row.notes && <p className="text-muted-foreground">{row.notes}</p>}
            {renderActions("interval", row, label)}
          </article>
        )
      })}

      {electricity.map((row: ElectricityRow) => {
        const assetRef = assets.find((a) => a.id === row.assetId)?.assetRef ?? row.assetId
        const crossMonth = row.coverageStartDate.slice(0, 7) !== row.coverageEndDate.slice(0, 7)
        const label = `electricity reading ${assetRef} (${row.coverageStartDate} to ${row.coverageEndDate})`
        return (
          <article key={row.id} className="space-y-2 rounded border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>
                <strong>Electricity — {assetRef}</strong> — <strong>{row.status}</strong> — version {row.version}
              </p>
              {crossMonth && <Badge variant="outline">Cross-month (ESTIMATED_ALLOCATION)</Badge>}
            </div>
            <p>
              {formatEatTimestamp(row.openingTimestamp)} ({row.openingReadingKwh} kWh) →{" "}
              {formatEatTimestamp(row.closingTimestamp)} ({row.closingReadingKwh} kWh) | Consumed:{" "}
              <strong>{row.calculatedConsumedKwh} kWh</strong> | Pump hours: {row.pumpOperatingHours ?? "unknown"} |
              Cost: {row.electricityCostUgx ? `UGX ${Number(row.electricityCostUgx).toLocaleString()}` : "unrecorded"}
            </p>
            {row.notes && <p className="text-muted-foreground">{row.notes}</p>}
            {renderActions("electricity", row, label)}
          </article>
        )
      })}

      {fuel.map((row: FuelRow) => {
        const assetRef = assets.find((a) => a.id === row.assetId)?.assetRef ?? row.assetId
        const crossMonth = row.coverageStartDate.slice(0, 7) !== row.coverageEndDate.slice(0, 7)
        const label = `fuel record ${assetRef} (${row.coverageStartDate} to ${row.coverageEndDate})`
        return (
          <article key={row.id} className="space-y-2 rounded border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>
                <strong>Generator Fuel ({row.fuelType}) — {assetRef}</strong> ({row.coverageStartDate} to{" "}
                {row.coverageEndDate}) — <strong>{row.status}</strong> — version {row.version}
              </p>
              <div className="flex gap-1">
                {row.calculatedConsumedLitres === null && (
                  <Badge variant="secondary">Purchase-only (consumption unknown)</Badge>
                )}
                {crossMonth && <Badge variant="outline">Cross-month (ESTIMATED_ALLOCATION)</Badge>}
              </div>
            </div>
            <p>
              Reconciled consumption:{" "}
              <strong>
                {row.calculatedConsumedLitres !== null
                  ? `${row.calculatedConsumedLitres} L`
                  : "Unknown — stock reconciliation not provided"}
              </strong>{" "}
              | Purchased: {row.fuelPurchasedLitres ?? "0.00"} L | Stock: {row.openingStockLitres ?? "—"} →{" "}
              {row.closingStockLitres ?? "—"} L | Generator hours: {row.generatorOperatingHours ?? "unknown"} | Spend:{" "}
              {row.fuelExpenditureUgx ? `UGX ${Number(row.fuelExpenditureUgx).toLocaleString()}` : "unrecorded"}
            </p>
            {row.notes && <p className="text-muted-foreground">{row.notes}</p>}
            {renderActions("fuel", row, label)}
          </article>
        )
      })}

      {reviewTarget && (
        <form
          aria-label="Review interval or energy record"
          className="space-y-3 rounded border p-4"
          onSubmit={(e) => {
            e.preventDefault()
            void perform(
              () =>
                transitionProductionMeasurement({
                  recordKind: reviewTarget.recordKind,
                  id: reviewTarget.id,
                  expectedVersion: reviewTarget.version,
                  operation: reviewTarget.operation,
                  reason,
                }),
              () => setReviewTarget(null),
            )
          }}
        >
          <p>
            <strong>{reviewTarget.operation.toUpperCase()}</strong> {reviewTarget.label}.{" "}
            {reviewTarget.operation === "revoke" &&
              "This removes the record from official totals until independently reverified."}
          </p>
          <label>
            Measurement review reason
            <Input
              aria-label="Measurement review reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required={reviewTarget.operation !== "verify"}
              minLength={reviewTarget.operation !== "verify" ? 10 : undefined}
              maxLength={1000}
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              Confirm {reviewTarget.operation}
            </Button>
            <Button type="button" variant="outline" onClick={() => setReviewTarget(null)}>
              Cancel review
            </Button>
          </div>
        </form>
      )}

      {auditState && (
        <section aria-label="Measurement audit history" className="space-y-2 rounded border p-3 text-sm">
          <h4 className="font-semibold">Audit history for {auditState.label}</h4>
          {auditState.events.map((h) => (
            <details key={h.id}>
              <summary>
                {h.action} — {h.userName || h.userId || "Unknown historical actor"} —{" "}
                {new Date(h.createdAt).toLocaleString()}
              </summary>
              <pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(h.details, null, 2)}</pre>
            </details>
          ))}
          <Button variant="outline" size="sm" onClick={() => setAuditState(null)}>
            Close measurement history
          </Button>
        </section>
      )}
    </section>
  )
}
