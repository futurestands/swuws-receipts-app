import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { LinkButton } from "@/components/ui/link-button"
import { formatDateTime } from "@/lib/format"
import { setSystemErrorStatus } from "@/app/actions/system-errors"
import type { SystemError } from "@/lib/db/schema"
import { AlertTriangle } from "lucide-react"
import { ROLE_LABELS, type Role } from "@/lib/permissions/roles"

const FILTERS = [
  { id: "open", label: "Open" },
  { id: "acknowledged", label: "Seen" },
  { id: "resolved", label: "Resolved" },
  { id: "all", label: "All" },
] as const

function roleLabel(role?: string | null) {
  if (!role) return null
  return ROLE_LABELS[role as Role] || role
}

function peopleOn(row: SystemError) {
  if (row.seenBy && row.seenBy.length > 0) return row.seenBy
  if (row.userId || row.userName) {
    return [{ id: row.userId || "", name: row.userName || "Unknown", email: row.userEmail }]
  }
  return []
}

export function ErrorQueue({
  errors,
  status,
}: {
  errors: SystemError[]
  status: string
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <LinkButton
            key={filter.id}
            href={`/admin/errors?status=${filter.id}`}
            variant={status === filter.id ? "default" : "outline"}
            className="h-7 px-2.5 text-[0.8rem]"
          >
            {filter.label}
          </LinkButton>
        ))}
      </div>

      {errors.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No errors in this list"
          description="When a page crashes, it is recorded here and the bell notifies admins. Repeat hits on the same fault only raise the count."
        />
      ) : (
        <div className="space-y-3">
          {errors.map((row) => (
            <Card key={row.id}>
              <CardContent className="space-y-3 pt-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-sm break-words">{row.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.path || "Unknown page"}
                      {row.source ? ` · ${row.source}` : ""}
                    </p>
                    {(() => {
                      const people = peopleOn(row)
                      const latest = people[0]
                      if (!latest) {
                        return (
                          <p className="text-sm font-medium">
                            Who: <span className="text-muted-foreground font-normal">Not signed in</span>
                          </p>
                        )
                      }
                      const others = people.slice(1)
                      return (
                        <div className="text-sm space-y-0.5">
                          <p>
                            <span className="text-muted-foreground">Hit by </span>
                            <span className="font-semibold">{latest.name}</span>
                            {latest.email ? (
                              <span className="text-muted-foreground"> · {latest.email}</span>
                            ) : null}
                            {roleLabel(latest.role) ? (
                              <span className="text-muted-foreground"> · {roleLabel(latest.role)}</span>
                            ) : null}
                          </p>
                          {others.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Also: {others.map((p) => p.name).join(", ")}
                            </p>
                          )}
                        </div>
                      )
                    })()}
                    <p className="text-[11px] text-muted-foreground">
                      Last seen {formatDateTime(row.lastSeenAt)} · first {formatDateTime(row.firstSeenAt)} · {row.occurrenceCount} time{row.occurrenceCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Badge
                    variant={row.status === "open" ? "destructive" : "outline"}
                    className="uppercase"
                  >
                    {row.status}
                  </Badge>
                </div>

                {row.stack && (
                  <details className="rounded-md bg-muted/50 p-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                      Technical detail
                    </summary>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed">
                      {row.digest ? `Digest: ${row.digest}\n\n` : ""}
                      {row.stack}
                    </pre>
                  </details>
                )}

                <div className="flex flex-wrap gap-2">
                  {row.status === "open" && (
                    <form action={setSystemErrorStatus.bind(null, row.id, "acknowledged")}>
                      <Button type="submit" size="sm" variant="outline">
                        Mark seen
                      </Button>
                    </form>
                  )}
                  {row.status !== "resolved" && (
                    <form action={setSystemErrorStatus.bind(null, row.id, "resolved")}>
                      <Button type="submit" size="sm">
                        Resolve
                      </Button>
                    </form>
                  )}
                  {row.status === "resolved" && (
                    <form action={setSystemErrorStatus.bind(null, row.id, "open")}>
                      <Button type="submit" size="sm" variant="outline">
                        Reopen
                      </Button>
                    </form>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
