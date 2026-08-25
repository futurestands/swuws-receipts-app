/**
 * Centralized utility for handling customer categories.
 * Ensures "psp" and "public" are treated as the same category.
 */

export function normalizeCategory(cat: string | null | undefined): string {
  if (!cat) return "domestic"
  const c = cat.trim().toLowerCase()
  // "Public" and "PSP" are functionally equivalent in SWUWS business logic
  if (c === "public" || c === "public standpost" || c === "publicstandpost") return "psp"
  return c
}

/**
 * Returns a list of equivalent category codes for database queries.
 */
export function getCategoryEquivalents(cat: string): string[] {
  const normalized = normalizeCategory(cat)
  if (normalized === "psp") return ["psp", "public", "public standpost"]
  return [normalized]
}
