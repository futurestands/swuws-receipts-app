export function formatCurrency(amount: number, currency = "UGX"): string {
  return new Intl.NumberFormat(currency === "UGX" ? "en-UG" : "en-US", {
    style: "currency",
    currency: currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

/** Legacy alias */
export const formatUGX = formatCurrency

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC", // Force UTC to prevent hydration mismatch
  }).format(d)
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC", // Force UTC to prevent hydration mismatch
  }).format(d)
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100)
}
