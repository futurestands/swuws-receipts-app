/** Date-only input: never interpret midnight in the browser or server's local timezone. */
export function parseSmsDueDate(raw?: string | null) {
  if (!raw?.trim()) return null
  const value = raw.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Choose a valid payment due date (DD/MM/YYYY)")
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(`${value}T12:00:00.000Z`)
  if (year < 1900 || year > 9999 || !Number.isFinite(date.getTime()) || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Choose a valid payment due date (DD/MM/YYYY)")
  }
  return { iso: value, display: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date) }
}

/** Used for both composition preview and the immutable saved SMS body. */
export function applySmsDueDate(content: string, raw?: string | null, appendDeadline = false) {
  const date = parseSmsDueDate(raw)
  const hasPlaceholder = /\{\{\s*due_date\s*\}\}/.test(content)
  if (hasPlaceholder && !date) throw new Error("This message template requires a payment due date. Enter it before creating the list.")
  const message = content.replace(/\{\{\s*due_date\s*\}\}/g, date?.display || "")
  return date && appendDeadline && !hasPlaceholder ? `${message}\nPlease pay by ${date.display}.` : message
}
