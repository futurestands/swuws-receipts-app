export type BillingCalculation = {
  previousReading: number
  currentReading: number
  consumption: number
  waterCharge: number
  serviceFee: number
  vatAmount: number
  totalNewBill: number
  unitPrice: number
}

/**
 * Shared Billing Logic: (Consumption * Rate) + Service Fee + VAT
 * This utility is separate from Server Actions so it can be used safely in Client Components.
 */
export function calculateBill(
  prev: number,
  current: number,
  tariff: { unitPrice: number; serviceFee: number; vatPercentage: number }
): BillingCalculation {
  const consumption = Math.max(0, current - prev)
  const waterCharge = consumption * tariff.unitPrice
  const serviceFee = tariff.serviceFee
  const subtotal = waterCharge + serviceFee
  const vatAmount = Math.round(subtotal * (tariff.vatPercentage / 100))

  return {
    previousReading: prev,
    currentReading: current,
    consumption,
    waterCharge,
    serviceFee,
    vatAmount,
    totalNewBill: subtotal + vatAmount,
    unitPrice: tariff.unitPrice
  }
}
