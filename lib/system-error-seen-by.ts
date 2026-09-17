export type ErrorSeenBy = {
  id: string
  name: string
  email?: string | null
  role?: string | null
}

const MAX_SEEN_BY = 20

export function mergeSeenBy(
  existing: ErrorSeenBy[] | null | undefined,
  person: ErrorSeenBy | null | undefined
): ErrorSeenBy[] {
  const list = Array.isArray(existing) ? existing.filter((row) => row?.id) : []
  if (!person?.id) return list.slice(0, MAX_SEEN_BY)

  const next = list.filter((row) => row.id !== person.id)
  next.unshift({
    id: person.id,
    name: person.name,
    email: person.email || null,
    role: person.role || null,
  })
  return next.slice(0, MAX_SEEN_BY)
}
