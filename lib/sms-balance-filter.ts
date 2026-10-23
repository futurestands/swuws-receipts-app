import { sql, type SQLWrapper } from "drizzle-orm"

export type SmsBalanceFilter = { minBalance?: string; maxBalance?: string; category?: string }

export function parseSmsBalanceFilter(input: SmsBalanceFilter) {
  function amount(raw: string | undefined, label: string) {
    if (raw === undefined || raw.trim() === "") return undefined
    if (!/^\d+(?:\.\d{1,2})?$/.test(raw.trim())) throw new Error(`${label} must be a non-negative UGX amount with up to two decimal places`)
    const value = Number(raw)
    if (!Number.isFinite(value) || value > 9999999999.99) throw new Error(`${label} is too large`)
    return value
  }
  const min = amount(input.minBalance, "Minimum balance")
  const max = amount(input.maxBalance, "Maximum balance")
  if (min !== undefined && max !== undefined && min > max) throw new Error("Minimum balance cannot exceed maximum balance")
  return { min, max, demandsOnly: (input.category || "Bill Reminders") === "Bill Reminders" }
}

/** Shared by audience count and draft creation; uses the same live balance as the SMS. */
export function smsBalanceConditions(column: SQLWrapper, input: SmsBalanceFilter) {
  const range = parseSmsBalanceFilter(input)
  const conditions = []
  if (range.demandsOnly) conditions.push(sql`${column} > 0`)
  if (range.min !== undefined) conditions.push(sql`${column} >= ${range.min}`)
  if (range.max !== undefined) conditions.push(sql`${column} <= ${range.max}`)
  return conditions
}
