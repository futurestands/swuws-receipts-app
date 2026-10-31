import { divideRoundHalfUp, fromCents, toCents } from "./decimal"

/**
 * Non-revenue-water gate.
 *
 * NRW = system input volume - billed authorised consumption, over the SAME period and boundary.
 * It is reported only when every precondition below is evidenced; otherwise the result is
 * UNAVAILABLE with the reasons. It never fabricates a value and never clamps a negative result
 * to zero (billed > input is a data inconsistency to investigate, not "0% loss").
 *
 *   System input volume  = verified water SUPPLIED into the system (not water produced at source).
 *   Billed volume        = metered consumption of customer readings linked to a billing record of
 *                          the matching billing period (see lib/production/billed-volume.ts).
 */
export type PeriodMatch = "ONE" | "NONE" | "AMBIGUOUS"

export interface BilledVolume {
  /** Sum of eligible metered consumption, m3, two decimals. */
  volumeM3: string
  eligibleReadings: number
  /** Active customers with a meter reference. */
  meteredActiveCustomers: number
  /** Of those, customers that have an eligible reading in the period. */
  meteredCustomersWithReading: number
  /** Active customers without a meter reference: their consumption is not measured. */
  unmeteredActiveCustomers: number
}

export interface NrwInput {
  periodMatch: PeriodMatch
  production: {
    dataQualityStatus: "COMPLETE" | "PARTIAL" | "UNAVAILABLE"
    suppliedComplete: boolean
    totalWaterSuppliedM3: string
    intervalConflictCount: number
    estimatedAllocationPresent: boolean
  }
  billed: BilledVolume | null
}

export interface NrwResult {
  status: "AVAILABLE" | "UNAVAILABLE"
  percent: number | null
  systemInputM3: string | null
  billedM3: string | null
  reasons: string[]
  basis: string
  caveat: string
}

export const NRW_BASIS = "NRW % = (verified water supplied - billed metered consumption of readings linked to the matching billing period) / verified water supplied"
export const NRW_CAVEAT = "Customer meter readings carry no reading date or independent verification state; the billing period (year/month) is taken as the reading window. Unbilled authorised consumption is not separated from losses."

export function evaluateNrw(input: NrwInput): NrwResult {
  const reasons: string[] = []
  const { production, billed } = input
  if (production.dataQualityStatus !== "COMPLETE") reasons.push(`Verified production is ${production.dataQualityStatus}: system input volume does not cover every source for the whole period`)
  if (production.intervalConflictCount > 0) reasons.push(`${production.intervalConflictCount} verified meter interval(s) overlap daily records and are excluded until the conflict is resolved`)
  if (production.estimatedAllocationPresent) reasons.push("Month totals include estimated cross-month allocations; system input volume is not fully measured for this month")
  if (!production.suppliedComplete) reasons.push("Water supplied into the system is not recorded for every verified production entry (interval readings and blank supplied volumes carry no supplied volume)")
  if (input.periodMatch === "NONE") reasons.push("No billing period exists for this calendar month")
  if (input.periodMatch === "AMBIGUOUS") reasons.push("More than one billing period matches this calendar month")
  if (!billed) {
    if (input.periodMatch === "ONE") reasons.push("No billed meter-reading evidence was found for the matching billing period")
  } else {
    if (billed.eligibleReadings === 0) reasons.push("No meter readings linked to a billing record exist for the period")
    if (billed.meteredActiveCustomers === 0) reasons.push("The scheme has no active metered customers")
    if (billed.meteredCustomersWithReading < billed.meteredActiveCustomers) reasons.push(`${billed.meteredActiveCustomers - billed.meteredCustomersWithReading} of ${billed.meteredActiveCustomers} active metered customers have no billed reading for the period`)
    if (billed.unmeteredActiveCustomers > 0) reasons.push(`${billed.unmeteredActiveCustomers} active customer(s) have no meter reference; their authorised consumption is unmeasured`)
  }

  let systemInputM3: string | null = null
  let billedM3: string | null = null
  let percent: number | null = null
  if (!reasons.length && billed) {
    const input = toCents(production.totalWaterSuppliedM3)
    const sold = toCents(billed.volumeM3)
    systemInputM3 = fromCents(input)
    billedM3 = fromCents(sold)
    if (input <= BigInt(0)) reasons.push("Verified water supplied is zero")
    else if (sold > input) reasons.push("Billed consumption exceeds system input volume: the data are inconsistent and must be investigated, not reported as zero loss")
    else percent = Number(divideRoundHalfUp((input - sold) * BigInt(1000), input)) / 10
  }
  const available = reasons.length === 0 && percent !== null
  return { status: available ? "AVAILABLE" : "UNAVAILABLE", percent: available ? percent : null, systemInputM3: available ? systemInputM3 : null, billedM3: available ? billedM3 : billed ? billed.volumeM3 : null, reasons, basis: NRW_BASIS, caveat: NRW_CAVEAT }
}
