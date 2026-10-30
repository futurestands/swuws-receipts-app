import { formatUGX } from "@/lib/format"
import type { TrustedPerformanceDataset } from "./types"
export const hasMeasurement = (value: number, available: boolean | undefined) => available === true && Number.isFinite(value)
export const verifiedCollections = (d: TrustedPerformanceDataset) => d.collectionBasis === "verified_receipts" && d.availability?.collections === true
/** Availability is authoritative; compatibility numeric subtotals must not masquerade as observations. */
export function displayMeasurement(value: number, available: boolean | undefined, style: "number" | "currency" | "percent" = "number"): string {
  if (!hasMeasurement(value, available)) return "Unresolved"
  return style === "currency" ? formatUGX(value) : style === "percent" ? `${value}%` : value.toLocaleString()
}

export const productionDisplay = (d: TrustedPerformanceDataset) => d.production?.available === true && Number.isFinite(d.kpis.waterProducedM3) && d.kpis.waterProducedM3 >= 0
  ? d.kpis.waterProducedM3.toLocaleString() : "Unavailable: no verified observations"
export const capacityDisplay = (d: TrustedPerformanceDataset) => d.production?.capacityComplete === true && Number.isFinite(d.kpis.practicalCapacityM3Month) && d.kpis.practicalCapacityM3Month >= 0
  ? d.kpis.practicalCapacityM3Month.toLocaleString() : "Unavailable: unconfirmed configuration"
export const utilisationDisplay = (d: TrustedPerformanceDataset) => d.production?.capacityComplete === true && d.production?.available === true && Number.isFinite(d.kpis.waterProducedM3) && d.kpis.waterProducedM3 >= 0 && Number.isFinite(d.kpis.practicalCapacityM3Month) && d.kpis.practicalCapacityM3Month > 0 && Number.isFinite(d.kpis.capacityUtilizationPercent)
  ? `${d.kpis.capacityUtilizationPercent}%` : "Unavailable"
