/** Database numeric inputs remain unknown unless explicitly finite and nonnegative. */
export function nonNegativeNumber(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value.trim()))) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export interface WaterBalanceValidationInput {
  waterProducedM3: number
  waterBilledSoldM3: number
  loggedDaysCount: number
  daysInPeriod: number
  practicalCapacityM3Period: number
  salesAvailable?: boolean
}

export interface WaterBalanceValidationResult {
  unbilledLossM3: number
  rawCalculatedLossIndicator: number
  displayLossIndicator: string
  lossValidationStatus: "VALID" | "DATA_INCONSISTENCY" | "INCOMPLETE_DATA"
  capacityUtilizationPercent: number
  dataQualityIssues: string[]
  completenessPercent: number
}

export function validateWaterBalanceAndCapacity(
  input: WaterBalanceValidationInput
): WaterBalanceValidationResult {
  const issues: string[] = []
  const completenessPercent = Math.min(
    100,
    input.daysInPeriod > 0 ? Math.round((input.loggedDaysCount / input.daysInPeriod) * 100) : 0
  )

  // 1. Loss Indicator Calculation (Preserve Raw Negative Result)
  const unbilledLossM3 = input.waterProducedM3 - input.waterBilledSoldM3
  let rawCalculatedLossIndicator = 0
  if (input.waterProducedM3 > 0) {
    rawCalculatedLossIndicator =
      Math.round(((input.waterProducedM3 - input.waterBilledSoldM3) / input.waterProducedM3) * 1000) / 10
  }

  let lossValidationStatus: "VALID" | "DATA_INCONSISTENCY" | "INCOMPLETE_DATA" = "VALID"
  let displayLossIndicator = input.waterProducedM3 > 0 ? `${rawCalculatedLossIndicator}%` : "Unavailable: zero or missing verified production"
  if (input.waterProducedM3 <= 0) {
    lossValidationStatus = "INCOMPLETE_DATA"
    issues.push("Production-to-sales ratio unavailable: recorded zero or missing production gives a zero denominator")
  }

  if (input.waterBilledSoldM3 > input.waterProducedM3 && input.waterProducedM3 > 0) {
    lossValidationStatus = "DATA_INCONSISTENCY"
    displayLossIndicator = `${rawCalculatedLossIndicator}% (Inconsistent)`
    issues.push(
      `Data Inconsistency: Recorded water sold (${input.waterBilledSoldM3.toLocaleString()} m³) exceeds recorded production (${input.waterProducedM3.toLocaleString()} m³); requires verification.`
    )
  }

  if (completenessPercent < 70) {
    lossValidationStatus = "INCOMPLETE_DATA"
    issues.push(
      `Incomplete Logging: Only ${input.loggedDaysCount} of ${input.daysInPeriod} days recorded (${completenessPercent}% complete); insufficient data for reliable assessment.`
    )
  }

  if (input.salesAvailable === false) {
    lossValidationStatus = "INCOMPLETE_DATA"
    displayLossIndicator = "Unresolved: water sales observations missing"
    issues.push("Sales data unavailable; missing readings are not observed zero sales")
  }

  // 2. Normalized Capacity Utilization
  let capacityUtilizationPercent = 0
  if (input.practicalCapacityM3Period > 0) {
    capacityUtilizationPercent =
      Math.round((input.waterProducedM3 / input.practicalCapacityM3Period) * 1000) / 10
  }

  if (input.waterProducedM3 > input.practicalCapacityM3Period * 1.5 && input.practicalCapacityM3Period > 0) {
    issues.push(
      `Performance Deviation: Recorded production (${input.waterProducedM3.toLocaleString()} m³) significantly exceeds rated capacity (${input.practicalCapacityM3Period.toLocaleString()} m³); verify bulk meter calibration.`
    )
  }

  return {
    unbilledLossM3,
    rawCalculatedLossIndicator,
    displayLossIndicator,
    lossValidationStatus,
    capacityUtilizationPercent,
    dataQualityIssues: issues,
    completenessPercent,
  }
}
