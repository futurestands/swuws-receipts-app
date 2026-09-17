const COUNT_FORMAT = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 })

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const

export function formatCount(value: number) {
  return COUNT_FORMAT.format(Math.round(Number(value) || 0))
}

export function formatCurrency(amount: number, currency = "UGX"): string {
  const n = formatCount(amount)
  return currency === "UGX" ? `USh ${n}` : `${currency} ${n}`
}

/** Legacy alias */
export const formatUGX = formatCurrency

function pad2(n: number) {
  return String(n).padStart(2, "0")
}

function utcParts(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null
  return {
    day: d.getUTCDate(),
    month: MONTHS[d.getUTCMonth()],
    year: d.getUTCFullYear(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  }
}

/** Fixed UTC calendar stamp. Avoids Node vs browser Intl ("Sep" vs "Sept"). */
export function formatDateTime(date: Date | string): string {
  const p = utcParts(date)
  if (!p) return ""
  return `${pad2(p.day)} ${p.month} ${p.year}, ${pad2(p.hour)}:${pad2(p.minute)}`
}

export function formatDate(date: Date | string): string {
  const p = utcParts(date)
  if (!p) return ""
  return `${pad2(p.day)} ${p.month} ${p.year}`
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100)
}
