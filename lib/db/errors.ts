import "server-only"

/**
 * node-postgres attaches the real Postgres error code to thrown errors as
 * `.code` (e.g. "23505" for unique_violation). Checking it lets call sites
 * distinguish "this specific, expected failure" from "something else broke"
 * instead of collapsing every catch into one misleading message.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  )
}
