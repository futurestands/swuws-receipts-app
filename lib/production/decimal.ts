/**
 * Exact fixed-point arithmetic for production measurements.
 *
 * All production quantities are stored as numeric(_, 2). Floating point is never used to
 * derive a stored measurement: values are converted to integer hundredths (BigInt), combined
 * exactly, and rounded half-up once at the end. PostgreSQL's round(numeric, 2) rounds half away
 * from zero, which is identical for the non-negative values handled here, so the application
 * result matches the CHECK constraints in migration 0075 bit-for-bit.
 */
const ZERO = BigInt(0)
const ONE = BigInt(1)
const TWO = BigInt(2)
const HUNDRED = BigInt(100)

export type MeterUnit = "m3" | "litres" | "gallons"

/** Metric volume factor as an exact rational number (numerator / denominator). */
export const UNIT_FACTOR: Record<MeterUnit, { numerator: bigint; denominator: bigint }> = {
  m3: { numerator: ONE, denominator: ONE },
  litres: { numerator: ONE, denominator: BigInt(1000) },
  // 1 US gallon = 0.00378541 m3 (same constant as the SQL check in migration 0075).
  gallons: { numerator: BigInt(378541), denominator: BigInt(100000000) },
}

export class MeterReadingError extends Error {}

/** "123.4" | "123.45" | "0" -> 12340n | 12345n | 0n. Rejects anything that is not a plain non-negative decimal. */
export function toCents(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match) throw new MeterReadingError(`"${value}" is not a plain non-negative decimal with at most two places`)
  return BigInt(match[1]) * HUNDRED + BigInt((match[2] ?? "").padEnd(2, "0") || "0")
}

export function fromCents(cents: bigint): string {
  const negative = cents < ZERO
  const abs = negative ? -cents : cents
  const whole = abs / HUNDRED
  const fraction = (abs % HUNDRED).toString().padStart(2, "0")
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`
}

/** Half-up integer division for a non-negative numerator and positive denominator. */
export function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= ZERO) throw new MeterReadingError("Division by a non-positive denominator")
  if (numerator < ZERO) throw new MeterReadingError("Negative quantity cannot be allocated")
  return (numerator * TWO + denominator) / (denominator * TWO)
}

/**
 * Cumulative-meter difference in hundredths of the meter's own unit.
 *
 *  - Normal reading (closing >= opening, no reset):  closing - opening. A rollover value is not allowed.
 *  - Rollover (closing < opening) or reset:          rollover - opening + closing, where `rollover`
 *    is the last reading before the meter wrapped/was replaced. It is mandatory and must be >= opening.
 *
 * A negative difference is never silently turned into zero or a positive number.
 */
export function meterDeltaCents(openingReading: string, closingReading: string, rolloverValue: string | null, isReset: boolean): bigint {
  const opening = toCents(openingReading)
  const closing = toCents(closingReading)
  const wrapped = isReset || closing < opening
  if (!wrapped) {
    if (rolloverValue !== null) throw new MeterReadingError("A rollover value applies only when the closing reading is below the opening reading or the meter was reset")
    return closing - opening
  }
  if (rolloverValue === null) throw new MeterReadingError("Closing reading is below the opening reading (or the meter was reset): the last reading before rollover/reset is required")
  const rollover = toCents(rolloverValue)
  if (rollover < opening) throw new MeterReadingError("The rollover/reset reading cannot be below the opening reading")
  return rollover - opening + closing
}

/** delta (hundredths of meter unit) x multiplier (hundredths) x unit factor -> hundredths of m3. */
export function intervalVolumeCents(deltaCents: bigint, multiplier: string, unit: MeterUnit): bigint {
  const factor = UNIT_FACTOR[unit]
  return divideRoundHalfUp(deltaCents * toCents(multiplier) * factor.numerator, HUNDRED * factor.denominator)
}

/** delta (hundredths of kWh) x multiplier (hundredths) -> hundredths of kWh. */
export function electricityKwhCents(deltaCents: bigint, multiplier: string): bigint {
  return divideRoundHalfUp(deltaCents * toCents(multiplier), HUNDRED)
}

/** Fuel balance: opening + purchased + transfers in - transfers out + adjustments - closing, or null when a stock reading is missing. */
export function fuelConsumedCents(input: {
  openingStockLitres: string | null
  closingStockLitres: string | null
  fuelPurchasedLitres: string | null
  fuelTransfersInLitres: string | null
  fuelTransfersOutLitres: string | null
  fuelAdjustmentsLitres: string | null
}): bigint | null {
  // Fuel purchased is NOT fuel consumed: without both stock readings consumption is unknown, never zero and never = purchases.
  if (input.openingStockLitres === null || input.closingStockLitres === null) return null
  const n = (v: string | null) => (v === null ? ZERO : toCents(v))
  return toCents(input.openingStockLitres) + n(input.fuelPurchasedLitres) + n(input.fuelTransfersInLitres) - n(input.fuelTransfersOutLitres) + n(input.fuelAdjustmentsLitres) - toCents(input.closingStockLitres)
}
