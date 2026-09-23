import { PeriodChangeItem } from "./types"

export interface SchemePeriodComparisonInput {
  schemeId: string
  schemeName: string
  metric: string
  currentValue: number
  previousValue: number
  unit: string
  higherIsBetter?: boolean
}

export function calculatePeriodDelta(input: SchemePeriodComparisonInput): PeriodChangeItem | null {
  if (input.previousValue === 0 && input.currentValue === 0) return null

  const deltaValue = Math.round((input.currentValue - input.previousValue) * 100) / 100
  const base = input.previousValue !== 0 ? input.previousValue : 1
  const deltaPercent = Math.round((deltaValue / Math.abs(base)) * 1000) / 10

  let direction: "increased" | "decreased" | "stable" = "stable"
  if (deltaValue > 0.01) direction = "increased"
  if (deltaValue < -0.01) direction = "decreased"

  const higherIsBetter = input.higherIsBetter ?? true
  let significance: "positive" | "negative" | "neutral" = "neutral"

  if (direction === "increased") {
    significance = higherIsBetter ? "positive" : "negative"
  } else if (direction === "decreased") {
    significance = higherIsBetter ? "negative" : "positive"
  }

  const actionWord = direction === "increased" ? "increased" : direction === "decreased" ? "decreased" : "remained stable"
  const summary = `${input.metric} at ${input.schemeName} ${actionWord} by ${Math.abs(deltaPercent)}% (${input.previousValue.toLocaleString()} ${input.unit} → ${input.currentValue.toLocaleString()} ${input.unit}).`

  return {
    id: `trend-${input.schemeId}-${input.metric.toLowerCase().replace(/\s+/g, "_")}`,
    schemeId: input.schemeId,
    schemeName: input.schemeName,
    metric: input.metric,
    currentValue: input.currentValue,
    previousValue: input.previousValue,
    deltaValue,
    deltaPercent,
    unit: input.unit,
    direction,
    significance,
    summary,
  }
}
