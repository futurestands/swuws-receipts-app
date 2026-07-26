import { cn } from "@/lib/utils"

/**
 * Row of filter controls (search input, selects, date range, etc). Wraps to
 * multiple lines on narrow viewports rather than overflowing horizontally
 * or squeezing each control unreadably small. Pass each filter control as a
 * child; an optional trailing action (e.g. "Clear filters") can go in
 * `trailing` and will be pushed to the end of the row / its own line.
 */
function ResponsiveFilterBar({
  children,
  trailing,
  className,
}: {
  children: React.ReactNode
  trailing?: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="filter-bar"
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3",
        className
      )}
    >
      {children}
      {trailing && <div className="ml-auto flex items-center gap-2">{trailing}</div>}
    </div>
  )
}

export { ResponsiveFilterBar }
