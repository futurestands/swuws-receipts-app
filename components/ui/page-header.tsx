import { cn } from "@/lib/utils"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

/**
 * Top-of-page title block. Title + optional description on the left,
 * actions on the right - stacks to a single column on narrow screens
 * instead of squeezing the action buttons against the title.
 */
function PageHeader({
  title,
  description,
  actions,
  backHref,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  backHref?: string
  className?: string
}) {
  return (
    <div
      data-slot="page-header"
      className={cn(
        "mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          {backHref && (
            <Link
              href={backHref}
              className="group flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
              title="Go back"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            </Link>
          )}
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {title}
          </h1>
        </div>
        {description && (
          <p className={cn("mt-1 max-w-2xl text-sm text-muted-foreground", backHref && "ml-12")}>{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  )
}

/**
 * Smaller header for a subsection within a page (above a table, a card
 * group, etc). Same left/right-stacks-to-column pattern as PageHeader,
 * scaled down.
 */
function SectionHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="section-header"
      className={cn(
        "mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="text-base font-medium text-foreground">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export { PageHeader, SectionHeader }
