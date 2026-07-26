import type { LucideIcon } from "lucide-react"
import { Inbox } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center sm:py-16",
        className
      )}
    >
      <div className="rounded-full bg-muted p-3 text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <div className="max-w-sm">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/**
 * Skeleton placeholder shown while a screen's data is loading. `rows`
 * controls how many skeleton lines to render for the "table"/"list"
 * variants.
 */
function LoadingState({
  variant = "table",
  rows = 5,
  className,
}: {
  variant?: "table" | "cards" | "text"
  rows?: number
  className?: string
}) {
  if (variant === "cards") {
    return (
      <div
        data-slot="loading-state"
        className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}
      >
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    )
  }

  if (variant === "text") {
    return (
      <div data-slot="loading-state" className={cn("flex flex-col gap-2", className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full max-w-md" />
        ))}
      </div>
    )
  }

  return (
    <div data-slot="loading-state" className={cn("flex flex-col gap-2", className)}>
      <Skeleton className="h-9 w-full rounded-lg" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full rounded-lg" />
      ))}
    </div>
  )
}

export { EmptyState, LoadingState }
