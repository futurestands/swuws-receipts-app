import { formatUGX } from "@/lib/format"
/** Availability is authoritative; compatibility numeric subtotals must not masquerade as observations. */
export function displayMeasurement(value: number, available: boolean | undefined, style: "number" | "currency" | "percent" = "number"): string {
  if (available === false || !Number.isFinite(value)) return "Unresolved"
  return style === "currency" ? formatUGX(value) : style === "percent" ? `${value}%` : value.toLocaleString()
}
